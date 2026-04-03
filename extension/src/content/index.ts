/**
 * Content script: DOM extraction, theme injection, distraction reduction, focus overlay, simplified panel.
 * Guard: skip if already injected (prevents duplicate listeners on re-injection).
 */
import type { ContentRequest, ContentResponse, DomStats, PageSettings } from "../shared/messages.js";
import { extractVisibleText, estimateMainElement, sampleDomDepth } from "./extract.js";
import {
  BASE_ATTR,
  buildThemeCss,
  DISTRACTION_CSS,
} from "./stylesInjected.js";

const GUARD_ATTR = "data-neuro-inclusive-injected";
if (document.documentElement.getAttribute(GUARD_ATTR)) {
  // Already injected — bail out to avoid duplicate listeners
  // (use a self-executing block that we break from below)
} else {
  document.documentElement.setAttribute(GUARD_ATTR, "1");
}

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

function collectDomStats(): DomStats {
  return {
    images: document.images.length,
    iframes: document.querySelectorAll("iframe").length,
    videos: document.querySelectorAll("video").length,
    buttons: document.querySelectorAll("button").length,
    links: document.querySelectorAll("a").length,
    maxDepthSample: sampleDomDepth(),
  };
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
