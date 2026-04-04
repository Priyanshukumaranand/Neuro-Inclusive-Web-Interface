/**
 * Typed message contracts between popup, background, and content scripts.
 */

export type DomStats = {
  images: number;
  iframes: number;
  videos: number;
  buttons: number;
  links: number;
  /** Rough depth sample: max nesting depth in a subtree scan */
  maxDepthSample: number;
};

export type BackgroundRequest =
  | { type: "API_SIMPLIFY"; text: string; apiBase: string }
  | { type: "API_SUMMARIZE"; text: string; mode: "tldr" | "bullets"; apiBase: string }
  | { type: "API_COGNITIVE_LOAD"; text: string; domStats: DomStats; apiBase: string }
  | { type: "API_DEFINE"; text: string; apiBase: string };

export type BackgroundResponse =
  | { ok: true; simplified?: string; summary?: string; score?: number; reason?: string; definition?: string }
  | { ok: false; error: string };

export type ContentRequest =
  | { type: "GET_PAGE_TEXT" }
  | { type: "GET_DOM_STATS" }
  | { type: "APPLY_SETTINGS"; settings: PageSettings; apiBase?: string }
  | { type: "SHOW_SIMPLIFIED"; simplified: string; show: boolean }
  | { type: "SET_FOCUS_MODE"; on: boolean }
  | { type: "PING" };

export type PageSettings = {
  theme: "default" | "dark" | "sepia" | "dyslexia" | "autism";
  fontSizePx: number;
  lineHeight: number;
  letterSpacingEm: number;
  readabilityMode: boolean;
  distractionReduction: boolean;
  focusMode: boolean;
  bionicReading: boolean;
  readingRuler: boolean;
};

export type ContentResponse =
  | { ok: true; text?: string; domStats?: DomStats }
  | { ok: false; error: string };
