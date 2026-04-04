/**
 * Content script: DOM extraction, theme injection, distraction reduction, focus overlay, simplified panel.
 * Guard: skip if already injected (prevents duplicate listeners on re-injection).
 */
import type {
  BackgroundResponse,
  ContentRequest,
  ContentResponse,
  DomStats,
  PageSettings,
} from "../shared/messages.js";
import { localDefine } from "../shared/localAiFallback.js";
import { extractVisibleText, estimateMainElement, sampleDomDepth } from "./extract.js";
import {
  BASE_ATTR,
  buildThemeCss,
  DISTRACTION_CSS,
} from "./stylesInjected.js";

const GUARD_ATTR = "data-neuro-inclusive-injected";

function initContentScript(): void {
const OVERLAY_ID = "neuro-inclusive-simplified-panel";
const FOCUS_ID = "neuro-inclusive-focus-layer";

let styleEl: HTMLStyleElement | null = null;
let distractionEl: HTMLStyleElement | null = null;

function ensureStyleEl(): HTMLStyleElement {
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.setAttribute("data-neuro-inclusive", "theme");
    document.documentElement.appendChild(styleEl);
  }
  return styleEl;
}

function ensureDistractionEl(): HTMLStyleElement {
  if (!distractionEl) {
    distractionEl = document.createElement("style");
    distractionEl.setAttribute("data-neuro-inclusive", "distraction");
    document.documentElement.appendChild(distractionEl);
  }
  return distractionEl;
}

function applySettings(settings: PageSettings): void {
  const html = document.documentElement;
  html.setAttribute(BASE_ATTR, "true");
  html.classList.remove(
    "theme-default",
    "theme-dark",
    "theme-sepia",
    "theme-dyslexia",
    "theme-autism"
  );
  html.classList.add(`theme-${settings.theme}`);

  if (settings.distractionReduction) {
    html.setAttribute("data-neuro-inclusive-distract", "true");
    ensureDistractionEl().textContent = DISTRACTION_CSS;
  } else {
    html.removeAttribute("data-neuro-inclusive-distract");
    if (distractionEl) distractionEl.textContent = "";
  }

  ensureStyleEl().textContent = buildThemeCss(
    settings.fontSizePx,
    settings.lineHeight,
    settings.letterSpacingEm,
    settings.theme,
    settings.readabilityMode
  );

  if (settings.focusMode) {
    showFocusOverlay();
  } else {
    removeFocusOverlay();
  }

  // Pause autoplay videos when distraction reduction is on
  if (settings.distractionReduction) {
    document.querySelectorAll("video[autoplay]").forEach((v) => {
      try {
        (v as HTMLVideoElement).pause();
      } catch {
        /* ignore */
      }
    });
  }

  document.querySelectorAll(".neuro-inclusive-main").forEach((n) => {
    n.classList.remove("neuro-inclusive-main");
  });
  if (settings.readabilityMode) {
    const m = estimateMainElement();
    m?.classList.add("neuro-inclusive-main");
  }

  applyReadingRuler(settings.readingRuler);
  applyBionicReading(settings.bionicReading);
}

// BIONIC READING
let bionicApplied = false;
function applyBionicReading(enabled: boolean) {
  if (!document.body) return;
  if (enabled && !bionicApplied) {
    bionicApplied = true;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (parent && ["SCRIPT", "STYLE", "NOSCRIPT", "B", "STRONG"].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(parent!);
        if (style.display === "none" || style.visibility === "hidden") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode as Text);
    }
    for (const node of nodes) {
      const text = node.nodeValue || "";
      const words = text.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      for (const w of words) {
        if (!w.trim() || w.length < 2) {
          frag.appendChild(document.createTextNode(w));
        } else {
          const mid = Math.ceil(w.length / 2);
          const b = document.createElement("b");
          b.className = "neuro-bionic";
          b.style.fontWeight = "bold";
          b.textContent = w.slice(0, mid);
          frag.appendChild(b);
          frag.appendChild(document.createTextNode(w.slice(mid)));
        }
      }
      node.replaceWith(frag);
    }
  } else if (!enabled && bionicApplied) {
    bionicApplied = false;
    document.querySelectorAll(".neuro-bionic").forEach(b => {
      const txt = b.textContent || "";
      const next = b.nextSibling;
      if (next?.nodeType === Node.TEXT_NODE) {
        next.nodeValue = txt + (next.nodeValue || "");
        b.remove();
      } else {
        b.replaceWith(document.createTextNode(txt));
      }
    });
  }
}

