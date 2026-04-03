/**
 * Tests for profile settings and mapping.
 * Run: node --loader tsx tests/test-profiles.ts
 */

import { profileToSettings, PROFILE_LIST } from "../extension/src/shared/profiles.js";
import type { ProfileId } from "../extension/src/shared/profiles.js";

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

console.log("\n=== Profile Tests ===\n");

// Test 1: Profile list has expected entries
assert(PROFILE_LIST.length === 4, "4 profiles defined (none, adhd, dyslexia, autism)");
assert(
  PROFILE_LIST.map((p) => p.id).join(",") === "none,adhd,dyslexia,autism",
  "Profile IDs in correct order"
);

// Test 2: Each profile has label and description
for (const p of PROFILE_LIST) {
  assert(p.label.length > 0, `${p.id} has a label`);
  assert(p.description.length > 0, `${p.id} has a description`);
}

// Test 3: 'none' returns empty settings
{
  const s = profileToSettings("none");
  assert(Object.keys(s).length === 0, "'none' profile returns empty overrides");
}

// Test 4: ADHD profile settings
{
  const s = profileToSettings("adhd");
  assert(s.theme === "dark", "ADHD → dark theme");
  assert(s.distractionReduction === true, "ADHD → distraction reduction on");
  assert(s.focusMode === true, "ADHD → focus mode on");
  assert(s.readabilityMode === true, "ADHD → readability mode on");
  assert(typeof s.fontSizePx === "number" && s.fontSizePx >= 16, "ADHD → font size >= 16");
}

// Test 5: Dyslexia profile settings
{
  const s = profileToSettings("dyslexia");
  assert(s.theme === "dyslexia", "Dyslexia → dyslexia theme");
  assert(s.distractionReduction === true, "Dyslexia → distraction reduction on");
  assert(
    typeof s.letterSpacingEm === "number" && s.letterSpacingEm >= 0.04,
    "Dyslexia → wider letter spacing"
  );
  assert(
    typeof s.lineHeight === "number" && s.lineHeight >= 1.6,
    "Dyslexia → taller line height"
  );
}

// Test 6: Autism profile settings
{
  const s = profileToSettings("autism");
  assert(s.theme === "autism", "Autism → autism theme");
  assert(s.focusMode === false, "Autism → focus mode OFF (low sensory)");
  assert(s.distractionReduction === true, "Autism → distraction reduction on");
}

// Test 7: Unknown profile returns empty (fallback)
{
  const s = profileToSettings("unknown" as ProfileId);
  assert(Object.keys(s).length === 0, "Unknown profile returns empty overrides");
}

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
