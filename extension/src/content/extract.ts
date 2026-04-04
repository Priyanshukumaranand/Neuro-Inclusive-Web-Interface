/**
 * Extract visible text from the DOM via TreeWalker (skips scripts/styles).
 */
const MAX_CHARS = 12000;

const SKIP = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "TEMPLATE",
  "CODE",
  "PRE",
]);

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

export function extractVisibleText(root: Document | Element = document): string {
  const parts: string[] = [];
  let count = 0;
  try {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
      let p: Element | null = parent;
      while (p) {
        if (SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        p = p.parentElement;
      }
      const t = node.textContent?.trim();
      if (!t) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n.textContent?.trim();
    if (!t) continue;
    parts.push(t);
    count += t.length;
    if (count >= MAX_CHARS) break;
  }
  } catch {
    return "";
  }

  return parts.join("\n\n").slice(0, MAX_CHARS);
}

export function estimateMainElement(): HTMLElement | null {
  const article = document.querySelector("article");
  if (article) return article as HTMLElement;
  const main = document.querySelector('main, [role="main"]');
  if (main) return main as HTMLElement;
  if (!document.body) return null;
  const bodies = Array.from(document.body.children) as HTMLElement[];
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const el of bodies) {
    const text = el.innerText?.length ?? 0;
    const links = el.querySelectorAll("a").length;
    const score = text - links * 8;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export function sampleDomDepth(root?: Element, maxNodes = 400): number {
  const docRoot = root ?? document.body;
  if (!docRoot) return 0;
  let maxD = 0;
  let seen = 0;
  const walk = (el: Element, d: number) => {
    if (seen++ > maxNodes) return;
    maxD = Math.max(maxD, d);
    for (const c of Array.from(el.children)) walk(c as Element, d + 1);
  };
  walk(docRoot, 0);
  return maxD;
}
