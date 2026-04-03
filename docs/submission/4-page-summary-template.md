# The Big Code 2026: Hackathon Solution Submission

Project Name: Neuro-Inclusive Web Interface
Participant Name: <Your Name>
Participant Email ID: <Your Registered Email>
Participant Year of Degree: <1st/2nd/3rd/4th>
ReadMe File Links (GitHub): <Public Repository URL>

## Brief Summary
Neuro-Inclusive Web Interface is a Chrome extension + AI backend that transforms any webpage into a cognitively accessible experience for users with ADHD, autism, and dyslexia. The system extracts visible text, simplifies language using Gemini, reduces visual clutter, applies profile-based readability settings, and computes a Cognitive Load Score to quantify improvements before and after transformation.

## Problem Statement
The modern web is optimized for engagement, not comprehension. Dense text, ads, autoplay media, and inconsistent visual hierarchies increase cognitive burden, especially for neurodivergent users. This project addresses that gap by creating adaptive, explainable accessibility controls and AI-assisted simplification directly on arbitrary websites.

## Design Idea and Approach
### Architecture
- Content script: extracts text and applies visual transformations.
- Background service worker: secure API relay from extension to backend.
- Popup UI (React + Zustand): user controls, profile presets, before/after metrics.
- Node/Express backend: Gemini-powered simplification and summarization.

### Algorithmic logic
1. Visible-text extraction with TreeWalker and node filtering.
2. Heuristic clutter signal from DOM stats (images/iframes/videos/buttons/links/depth).
3. Cognitive Load Score (0-100) using weighted text complexity + clutter.
4. AI simplification and summarization with controlled prompts.

### Scalability and dominant parameters
- Input cap: 12k chars per request.
- Complexity: DOM scan O(N) over sampled nodes; scoring O(T) over text tokens.
- Throughput target for demo: 2-5 concurrent users, <3s perceived response for moderate pages.

### Security and privacy
- API key only on backend.
- Extension transmits text only for explicit AI actions.
- No persistent storage of page content server-side.

### Rollout strategy
- Phase 1: article/news pages.
- Phase 2: broader site compatibility + side-panel UX.
- Phase 3: adaptive personalization based on user feedback loops.

## Impact
This solution targets digital accessibility inequity by helping users complete reading tasks with lower cognitive strain. Expected outcomes include improved comprehension speed, reduced bounce due to overload, and better retention of key points through TL;DR and bullet summaries. The score-based before/after metric provides transparent evidence of benefit.

## Feasibility
The project is feasible within a 72-hour build:
- Existing browser extension and Node ecosystem reduce setup risk.
- AI integration is constrained to focused tasks (simplify/summarize).
- Synthetic test suite enables rapid validation without proprietary datasets.
- Architecture remains modular for post-hackathon scaling.

## Use of AI
AI is used where it materially improves accessibility:
- sentence simplification,
- concise summarization,
- optional subjective cognitive-load blending.

Prompt constraints prioritize faithfulness, plain language, and structural consistency.

## Alternatives Considered
- Inline text replacement across DOM nodes (rejected in v1 due to layout break risk).
- Client-only AI key in extension (rejected for security reasons).
- Serverless-only architecture (deferred; Express chosen for speed and local reliability).

## References and Appendices
- Repo README: setup, run, demo, testing instructions.
- Synthetic evaluation suite: docs/evaluation/synthetic-suite.json.
- Evaluation runner output: docs/evaluation/latest-results.json.
- Gemini API docs: https://ai.google.dev
