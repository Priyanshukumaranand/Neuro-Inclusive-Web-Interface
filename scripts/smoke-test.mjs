/**
 * Smoke test: hit all 4 API routes + /health and report results.
 * Run with: node scripts/smoke-test.mjs
 */
const BASE = "http://localhost:3000";

const SAMPLE_TEXT =
  "Photosynthesis is the intricate biochemical process by which chlorophyll-bearing organisms " +
  "convert radiant energy into chemical energy stored as adenosine triphosphate (ATP), " +
  "ultimately synthesizing glucose and oxygen from carbon dioxide and water.";

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, ok: res.ok, ...json };
}

async function run() {
  console.log("=== Neuro-Inclusive API Smoke Test ===\n");

  // Health
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  console.log("[/health]", JSON.stringify(health));
  console.log();

  // Simplify
  console.log("[/api/simplify] sending text...");
  const simplify = await post("/api/simplify", { text: SAMPLE_TEXT });
  console.log("  status:", simplify.status ?? "ok");
  if (simplify.mock) console.log("  ⚠ mock (no Gemini key):", simplify.reason);
  console.log("  simplified:", (simplify.simplified ?? simplify.error ?? "").slice(0, 200));
  console.log();

  // Summarize (TL;DR)
  console.log("[/api/summarize] sending text (mode=tldr)...");
  const summarize = await post("/api/summarize", { text: SAMPLE_TEXT, mode: "tldr" });
  console.log("  status:", summarize.status ?? "ok");
  if (summarize.mock) console.log("  ⚠ mock:", summarize.reason);
  console.log("  summary:", (summarize.summary ?? summarize.error ?? "").slice(0, 200));
  console.log();

  // Cognitive Load Score
  console.log("[/api/cognitive-load] sending text + dom stats...");
  const cogLoad = await post("/api/cognitive-load", {
    text: SAMPLE_TEXT,
    domStats: { images: 5, iframes: 1, videos: 0, buttons: 12, links: 40, maxDepthSample: 15 },
  });
  console.log("  status:", cogLoad.status ?? "ok");
  if (cogLoad.mock) console.log("  ⚠ mock:", cogLoad.reason);
  console.log("  score:", cogLoad.score, "| reason:", (cogLoad.reason ?? "").slice(0, 150));
  console.log();

  // Define (hover-to-explain)
  console.log("[/api/define] defining 'adenosine triphosphate'...");
  const define = await post("/api/define", { text: "adenosine triphosphate" });
  console.log("  status:", define.status ?? "ok");
  if (define.mock) console.log("  ⚠ mock:", define.reason);
  console.log("  definition:", (define.definition ?? define.error ?? "").slice(0, 200));
  console.log();

  console.log("=== Smoke test complete ===");
}

run().catch((e) => {
  console.error("Test failed:", e.message);
  process.exit(1);
});
