/**
 * Offline / no-server fallbacks for simplify & summarize (mirrors server heuristics).
 */

const MAX_IN = 12000;

export function localSimplify(text: string): string {
  const clipped = text.slice(0, MAX_IN);
  const sentences = clipped.split(/(?<=[.!?])\s+/);
  return sentences
    .map((s) => {
      const words = s.split(/\s+/);
      if (words.length > 22) return words.slice(0, 18).join(" ") + ".";
      return s;
    })
    .join(" ");
}

export function localSummarize(text: string, mode: "tldr" | "bullets"): string {
  const clipped = text.slice(0, MAX_IN);
  const trimmed = clipped.trim();
  const sentences = clipped
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (mode === "tldr") {
    return sentences[0] || trimmed.slice(0, 180) || "No content to summarize.";
  }
  return sentences
    .slice(0, 6)
    .map((s) => `- ${s}`)
    .join("\n");
}

export function localDefine(term: string): string {
  const t = term.trim().slice(0, 200);
  if (!t) return "Select a word or short phrase to explain.";
  return `(Offline) “${t}”: short explanation unavailable without the API — try a dictionary or enable the server.`;
}
