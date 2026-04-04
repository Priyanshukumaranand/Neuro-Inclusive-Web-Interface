import { Router } from "express";
import { getModel, isGeminiConfigured } from "../lib/gemini.js";

const router = Router();
const MAX_IN = 2000;

function mockDefine(text: string): string {
  return `(Mock Definition) '${text.slice(0, 50)}' is a complex term often used in this context.`;
}

router.post("/", async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) {
      return res.status(400).json({ error: "Missing text" });
    }
    const clipped = text.slice(0, MAX_IN);

    if (!isGeminiConfigured()) {
      return res.json({
        definition: mockDefine(clipped),
        mock: true,
        reason: "GEMINI_API_KEY not set — using local fallback",
      });
    }

    try {
      const model = getModel();
      const prompt = `You are a helpful dictionary assistant for neurodivergent users. 
Provide a very short, concrete 'Explain Like I'm 5' definition for the following word or phrase. 
Keep it to exactly 1 or 2 simple sentences max, using basic vocabulary. Do not use complex jargon.

Term to define:
"${clipped}"`;
      
      const result = await model.generateContent(prompt);
      const out = result.response.text().trim();
      return res.json({ definition: out });
    } catch (apiErr) {
      console.warn("define: Gemini failed, using fallback:", (apiErr as Error).message);
      return res.json({
        definition: mockDefine(clipped),
        mock: true,
        reason: `Gemini unavailable: ${(apiErr as Error).message?.slice(0, 120)}`,
      });
    }
  } catch (e) {
    console.error("define", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Define failed",
    });
  }
});

export default router;
