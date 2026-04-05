/**
 * Tests for server API routes — validates response shapes and fallback behavior.
 * Requires server running on localhost:3000.
 * Run: node --loader tsx tests/test-api.ts
 */

const API = process.env.API_BASE || "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

async function run() {
  console.log("\n=== API Route Tests ===\n");

  // Health
  {
    const r = await fetch(`${API}/health`);
    const d = (await r.json()) as { ok?: boolean; gemini?: boolean };
    assert(r.ok, "GET /health → 200");
    assert(d.ok === true, "/health → ok: true");
    assert(typeof d.gemini === "boolean", "/health → gemini is boolean");
  }

  // Simplify: missing text → 400
  {
    const r = await fetch(`${API}/api/simplify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(r.status === 400, "POST /api/simplify empty → 400");
  }

  // Simplify: valid text → 200 (may be mock)
  {
    const r = await fetch(`${API}/api/simplify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "The quick brown fox jumps over the lazy dog.",
      }),
    });
    assert(r.ok, "POST /api/simplify with text → 200");
    const d = (await r.json()) as { simplified?: string; mock?: boolean };
    assert(typeof d.simplified === "string", "Response has simplified text");
    assert(d.simplified!.length > 0, "Simplified text is non-empty");
  }

  // Summarize: missing text → 400
  {
    const r = await fetch(`${API}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "tldr" }),
    });
    assert(r.status === 400, "POST /api/summarize empty → 400");
  }

  // Summarize tldr: valid text → 200
  {
    const r = await fetch(`${API}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "The quick brown fox jumps over the lazy dog. It was a beautiful day.",
        mode: "tldr",
      }),
    });
    assert(r.ok, "POST /api/summarize tldr → 200");
    const d = (await r.json()) as { summary?: string; mode?: string };
    assert(typeof d.summary === "string", "TL;DR has summary text");
    assert(d.mode === "tldr", "Mode is tldr");
  }

  // Summarize bullets: valid text → 200
  {
    const r = await fetch(`${API}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "First point here. Second point here. Third point here.",
        mode: "bullets",
      }),
    });
    assert(r.ok, "POST /api/summarize bullets → 200");
    const d = (await r.json()) as { summary?: string; mode?: string };
    assert(typeof d.summary === "string", "Bullets has summary text");
    assert(d.mode === "bullets", "Mode is bullets");
  }

  // Cognitive load: missing text → 400
  {
    const r = await fetch(`${API}/api/cognitive-load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(r.status === 400, "POST /api/cognitive-load empty → 400");
  }

  // Cognitive load: valid text → 200
  {
    const r = await fetch(`${API}/api/cognitive-load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Simple sentence. Another one. Easy to read.",
        domStats: { images: 5, iframes: 0, videos: 0, buttons: 3, links: 10, maxDepthSample: 5 },
      }),
    });
    assert(r.ok, "POST /api/cognitive-load with text → 200");
    const d = (await r.json()) as { score?: number; reason?: string };
    assert(typeof d.score === "number", "Response has numeric score");
    assert(d.score! >= 0 && d.score! <= 100, "Score in [0, 100]");
    assert(typeof d.reason === "string", "Response has reason string");
  }

  // Importance heatmap: missing text → 400
  {
    const r = await fetch(`${API}/api/importance-heatmap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          {
            id: "b-1",
            text: "Some text",
            category: "main-content",
            relevance: 80,
            visibility: 0.9,
            difficultTermsCount: 1,
          },
        ],
      }),
    });
    assert(r.status === 400, "POST /api/importance-heatmap missing text → 400");
  }

  // Importance heatmap: valid payload → 200
  {
    const r = await fetch(`${API}/api/importance-heatmap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "This article explains React state, effects, and performance tradeoffs.",
        domStats: {
          images: 3,
          iframes: 0,
          videos: 0,
          buttons: 4,
          links: 12,
          maxDepthSample: 6,
        },
        blocks: [
          {
            id: "b-1",
            text: "React state lets components update the UI based on data changes and user actions.",
            category: "main-content",
            relevance: 92,
            visibility: 0.95,
            difficultTermsCount: 2,
          },
          {
            id: "b-2",
            text: "Related articles and popular tags are listed in the sidebar.",
            category: "sidebar",
            relevance: 28,
            visibility: 0.6,
            difficultTermsCount: 0,
          },
        ],
      }),
    });
    assert(r.ok, "POST /api/importance-heatmap with payload → 200");
    const d = (await r.json()) as {
      importance?: Array<{ id?: string; score?: number }>;
      reason?: string;
    };
    assert(Array.isArray(d.importance), "Importance response has array");
    assert((d.importance ?? []).length > 0, "Importance array is non-empty");
    assert(typeof d.importance?.[0]?.id === "string", "Importance item has id");
    assert(typeof d.importance?.[0]?.score === "number", "Importance item has score");
    assert(typeof d.reason === "string", "Importance response has reason string");
  }

  // Define: missing text → 400
  {
    const r = await fetch(`${API}/api/define`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(r.status === 400, "POST /api/define empty → 400");
  }

  // Define: valid text → 200
  {
    const r = await fetch(`${API}/api/define`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "adenosine triphosphate" }),
    });
    assert(r.ok, "POST /api/define with text → 200");
    const d = (await r.json()) as { definition?: string };
    assert(typeof d.definition === "string", "Response has definition string");
    assert((d.definition ?? "").trim().length > 0, "Definition text is non-empty");
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
