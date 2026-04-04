/**
 * Service worker: proxies AI requests to the local/backend API so keys never ship in the extension.
 */
import type { BackgroundRequest, BackgroundResponse } from "../shared/messages.js";

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundRequest,
    _sender,
    sendResponse: (r: BackgroundResponse) => void
  ) => {
    void handle(message).then(sendResponse);
    return true;
  }
);

async function handle(message: BackgroundRequest): Promise<BackgroundResponse> {
  const base = message.apiBase.replace(/\/$/, "");
  try {
    if (message.type === "API_SIMPLIFY") {
      const res = await fetch(`${base}/api/simplify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          ok: false,
          error: (err as { error?: string }).error ?? res.statusText,
        };
      }
      const data = (await res.json()) as { simplified?: string };
      return { ok: true, simplified: data.simplified ?? "" };
    }
    if (message.type === "API_SUMMARIZE") {
      const res = await fetch(`${base}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.text,
          mode: message.mode,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          ok: false,
          error: (err as { error?: string }).error ?? res.statusText,
        };
      }
      const data = (await res.json()) as { summary?: string };
      return { ok: true, summary: data.summary ?? "" };
    }
    if (message.type === "API_COGNITIVE_LOAD") {
      const res = await fetch(`${base}/api/cognitive-load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.text,
          domStats: message.domStats,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          ok: false,
          error: (err as { error?: string }).error ?? res.statusText,
        };
      }
      const data = (await res.json()) as { score?: number; reason?: string };
      return {
        ok: true,
        score: data.score,
        reason: data.reason,
      };
    }
    if (message.type === "API_DEFINE") {
      const res = await fetch(`${base}/api/define`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          ok: false,
          error: (err as { error?: string }).error ?? res.statusText,
        };
      }
      const data = (await res.json()) as { definition?: string };
      return { ok: true, definition: data.definition ?? "" };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
  return { ok: false, error: "Unknown message" };
}
