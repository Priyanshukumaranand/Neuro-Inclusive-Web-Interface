# Evaluation and Testing Strategy

This project includes a synthetic benchmark to demonstrate reliability and measurable improvement in accessibility outputs.

## What is measured
1. Complexity reduction (proxy):
   - Average words per sentence (lower is better)
   - Approximate syllable load (lower is better)
2. Summary compactness:
   - TL;DR output word length stays concise.
3. Pass criteria per case:
   - A case is marked improved if complexity or sentence length drops by at least 8%.

## Dataset strategy
- File: docs/evaluation/synthetic-suite.json
- 8 domain-diverse prompts (news, legal, health, finance, education, etc.)
- Designed to stress long and jargon-heavy phrasing
- Can be extended with real-world page excerpts later

## Run evaluation
1. Start backend API (`npm run dev` in `server/`).
2. From repo root run: `node scripts/evaluate.mjs`.
3. Results are written to: `docs/evaluation/latest-results.json`.

## Error analysis checklist
- Hallucination: simplified text introduces new facts.
- Over-compression: key entities omitted.
- Tone drift: summary changes intent.
- Domain loss: legal/scientific terms oversimplified.

## Mitigations implemented
- Prompt constraints: preserve meaning, avoid new facts.
- Input length cap to limit truncation instability.
- Optional human spot-check process for high-stakes content.

## Recommended post-hackathon extensions
- Add semantic similarity score (embedding cosine).
- Track factual consistency via QA checks.
- Build 50+ golden references and compute win-rate.