// READING RULER
const RULER_ID = "neuro-inclusive-ruler";
let rulerListener: ((e: MouseEvent) => void) | null = null;
function ensureRuler(): HTMLDivElement {
  let el = document.getElementById(RULER_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = RULER_ID;
    el.setAttribute("role", "presentation");
    el.style.cssText = `
      position: fixed;
      left: 0;
      right: 0;
      height: 4px;
      background: rgba(255, 204, 0, 0.45);
      z-index: 2147483647;
      pointer-events: none;
      display: none;
      transition: top 0.05s linear;
    `;
    document.documentElement.appendChild(el);
  }
  return el;
}
function applyReadingRuler(enabled: boolean) {
  const ruler = ensureRuler();
  if (enabled) {
    ruler.style.display = "block";
    if (!rulerListener) {
      rulerListener = (e: MouseEvent) => {
        ruler.style.top = `${e.clientY + 12}px`;
      };
      document.addEventListener("mousemove", rulerListener);
    }
  } else {
    ruler.style.display = "none";
    if (rulerListener) {
      document.removeEventListener("mousemove", rulerListener);
      rulerListener = null;
    }
  }
}

function removeFocusOverlay(): void {
  document.getElementById(FOCUS_ID)?.remove();
}

function showFocusOverlay(): void {
  removeFocusOverlay();
  const main = estimateMainElement();
  const rect = main?.getBoundingClientRect() ?? {
    top: 64,
    left: 24,
    width: Math.min(window.innerWidth - 48, 720),
    height: window.innerHeight - 128,
  };

  const pad = 12;
  const hole = document.createElement("div");
  hole.id = FOCUS_ID;
  hole.setAttribute("role", "presentation");
  hole.style.cssText = `
    position: fixed;
    top: ${rect.top - pad}px;
    left: ${rect.left - pad}px;
    width: ${rect.width + pad * 2}px;
    height: ${rect.height + pad * 2}px;
    z-index: 2147483640;
    pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.55);
    border-radius: 4px;
    transition: box-shadow 0.25s ease;
  `;
  document.documentElement.appendChild(hole);
}

function ensureSimplifiedPanel(): HTMLDivElement {
  let el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Simplified text");
    el.style.cssText = `
      position: fixed;
      right: 16px;
      bottom: 16px;
      max-width: min(420px, 92vw);
      max-height: 55vh;
      overflow: auto;
      z-index: 2147483646;
      padding: 14px 16px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      font-family: system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.55;
      background: #1e1e1e;
      color: #f0f0f0;
      border: 1px solid rgba(255,255,255,0.12);
    `;
    document.documentElement.appendChild(el);
  }
  return el;
}

function showSimplifiedPanel(text: string, visible: boolean): void {
  const el = ensureSimplifiedPanel();
  el.textContent = text;
  el.style.display = visible ? "block" : "none";
}

// HOVER-TO-EXPLAIN TOOLTIP
const TOOLTIP_BTN_ID = "neuro-explain-btn";
const TOOLTIP_BUBBLE_ID = "neuro-explain-bubble";

let currentApiBase = "http://localhost:3000";

