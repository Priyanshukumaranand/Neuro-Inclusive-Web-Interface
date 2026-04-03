import { useEffect, useCallback } from "react";
import { useStore, getPageSettingsFromStore } from "./store.js";
import { sendToActiveTab } from "./tab.js";
import type { BackgroundRequest, BackgroundResponse } from "../shared/messages.js";

import { computeCognitiveLoad } from "../shared/cognitiveLoad.js";
import { PROFILE_LIST } from "../shared/profiles.js";

async function bgApi(msg: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(msg);
}

export default function App() {
  const s = useStore();

  useEffect(() => {
    void useStore.getState().hydrate();
  }, []);

  const persist = useStore((x) => x.persist);

  useEffect(() => {
    const t = setTimeout(() => void persist(), 300);
    return () => clearTimeout(t);
  }, [
    s.apiBase,
    s.profile,
    s.theme,
    s.fontSizePx,
    s.lineHeight,
    s.letterSpacingEm,
    s.readabilityMode,
    s.distractionReduction,
    s.focusMode,
    s.useServerCognitive,
    persist,
  ]);

  const applyToPage = useCallback(async () => {
    s.setStatus("Applying…");
    const settings = getPageSettingsFromStore();
    const r = await sendToActiveTab({ type: "APPLY_SETTINGS", settings });
    s.setStatus(r.ok ? "Applied to page." : r.error ?? "Failed");
  }, [s]);

  const scorePage = useCallback(async () => {
    s.setStatus("Scoring…");
    const [tRes, dRes] = await Promise.all([
      sendToActiveTab({ type: "GET_PAGE_TEXT" }),
      sendToActiveTab({ type: "GET_DOM_STATS" }),
    ]);
    if (!tRes.ok || !tRes.text) {
      s.setStatus(tRes.ok === false ? tRes.error : "No text");
      return;
    }
    const dom = dRes.ok ? dRes.domStats : undefined;
    const local = computeCognitiveLoad(tRes.text, dom);
    let before = local.score;
    let factors = `Local: sentences ${local.factors.sentenceComplexity}, clutter ${local.factors.clutter}`;

    if (s.useServerCognitive) {
      const api = await bgApi({
        type: "API_COGNITIVE_LOAD",
        text: tRes.text,
        domStats: dom ?? {
          images: 0,
          iframes: 0,
          videos: 0,
          buttons: 0,
          links: 0,
          maxDepthSample: 0,
        },
        apiBase: s.apiBase,
      });
      if (api.ok && api.score != null) {
        before = Math.round((before + api.score) / 2);
        factors += ` | Gemini: ${api.reason ?? ""}`;
      }
    }

    s.setCognitive(before, null, factors);
    s.setStatus("Cognitive load (before) updated.");
  }, [s]);

  const simplifyPage = useCallback(async () => {
    s.setStatus("Fetching text…");
    const tRes = await sendToActiveTab({ type: "GET_PAGE_TEXT" });
    const dRes = await sendToActiveTab({ type: "GET_DOM_STATS" });
    if (!tRes.ok || !tRes.text) {
      s.setStatus(tRes.ok === false ? tRes.error : "No text");
      return;
    }
    const dom = dRes.ok ? dRes.domStats : undefined;
    const beforeScore = computeCognitiveLoad(tRes.text, dom).score;

    s.setStatus("Simplifying…");
    const api = await bgApi({
      type: "API_SIMPLIFY",
      text: tRes.text,
      apiBase: s.apiBase,
    });
    if (!api.ok || !api.simplified) {
      s.setStatus(api.ok === false ? api.error : "No result");
      return;
    }

    const afterScore = computeCognitiveLoad(api.simplified, dom).score;
    s.setLastSimplified(tRes.text, api.simplified);
    s.setSimplifiedView("simplified");
    s.setCognitive(
      beforeScore,
      afterScore,
      `Sentence/paragraph heuristics + clutter ${dom ? "included" : "n/a"}`
    );
    await sendToActiveTab({
      type: "SHOW_SIMPLIFIED",
      simplified: api.simplified,
      show: true,
    });
    s.setStatus("Simplified. Toggle Original / Simplified below.");
  }, [s]);

  const toggleView = useCallback(async () => {
    const cur = useStore.getState().simplifiedView;
    const next = cur === "original" ? "simplified" : "original";
    useStore.getState().setSimplifiedView(next);
    const st = useStore.getState();
    const text =
      next === "simplified" ? st.lastSimplified : st.lastOriginalSample;
    await sendToActiveTab({
      type: "SHOW_SIMPLIFIED",
      simplified: text,
      show: true,
    });
  }, []);

  const summarize = useCallback(
    async (mode: "tldr" | "bullets") => {
      s.setStatus("Summarizing…");
      const tRes = await sendToActiveTab({ type: "GET_PAGE_TEXT" });
      if (!tRes.ok || !tRes.text) {
        s.setStatus(tRes.ok === false ? tRes.error : "No text");
        return;
      }
      const api = await bgApi({
        type: "API_SUMMARIZE",
        text: tRes.text,
        mode,
        apiBase: s.apiBase,
      });
      if (!api.ok || !api.summary) {
        s.setStatus(api.ok === false ? api.error : "No summary");
        return;
      }
      s.setSummaryText(api.summary);
      s.setStatus(mode === "tldr" ? "TL;DR ready." : "Bullets ready.");
    },
    [s]
  );

  return (
    <div className="panel">
      <h1>Neuro-Inclusive</h1>
      <p className="muted">Hackathon prototype — keys stay on your API server.</p>

      <h2>API</h2>
      <input
        type="text"
        value={s.apiBase}
        onChange={(e) => s.setApiBase(e.target.value)}
        placeholder="http://localhost:3000"
        aria-label="API base URL"
      />

      <h2>Profile</h2>
      <div className="row">
        {PROFILE_LIST.map((p) => (
          <button
            key={p.id}
            type="button"
            className={s.profile === p.id ? undefined : "secondary"}
            onClick={() => {
              s.setProfile(p.id);
            }}
            title={p.description}
          >
            {p.label}
          </button>
        ))}
      </div>

      <h2>Visual</h2>
      <div className="row">
        <select
          value={s.theme}
          onChange={(e) =>
            s.patchPage({ theme: e.target.value as typeof s.theme })
          }
          aria-label="Theme"
        >
          <option value="default">Default</option>
          <option value="dark">Dark</option>
          <option value="sepia">Sepia</option>
          <option value="dyslexia">Dyslexia</option>
          <option value="autism">Autism (muted)</option>
        </select>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <label className="muted" style={{ flex: "0 0 100%" }}>
          Font (px)
          <input
            type="number"
            min={12}
            max={28}
            value={s.fontSizePx}
            onChange={(e) =>
              s.patchPage({ fontSizePx: Number(e.target.value) || 16 })
            }
          />
        </label>
        <label className="muted" style={{ flex: "0 0 100%" }}>
          Line height
          <input
            type="number"
            step={0.05}
            min={1.2}
            max={2.2}
            value={s.lineHeight}
            onChange={(e) =>
              s.patchPage({ lineHeight: Number(e.target.value) || 1.5 })
            }
          />
        </label>
        <label className="muted" style={{ flex: "0 0 100%" }}>
          Letter spacing (em)
          <input
            type="number"
            step={0.01}
            min={0}
            max={0.2}
            value={s.letterSpacingEm}
            onChange={(e) =>
              s.patchPage({ letterSpacingEm: Number(e.target.value) || 0 })
            }
          />
        </label>
      </div>

      <label className="chk" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={s.readabilityMode}
          onChange={(e) => s.patchPage({ readabilityMode: e.target.checked })}
        />
        Readability mode (narrow column)
      </label>
      <label className="chk">
        <input
          type="checkbox"
          checked={s.distractionReduction}
          onChange={(e) =>
            s.patchPage({ distractionReduction: e.target.checked })
          }
        />
        Distraction reduction (blur common ads / autoplay)
      </label>
      <label className="chk">
        <input
          type="checkbox"
          checked={s.focusMode}
          onChange={(e) => s.patchPage({ focusMode: e.target.checked })}
        />
        Focus mode (spotlight main content)
      </label>

      <div className="divider" />

      <div className="row">
        <button type="button" onClick={() => void applyToPage()}>
          Apply to page
        </button>
        <button type="button" className="secondary" onClick={() => void scorePage()}>
          Score cognitive load
        </button>
      </div>

      <label className="chk" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={s.useServerCognitive}
          onChange={(e) => s.setUseServerCognitive(e.target.checked)}
        />
        Blend Gemini cognitive score (uses API)
      </label>

      <div style={{ marginTop: 10 }}>
        <span className="muted">Before: </span>
        <span className="score-pill before">
          {s.cognitiveBefore ?? "—"}
        </span>
        <span className="muted" style={{ marginLeft: 10 }}>
          After:{" "}
        </span>
        <span className="score-pill after">{s.cognitiveAfter ?? "—"}</span>
      </div>
      {s.cognitiveFactors ? (
        <p className="muted" style={{ marginTop: 6 }}>
          {s.cognitiveFactors}
        </p>
      ) : null}

      <div className="divider" />

      <div className="row">
        <button type="button" onClick={() => void simplifyPage()}>
          Simplify page (AI)
        </button>
        <button type="button" className="secondary" onClick={() => void toggleView()}>
          Toggle: {s.simplifiedView === "simplified" ? "Original" : "Simplified"}
        </button>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => void summarize("tldr")}>
          TL;DR
        </button>
        <button type="button" className="secondary" onClick={() => void summarize("bullets")}>
          Bullet summary
        </button>
      </div>

      {s.summaryText ? (
        <>
          <h2>Summary</h2>
          <pre className="summary">{s.summaryText}</pre>
        </>
      ) : null}

      <p className="muted" style={{ marginTop: 10 }}>
        {s.status}
      </p>
    </div>
  );
}
