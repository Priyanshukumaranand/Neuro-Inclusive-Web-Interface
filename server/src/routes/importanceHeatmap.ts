import { Router } from "express";
import { getModel, isGeminiConfigured } from "../lib/gemini.js";
import {
  importanceHeatmapSystem,
  importanceHeatmapUser,
} from "../lib/prompts.js";

const router = Router();
const MAX_TEXT_IN = 12000;
const MAX_BLOCKS = 24;
const MAX_BLOCK_TEXT = 440;

type NodeCategory =
  | "main-content"
  | "navigation"
  | "ads"
  | "popup"
  | "sidebar"
  | "dense-text"
  | "other";

type ImportanceCandidate = {
  id: string;
  text: string;
  category: NodeCategory;
  relevance: number;
  visibility: number;
  difficultTermsCount: number;
};

type ImportanceScore = {
  id: string;
  score: number;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeCategory(input: unknown): NodeCategory {
  const raw = typeof input === "string" ? input : "other";
  if (
    raw === "main-content" ||
    raw === "navigation" ||
    raw === "ads" ||
    raw === "popup" ||
    raw === "sidebar" ||
    raw === "dense-text" ||
    raw === "other"
  ) {
    return raw;
  }
  return "other";
}

function toNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sanitizeCandidates(input: unknown): ImportanceCandidate[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const out: ImportanceCandidate[] = [];

  for (const raw of input) {
    const obj = asObject(raw);
    if (!obj) continue;

    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!id || seen.has(id)) continue;

    const text = typeof obj.text === "string" ? obj.text.replace(/\s+/g, " ").trim() : "";
    if (!text) continue;

    out.push({
      id,
      text: text.slice(0, MAX_BLOCK_TEXT),
      category: normalizeCategory(obj.category),
      relevance: clamp(toNumber(obj.relevance, 0), 0, 500),
      visibility: clamp(toNumber(obj.visibility, 0), 0, 1),
      difficultTermsCount: clamp(Math.round(toNumber(obj.difficultTermsCount, 0)), 0, 100),
    });
    seen.add(id);

    if (out.length >= MAX_BLOCKS) break;
  }

  return out;
}

function categoryBoost(category: NodeCategory): number {
  if (category === "main-content") return 28;
  if (category === "dense-text") return 20;
  if (category === "other") return 8;
  if (category === "sidebar") return -12;
  if (category === "navigation") return -24;
  if (category === "ads") return -32;
  if (category === "popup") return -38;
  return 0;
}

function heuristicImportance(candidates: ImportanceCandidate[]): ImportanceScore[] {
  const scored = candidates.map((candidate) => {
    const words = candidate.text.split(/\s+/).filter(Boolean).length;
    let score =
      candidate.relevance * 0.44 +
      candidate.visibility * 34 +
      Math.min(34, words * 0.46) +
      Math.min(18, candidate.difficultTermsCount * 2.7) +
      categoryBoost(candidate.category);

    if (words < 18) score -= 12;

    return {
      id: candidate.id,
      score: clamp(Math.round(score), 0, 100),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

function stripJsonFence(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

function parseAiImportance(raw: string, candidateIds: Set<string>): ImportanceScore[] | null {
  const cleaned = stripJsonFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const obj = asObject(parsed);
  if (!obj || !Array.isArray(obj.importance)) return null;

  const out: ImportanceScore[] = [];
  const used = new Set<string>();

  for (const item of obj.importance) {
    const part = asObject(item);
    if (!part) continue;

    const id = typeof part.id === "string" ? part.id.trim() : "";
    if (!id || used.has(id) || !candidateIds.has(id)) continue;

    const numeric = toNumber(part.score, Number.NaN);
    if (!Number.isFinite(numeric)) continue;

    out.push({ id, score: clamp(Math.round(numeric), 0, 100) });
    used.add(id);
  }

  return out;
}

function mergeImportanceScores(
  heuristic: ImportanceScore[],
  ai: ImportanceScore[]
): ImportanceScore[] {
  const heuristicById = new Map(heuristic.map((item) => [item.id, item.score]));
  const aiById = new Map(ai.map((item) => [item.id, item.score]));

  const merged: ImportanceScore[] = [];
  for (const item of heuristic) {
    const heuristicScore = heuristicById.get(item.id) ?? 0;
    const aiScore = aiById.get(item.id);
    const score =
      aiScore == null
        ? heuristicScore
        : clamp(Math.round(aiScore * 0.78 + heuristicScore * 0.22), 0, 100);

    merged.push({ id: item.id, score });
  }

  return merged.sort((a, b) => b.score - a.score);
}

router.post("/", async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const clipped = text.slice(0, MAX_TEXT_IN).trim();
    const candidates = sanitizeCandidates(req.body?.blocks);

    if (!clipped) {
      return res.status(400).json({ error: "Missing text" });
    }
    if (!candidates.length) {
      return res.status(400).json({ error: "Missing blocks" });
    }

    const domStats = req.body?.domStats;
    const domHint = domStats && typeof domStats === "object" ? JSON.stringify(domStats) : "unknown";

    const heuristic = heuristicImportance(candidates);

    if (!isGeminiConfigured()) {
      return res.json({
        importance: heuristic,
        reason: "GEMINI_API_KEY not set - using heuristic fallback",
        mock: true,
      });
    }

    try {
      const model = getModel();
      const candidatePayload = JSON.stringify(
        candidates.map((item) => ({
          id: item.id,
          category: item.category,
          relevance: item.relevance,
          visibility: Number(item.visibility.toFixed(2)),
          difficultTermsCount: item.difficultTermsCount,
          text: item.text,
        }))
      );

      const result = await model.generateContent(
        `${importanceHeatmapSystem}\n\n${importanceHeatmapUser(clipped, domHint, candidatePayload)}`
      );
      const raw = result.response.text().trim();

      if (!raw) {
        return res.json({
          importance: heuristic,
          reason: "Gemini returned empty output - using heuristic fallback",
          mock: true,
        });
      }

      const parsedAi = parseAiImportance(
        raw,
        new Set<string>(candidates.map((item) => item.id))
      );

      if (!parsedAi || parsedAi.length === 0) {
        return res.json({
          importance: heuristic,
          reason: "Gemini output invalid JSON - using heuristic fallback",
          mock: true,
        });
      }

      const merged = mergeImportanceScores(heuristic, parsedAi);
      return res.json({
        importance: merged,
        reason: "AI-ranked importance blended with heuristic stability",
      });
    } catch {
      console.warn("importanceHeatmap: Gemini failed, using fallback");
      return res.json({
        importance: heuristic,
        reason: "Gemini unavailable - using heuristic fallback",
        mock: true,
      });
    }
  } catch (e) {
    console.error("importanceHeatmap", e);
    return res.json({
      importance: [],
      reason: "Server error - unable to score importance",
      mock: true,
    });
  }
});

export default router;