function ensureExplainBtn() {
  let el = document.getElementById(TOOLTIP_BTN_ID) as HTMLButtonElement | null;
  if (!el) {
    el = document.createElement("button");
    el.id = TOOLTIP_BTN_ID;
    el.textContent = "🧠 Explain";
    el.style.cssText = `
      position: absolute;
      z-index: 2147483647;
      background: #8b5cf6;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
      display: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    el.addEventListener("mousedown", (e) => e.preventDefault()); // Prevent losing selection
    el.addEventListener("click", async () => {
      const sel = window.getSelection();
      if (!sel || !sel.toString().trim()) return;
      const text = sel.toString().trim();
      el!.textContent = "🤔 Thinking...";
      
      try {
        const res = (await chrome.runtime.sendMessage({
          type: "API_DEFINE",
          text,
          apiBase: currentApiBase,
        })) as BackgroundResponse;

        if (res.ok && res.definition?.trim()) {
          showExplainBubble(res.definition, el!.style.left, el!.style.top);
        } else {
          const hint =
            !res.ok && res.error
              ? `${localDefine(text)} (${res.error})`
              : localDefine(text);
          showExplainBubble(hint, el!.style.left, el!.style.top);
        }
      } catch (e) {
         showExplainBubble("Network error.", el!.style.left, el!.style.top);
      }
      el!.style.display = "none";
      el!.textContent = "🧠 Explain";
    });
    
    document.documentElement.appendChild(el);
  }
  return el;
}

function showExplainBubble(text: string, left: string, top: string) {
  let el = document.getElementById(TOOLTIP_BUBBLE_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = TOOLTIP_BUBBLE_ID;
    el.style.cssText = `
      position: absolute;
      z-index: 2147483647;
      background: #1e1e1e;
      color: #f0f0f0;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 14px;
      max-width: 320px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
    `;
    document.documentElement.appendChild(el);
  }
  el.textContent = text;
  el.style.left = left;
  el.style.top = `calc(${top} + 30px)`;
  el.style.display = "block";
  
  setTimeout(() => {
    el!.style.display = "none";
  }, 5000);
}

document.addEventListener("mouseup", () => {
  const sel = window.getSelection();
  const btn = ensureExplainBtn();
  const selected =
    sel && sel.rangeCount > 0 ? sel.toString().trim() : "";
  if (selected.length > 0 && selected.length < 150) {
     const range = sel!.getRangeAt(0);
     const rect = range.getBoundingClientRect();
     btn.style.left = `${rect.right + window.scrollX + 5}px`;
     btn.style.top = `${rect.top + window.scrollY - 20}px`;
     btn.style.display = "block";
  } else {
     // Check if we are clicking the balloon itself
     if (document.activeElement?.id !== TOOLTIP_BTN_ID) {
         btn.style.display = "none";
     }
  }
});

function collectDomStats(): DomStats {
  try {
    return {
      images: document.images.length,
      iframes: document.querySelectorAll("iframe").length,
      videos: document.querySelectorAll("video").length,
      buttons: document.querySelectorAll("button").length,
      links: document.querySelectorAll("a").length,
      maxDepthSample: sampleDomDepth(),
    };
  } catch {
    return {
      images: 0,
      iframes: 0,
      videos: 0,
      buttons: 0,
      links: 0,
      maxDepthSample: 0,
    };
  }
}

chrome.runtime.onMessage.addListener(
  (
    msg: ContentRequest,
    _sender,
    sendResponse: (r: ContentResponse) => void
  ) => {
    try {
      if (msg.type === "GET_PAGE_TEXT") {
        const text = extractVisibleText();
        return sendResponse({ ok: true, text });
      }
      if (msg.type === "GET_DOM_STATS") {
        return sendResponse({ ok: true, domStats: collectDomStats() });
      }
      if (msg.type === "APPLY_SETTINGS") {
        currentApiBase = (msg.apiBase?.trim() || "http://localhost:3000").replace(/\/$/, "");
        applySettings(msg.settings);
        return sendResponse({ ok: true });
      }
      if (msg.type === "SHOW_SIMPLIFIED") {
        showSimplifiedPanel(msg.simplified, msg.show);
        return sendResponse({ ok: true });
      }
      if (msg.type === "SET_FOCUS_MODE") {
        if (msg.on) showFocusOverlay();
        else removeFocusOverlay();
        return sendResponse({ ok: true });
      }
      if (msg.type === "PING") {
        return sendResponse({ ok: true });
      }
    } catch (e) {
      return sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : "Content error",
      });
    }
    return sendResponse({ ok: false, error: "Unknown message" });
  }
);
}

if (!document.documentElement.getAttribute(GUARD_ATTR)) {
  document.documentElement.setAttribute(GUARD_ATTR, "1");
  initContentScript();
}
