import "./env.js";
import express from "express";
import cors from "cors";
import simplifyRouter from "./routes/simplify.js";
import summarizeRouter from "./routes/summarize.js";
import cognitiveLoadRouter from "./routes/cognitiveLoad.js";
import defineRouter from "./routes/define.js";
import { isGeminiConfigured } from "./lib/gemini.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Chrome extensions send from chrome-extension:// origins; reflect for local dev
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "512kb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    gemini: isGeminiConfigured(),
  });
});

app.use("/api/simplify", simplifyRouter);
app.use("/api/summarize", summarizeRouter);
app.use("/api/cognitive-load", cognitiveLoadRouter);
app.use("/api/define", defineRouter);

app.listen(PORT, () => {
  console.log(`Neuro-Inclusive API listening on http://localhost:${PORT}`);
  if (!isGeminiConfigured()) {
    console.warn(
      "Note: GEMINI_API_KEY not set — /api/simplify, /summarize, /define use local fallbacks; cognitive-load uses heuristics."
    );
  }
});
