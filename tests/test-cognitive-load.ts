/**
 * Lightweight test runner — no dependencies needed.
 * Tests the shared cognitive-load heuristics and profile mappings.
 * Run: node --loader tsx tests/test-cognitive-load.ts
 */

// Import the source directly (works with tsx loader)
import { computeCognitiveLoad } from "../extension/src/shared/cognitiveLoad.js";
import type { DomStats } from "../extension/src/shared/messages.js";

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

function assertRange(value: number, min: number, max: number, label: string) {
  assert(
    value >= min && value <= max,
    `${label}: ${value} in [${min}, ${max}]`
  );
}

console.log("\n=== Cognitive Load Tests ===\n");

// Test 1: Empty text gives score 0
{
  const r = computeCognitiveLoad("");
  assert(r.score === 0 || r.score <= 10, "Empty text → low score");
}

// Test 2: Simple text gives low score
{
  const r = computeCognitiveLoad("I like cats. Dogs are fun. The sky is blue.");
  assertRange(r.score, 0, 40, "Simple text → low score");
}

// Test 3: Complex text gives higher score
{
  const complex =
    "The epistemological ramifications of quantum mechanical indeterminacy necessitate a fundamental reconceptualization of ontological determinism within the philosophical framework of contemporary metaphysical discourse, particularly as it pertains to the hermeneutical interpretation of causal relationships across spatiotemporally distributed phenomena.";
  const r = computeCognitiveLoad(complex);
  assertRange(r.score, 20, 100, "Complex text → higher score");
}

// Test 4: Simple vs complex — simple should be lower
{
  const simple = computeCognitiveLoad("I like cats. Dogs are fun.");
  const complex = computeCognitiveLoad(
    "The epistemological ramifications of quantum mechanical indeterminacy necessitate a fundamental reconceptualization of ontological determinism within the philosophical framework."
  );
  assert(simple.score < complex.score, "Simple score < complex score");
}

// Test 5: DOM stats affect clutter score
{
  const text = "Hello world. This is a simple page.";
  const withoutDom = computeCognitiveLoad(text);
  const heavyDom: DomStats = {
    images: 50,
    iframes: 10,
    videos: 5,
    buttons: 30,
    links: 200,
    maxDepthSample: 20,
  };
  const withDom = computeCognitiveLoad(text, heavyDom);
  assert(withDom.score > withoutDom.score, "Heavy DOM → higher score");
}

// Test 6: Factors are populated
{
  const r = computeCognitiveLoad("Hello world. This is a test.");
  assert(r.factors.sentenceComplexity >= 0, "Sentence complexity factor exists");
  assert(r.factors.paragraphLength >= 0, "Paragraph length factor exists");
  assert(r.factors.syllableLoad >= 0, "Syllable load factor exists");
  assert(r.factors.clutter >= 0, "Clutter factor exists");
}

// Test 7: Score is always 0-100
{
  const huge =
    "A ".repeat(5000) +
    "The implementation of the extraordinarily sophisticated algorithmic paradigm.";
  const r = computeCognitiveLoad(huge);
  assertRange(r.score, 0, 100, "Score always in [0, 100]");
}

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
