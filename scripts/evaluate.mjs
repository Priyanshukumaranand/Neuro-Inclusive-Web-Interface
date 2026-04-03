import fs from "node:fs/promises";

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const INPUT_FILE = "docs/evaluation/synthetic-suite.json";
const OUT_FILE = "docs/evaluation/latest-results.json";

function splitWords(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function splitSentences(text) {
  return text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 2) return 1;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.endsWith("e")) n = Math.max(1, n - 1);
  return n;
}

function metrics(text) {
  const words = splitWords(text);
  const sents = splitSentences(text);
  const syllables = words.reduce((a, w) => a + countSyllables(w), 0);
  const avgWps = words.length / Math.max(sents.length, 1);
  const avgSyl = syllables / Math.max(words.length, 1);
  const complexity = avgWps * 0.7 + avgSyl * 20;
  return { words: words.length, sents: sents.length, avgWps, avgSyl, complexity };
}

function percentDelta(before, after) {
  if (before === 0) return 0;
  return ((after - before) / before) * 100;
}

async function simplify(text) {
  const r = await fetch(`${API_BASE}/api/simplify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(`Simplify failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.simplified || "";
}

async function summarize(text, mode) {
  const r = await fetch(`${API_BASE}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode }),
  });
  if (!r.ok) throw new Error(`Summarize failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.summary || "";
}

async function main() {
  const suite = JSON.parse(await fs.readFile(INPUT_FILE, "utf8"));
  const perCase = [];
  let passed = 0;

  for (const item of suite) {
    const before = metrics(item.input);
    const simplified = await simplify(item.input);
    const after = metrics(simplified);
    const tldr = await summarize(item.input, "tldr");

    const cDelta = percentDelta(before.complexity, after.complexity);
    const wpsDelta = percentDelta(before.avgWps, after.avgWps);
    const improved = cDelta < -8 || wpsDelta < -8;
    if (improved) passed++;

    perCase.push({
      id: item.id,
      category: item.category,
      improved,
      inputMetrics: before,
      outputMetrics: after,
      complexityDeltaPct: Number(cDelta.toFixed(2)),
      avgWordsPerSentenceDeltaPct: Number(wpsDelta.toFixed(2)),
      tldrLength: splitWords(tldr).length,
      simplifiedPreview: simplified.slice(0, 180),
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    totalCases: suite.length,
    improvedCases: passed,
    improvementRate: Number(((passed / suite.length) * 100).toFixed(2)),
    meanComplexityDeltaPct: Number(
      (perCase.reduce((a, c) => a + c.complexityDeltaPct, 0) / perCase.length).toFixed(2)
    ),
    meanAvgWordsPerSentenceDeltaPct: Number(
      (perCase.reduce((a, c) => a + c.avgWordsPerSentenceDeltaPct, 0) / perCase.length).toFixed(2)
    ),
    failureCriteria: "Case is not improved if complexity and sentence length both reduce by <8%",
  };

  await fs.writeFile(OUT_FILE, JSON.stringify({ summary, perCase }, null, 2), "utf8");
  console.log(`Saved evaluation output to ${OUT_FILE}`);
  console.log(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
