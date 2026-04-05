import type {
  ContentRequest,
  ContentResponse,
  DomStats,
  PageAnalysis,
} from "../shared/messages.js";


const RESTRICTED_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-untrusted://",
  "chrome-search://",
  "edge://",
  "devtools://",
  "about:",
  "view-source:",
];

const CONTENT_GUARD_ATTR = "data-neuro-inclusive-injected";
const CONTENT_READY_ATTR = "data-neuro-inclusive-ready";
const RECEIVER_RETRY_ATTEMPTS = 6;
const RECEIVER_RETRY_DELAY_MS = 80;

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return false;
  return RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e || "Unknown error");
}

function isMissingReceiverError(e: unknown): boolean {
  const msg = errorMessage(e).toLowerCase();
  return (
    msg.includes("receiving end does not exist") ||
    msg.includes("could not establish connection") ||
    msg.includes("no matching message handler") ||
    msg.includes("message port closed") ||
    msg.includes("port closed before a response")
  );
}

async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingReceiver(tabId: number): Promise<boolean> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "PING" } as ContentRequest);
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

async function clearStaleContentGuard(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const root = document.documentElement;
        if (!root) return;
        root.removeAttribute("data-neuro-inclusive-injected");
        root.removeAttribute("data-neuro-inclusive-ready");
      },
    });
  } catch {
    // Ignore pages where script injection is not permitted.
  }
}

async function ensureReceiver(tabId: number): Promise<boolean> {
  if (await pingReceiver(tabId)) return true;

  await injectContentScript(tabId);
  for (let i = 0; i < RECEIVER_RETRY_ATTEMPTS; i++) {
    if (await pingReceiver(tabId)) return true;
    await delay(RECEIVER_RETRY_DELAY_MS);
  }

  await clearStaleContentGuard(tabId);
  await injectContentScript(tabId);
  for (let i = 0; i < RECEIVER_RETRY_ATTEMPTS; i++) {
    if (await pingReceiver(tabId)) return true;
    await delay(RECEIVER_RETRY_DELAY_MS);
  }

  return false;
}

function supportsExtractionFallback(msg: ContentRequest): boolean {
  return (
    msg.type === "GET_PAGE_TEXT" ||
    msg.type === "GET_DOM_STATS" ||
    msg.type === "GET_PAGE_ANALYSIS"
  );
}

function fallbackDomStatsFromDocument(): DomStats {
  return {
    images: 0,
    iframes: 0,
    videos: 0,
    buttons: 0,
    links: 0,
    headings: 0,
    popups: 0,
    sidebars: 0,
    denseTextBlocks: 0,
    textDensity: 0,
    difficultTerms: 0,
    maxDepthSample: 0,
  };
}

async function extractVisibleFallback(
  tabId: number
): Promise<{ text: string; domStats: DomStats } | null> {
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const SKIP = new Set([
          "SCRIPT",
          "STYLE",
          "NOSCRIPT",
          "SVG",
          "TEMPLATE",
          "CODE",
          "PRE",
          "CANVAS",
        ]);
        const SENSITIVE =
          "input, textarea, select, [contenteditable='true'], [contenteditable=''], [type='password']";
        const MAX_CHARS = 12000;

        const chunks: string[] = [];
        let used = 0;

        const body = document.body;
        if (body) {
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (parent.closest(SENSITIVE)) return NodeFilter.FILTER_REJECT;

              let p: Element | null = parent;
              while (p) {
                if (SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
                p = p.parentElement;
              }

              const style = window.getComputedStyle(parent);
              if (style.display === "none" || style.visibility === "hidden") {
                return NodeFilter.FILTER_REJECT;
              }

              const t = node.textContent?.trim();
              if (!t) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            },
          });

          while (used < MAX_CHARS) {
            const next = walker.nextNode();
            if (!next) break;

            const raw = next.textContent?.trim();
            if (!raw) continue;
            const text = raw.replace(/\s+/g, " ").trim();
            if (!text) continue;

            const remaining = MAX_CHARS - used;
            const clipped = text.slice(0, remaining).trim();
            if (!clipped) continue;

            chunks.push(clipped);
            used += clipped.length;
          }
        }

        const text = chunks.join("\n\n").slice(0, MAX_CHARS);
        const domStats = {
          images: document.images.length,
          iframes: document.querySelectorAll("iframe").length,
          videos: document.querySelectorAll("video").length,
          buttons: document.querySelectorAll("button").length,
          links: document.querySelectorAll("a").length,
          headings: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
          popups: document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length,
          sidebars: document.querySelectorAll("aside, [role='complementary']").length,
          denseTextBlocks: 0,
          textDensity: 0,
          difficultTerms: 0,
          maxDepthSample: 0,
        };

        return { text, domStats };
      },
    });

    const result = injected[0]?.result as
      | { text?: unknown; domStats?: unknown }
      | undefined;

    if (!result || typeof result.text !== "string") return null;

    const stats =
      result.domStats && typeof result.domStats === "object"
        ? (result.domStats as DomStats)
        : fallbackDomStatsFromDocument();

    return {
      text: result.text,
      domStats: stats,
    };
  } catch {
    return null;
  }
}

async function fallbackResponseFor(
  tabId: number,
  msg: ContentRequest
): Promise<ContentResponse> {
  if (!supportsExtractionFallback(msg)) {
    return {
      ok: false,
      error: "Page script not attached yet for this action. Reload the tab and retry.",
    };
  }

  const extracted = await extractVisibleFallback(tabId);
  if (!extracted) {
    return {
      ok: false,
      error: "Could not attach page script. Reload the tab once, then try again.",
    };
  }

  if (msg.type === "GET_PAGE_TEXT") {
    return { ok: true, text: extracted.text };
  }

  if (msg.type === "GET_DOM_STATS") {
    return { ok: true, domStats: extracted.domStats };
  }

  const analysis: PageAnalysis = {
    text: extracted.text,
    prioritizedText: extracted.text,
    difficultTerms: [],
    blocks: [],
    domStats: extracted.domStats,
  };
  return { ok: true, analysis };
}

export async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function sendToActiveTab(
  msg: ContentRequest
): Promise<ContentResponse> {
  const tab = await getActiveTab();
  const id = tab?.id;
  if (id == null) return { ok: false, error: "No active tab" };

  if (isRestrictedUrl(tab?.url)) {
    return {
      ok: false,
      error: "This page blocks extensions. Open a normal http/https page and refresh once.",
    };
  }

  if (msg.type === "PING") {
    const pingOk = await pingReceiver(id);
    return pingOk ? { ok: true } : { ok: false, error: "No page receiver" };
  }

  const ready = await ensureReceiver(id);
  if (!ready) {
    return await fallbackResponseFor(id, msg);
  }

  try {
    return await chrome.tabs.sendMessage(id, msg);
  } catch (e) {
    if (isMissingReceiverError(e)) {
      try {
        const retried = await ensureReceiver(id);
        if (retried) {
          return await chrome.tabs.sendMessage(id, msg);
        }

        return await fallbackResponseFor(id, msg);
      } catch (retryErr) {
        const fallback = await fallbackResponseFor(id, msg);
        if (fallback.ok) return fallback;
        return {
          ok: false,
          error: `Could not reach page script: ${errorMessage(retryErr)}. Try refreshing the page.`,
        };
      }
    }

    return {
      ok: false,
      error: `${errorMessage(e)} (reload tab?)`,
    };
  }
}
