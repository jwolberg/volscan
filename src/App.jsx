import { useState, useEffect, useCallback } from "react";

const PROXY = "http://localhost:3001";
const DEMO_TICKERS = ["AAPL", "META", "AMZN", "XOM", "GM", "MCD", "KO"];

// ─── Data fetching ────────────────────────────────────────────────────────────

// TV API — proxy serves at /tv/tickers/{TICKER}/...
async function apiFetch(path) {
  const url = `${PROXY}/tv${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? ": " + text.slice(0, 120) : ""}`);
  }
  return res.json();
}

async function loadTickerData(ticker) {
  const [ms, gex] = await Promise.all([
    apiFetch(`/tickers/${ticker}/market-structure`),
    apiFetch(`/tickers/${ticker}/curves/gex_by_strike?exp=combined`),
  ]);
  return { ms, gex };
}

// Anthropic — routes through proxy POST /anthropic (key stays in .env)
async function getAIBrief(ticker, msData, gexTotals) {
  const res = await fetch(`${PROXY}/anthropic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: `You are a professional options trader and market structure analyst. Analyze the JSON data and give a sharp, actionable trading brief.

Use exactly these headers:

**REGIME SNAPSHOT**
1-2 sentences on what the current structure means right now.

**KEY RISKS**
• Risk 1
• Risk 2
• Risk 3

**TRADE SETUP IDEAS**
• Setup 1 (specific strikes/levels)
• Setup 2
• Setup 3

**WATCH LEVELS**
Exact gamma flip, sigma levels, what triggers at each.

**BOTTOM LINE**
One sentence. Direct. No hedging.

Under 300 words. Reference actual numbers.`,
      messages: [{
        role: "user",
        content: `Analyze ${ticker}:\n\n${JSON.stringify({ market_structure: msData, gex_totals: gexTotals }, null, 2)}`
      }]
    })
  });
  const d = await res.json();
  return d.content?.map(b => b.text || "").join("\n") || "No response.";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}
function fmt$(n)           { return n != null ? `$${Number(n).toFixed(2)}` : "—"; }
function fmtPct(n, pre="") { return n != null ? `${pre}${Number(n).toFixed(2)}%` : "—"; }

// ─── Components ───────────────────────────────────────────────────────────────

function Card({ title, children, className = "", accent }) {
  return (
    <div className={`card animate-fade-up ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        {accent && <div className="w-0.5 h-3 rounded-full shrink-0" style={{ background: accent }} />}
        <p className="card-label">{title}</p>
      </div>
      {children}
    </div>
  );
}

function MetricRow({ label, value, highlight, dim }) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className={`metric-value font-mono tabular-nums ${highlight ? "hi" : ""} ${dim ? "!text-slate-400" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function BiasChip({ bias }) {
  const map = {
    stabilizing: "text-emerald-400 border-emerald-400/40 bg-emerald-400/[0.07]",
    neutral:     "text-slate-400  border-slate-400/40  bg-slate-400/[0.07]",
    mixed:       "text-amber-400  border-amber-400/40  bg-amber-400/[0.07]",
    fragile:     "text-red-400    border-red-400/40    bg-red-400/[0.07]",
  };
  const cls = map[bias?.toLowerCase()] || map.neutral;
  return <span className={`bias-chip ${cls}`}>{bias || "—"}</span>;
}

function PriceDispersionChart({ kl }) {
  const levels = [
    { key: "plus_1sigma_1m",  label: "+1σ 1M", value: kl?.plus_1sigma_1m,  color: "#34d399", horizonDays: 21 },
    { key: "plus_1sigma_1w",  label: "+1σ 1W", value: kl?.plus_1sigma_1w,  color: "#6ee7b7", horizonDays: 5 },
    { key: "plus_1sigma_1d",  label: "+1σ 1D", value: kl?.plus_1sigma_1d,  color: "#a7f3d0", horizonDays: 1 },
    { key: "spot",            label: "SPOT",   value: kl?.spot,             color: "#f8fafc", strong: true, horizonDays: 0 },
    { key: "gamma_flip",      label: "γ FLIP", value: kl?.gamma_flip,       color: "#f59e0b", strong: true, horizonDays: 0 },
    { key: "minus_1sigma_1d", label: "-1σ 1D", value: kl?.minus_1sigma_1d,  color: "#fca5a5", horizonDays: 1 },
    { key: "minus_1sigma_1w", label: "-1σ 1W", value: kl?.minus_1sigma_1w,  color: "#f87171", horizonDays: 5 },
    { key: "minus_1sigma_1m", label: "-1σ 1M", value: kl?.minus_1sigma_1m,  color: "#ef4444", horizonDays: 21 },
  ].filter(x => x.value != null);

  if (!levels.length) {
    return <p className="text-slate-400 text-[12px]">No price levels available.</p>;
  }

  
  const vals = levels.map(x => Number(x.value));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = Math.max(max - min, 0.01);

  // Add vertical padding so top/bottom dots and labels do not clip
  const TOP_PAD = 8;     // percent
  const BOTTOM_PAD = 8;  // percent
  const usableHeight = 100 - TOP_PAD - BOTTOM_PAD;

  const posFromTop = (v) =>
    TOP_PAD + ((max - Number(v)) / range) * usableHeight;

  const spot = kl?.spot != null ? Number(kl.spot) : null;
  const plus1d = kl?.plus_1sigma_1d != null ? Number(kl.plus_1sigma_1d) : null;
  const minus1d = kl?.minus_1sigma_1d != null ? Number(kl.minus_1sigma_1d) : null;
  const gammaFlip = kl?.gamma_flip != null ? Number(kl.gamma_flip) : null;

  const spotTop = spot != null ? posFromTop(spot) : null;
  const plus1dTop = plus1d != null ? posFromTop(plus1d) : null;
  const minus1dTop = minus1d != null ? posFromTop(minus1d) : null;
  const flipTop = gammaFlip != null ? posFromTop(gammaFlip) : null;
  

  const flipClosePct =
    spot != null && gammaFlip != null && spot !== 0
      ? Math.abs(gammaFlip - spot) / spot
      : null;

  const flipVeryClose = flipClosePct != null && flipClosePct < 0.01;

  // Main vertical rail
  const coreX = 140;

  
  // Volatility-style spacing: proportional to sqrt(time)
  const maxDays = 21;
  const maxSpread = 170; // furthest right distance from rail for 1M

  const xForDays = (days) => {
    if (!days) return coreX;
    return coreX + (Math.sqrt(days) / Math.sqrt(maxDays)) * maxSpread;
  };

  const xMap = {
    core: coreX,
    "1d": xForDays(1),
    "1w": xForDays(5),
    "1m": xForDays(21),
  };

  const horizonKey = (days) => {
    if (days === 0) return "core";
    if (days === 1) return "1d";
    if (days === 5) return "1w";
    return "1m";
  };

  return (
    <div className="relative h-[460px] px-2 overflow-x-auto overflow-y-visible">
      <div className="relative min-w-[560px] h-full">
        {/* shaded 1D zones */}
        {spotTop != null && plus1dTop != null && (
          <div
            className="absolute rounded-md"
            style={{
              left: `${coreX}px`,
              width: `${xMap["1d"] - coreX}px`,
              top: `${Math.min(spotTop, plus1dTop)}%`,
              height: `${Math.abs(spotTop - plus1dTop)}%`,
              background: "linear-gradient(90deg, rgba(52,211,153,0.14), rgba(52,211,153,0.05))",
              boxShadow: "inset 0 0 0 1px rgba(52,211,153,0.08)",
            }}
          />
        )}

        {spotTop != null && minus1dTop != null && (
          <div
            className="absolute rounded-md"
            style={{
              left: `${coreX}px`,
              width: `${xMap["1d"] - coreX}px`,
              top: `${Math.min(spotTop, minus1dTop)}%`,
              height: `${Math.abs(spotTop - minus1dTop)}%`,
              background: "linear-gradient(90deg, rgba(248,113,113,0.05), rgba(248,113,113,0.14))",
              boxShadow: "inset 0 0 0 1px rgba(248,113,113,0.08)",
            }}
          />
        )}

        {/* flip highlight if near spot */}
        {flipTop != null && (
          <div
            className="absolute left-0 right-0"
            style={{ top: `${flipTop}%` }}
          >
            <div
              className="absolute border-t border-dashed"
              style={{
                left: `${coreX - 6}px`,
                right: "110px",
                borderColor: "rgba(245,158,11,0.45)",
                borderWidth: "2px",
                            }}
            />
          </div>
        )}

        {/* rails */}
        <div className="absolute top-6 bottom-6 w-px bg-white/[0.10]" style={{ left: `${coreX}px` }} />
        <div className="absolute top-6 bottom-6 w-px bg-white/[0.04]" style={{ left: `${xMap["1d"]}px` }} />
        <div className="absolute top-6 bottom-6 w-px bg-white/[0.04]" style={{ left: `${xMap["1w"]}px` }} />
        <div className="absolute top-6 bottom-6 w-px bg-white/[0.04]" style={{ left: `${xMap["1m"]}px` }} />

        {/* horizon headers */}
        <div className="absolute text-[10px] tracking-[0.16em] text-slate-400 uppercase" style={{ left: `${xMap["1d"] - 10}px`, top: "2px" }}>
          1D
        </div>
        <div className="absolute text-[10px] tracking-[0.16em] text-slate-400 uppercase" style={{ left: `${xMap["1w"] - 10}px`, top: "2px" }}>
          1W
        </div>
        <div className="absolute text-[10px] tracking-[0.16em] text-slate-400 uppercase" style={{ left: `${xMap["1m"] - 12}px`, top: "2px" }}>
          1M
        </div>

        {/* markers */}
        {levels.map((lvl) => {
          const top = posFromTop(lvl.value);
          const isFlip = lvl.key === "gamma_flip";
          const isSpot = lvl.key === "spot";
          const glow = isFlip && flipVeryClose;
          const hk = horizonKey(lvl.horizonDays);
          const x = xMap[hk];

          return (
            <div
              key={lvl.key}
              className="absolute left-0 right-0"
              style={{ top: `${top}%` }}
            >
              <div className="relative h-0">
                {/* connector */}
                {hk !== "core" && (
                  <div
                    className="absolute h-px bg-white/[0.10]"
                    style={{
                      left: `${coreX}px`,
                      width: `${x - coreX}px`,
                      top: "0px",
                    }}
                  />
                )}

                {/* label */}
                <div
                  className="absolute text-right"
                  style={{
                    left: "0px",
                    width: "112px",
                    transform: "translateY(-50%)",
                  }}
                >
                  <div
                    className={lvl.strong ? "text-slate-100 uppercase" : "text-slate-400 uppercase"}
                    style={{
                      fontSize: "11px",
                      letterSpacing: "0.16em",
                      fontWeight: lvl.strong ? 700 : 500,
                    }}
                  >
                    {lvl.label}
                  </div>
                </div>

                {/* marker */}
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    left: `${x - 6}px`,
                    transform: "translateY(-50%)",
                    width: "12px",
                    height: "12px",
                  }}
                >
                  <div
                    className="rounded-full border border-white/10"
                    style={{
                      width: isSpot || isFlip ? 8 : 10,
                      height: isSpot || isFlip ? 8 : 10,
                      background: lvl.color,
                      boxShadow: glow
                        ? "0 0 0 6px rgba(245,158,11,0.12), 0 0 22px rgba(245,158,11,0.45)"
                        : lvl.strong
                          ? `0 0 14px ${lvl.color}`
                          : "none",
                    }}
                  />
                </div>

                {/* value */}
                <div
                  className={lvl.strong ? "absolute text-slate-50" : "absolute text-slate-300"}
                  style={{
                    left: `${x + 18}px`,
                    transform: "translateY(-50%)",
                    fontSize: lvl.strong ? "15px" : "14px",
                    fontWeight: lvl.strong ? 700 : 600,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  ${Number(lvl.value).toFixed(2)}
                </div>

                {/* near spot badge */}
                {isFlip && flipVeryClose && (
                  <div
                    className="absolute rounded-full border px-2 py-0.5"
                    style={{
                      left: `${x + 96}px`,
                      transform: "translateY(-50%)",
                      fontSize: "10px",
                      letterSpacing: "0.08em",
                      color: "#fbbf24",
                      borderColor: "rgba(245,158,11,0.28)",
                      background: "rgba(245,158,11,0.08)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    NEAR SPOT
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GexBar({ point, maxAbs, price }) {
  const value = point.net ?? 0;
  const pct   = maxAbs > 0 ? (Math.abs(value) / maxAbs) * 50 : 0;
  const isNear = Math.abs(point.strike - price) / price < 0.03;
  const isPos  = value >= 0;

  return (
    <div className={`gex-row ${isNear ? "opacity-100" : "opacity-30"}`}>
      <span className={`gex-strike ${isNear ? "text-slate-200" : "text-slate-400"}`}>
        {point.strike}
      </span>
      <div className="gex-track relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/10 -translate-x-1/2" />
        <div className="gex-fill absolute top-0 h-full rounded-sm" style={{
          width: `${pct}%`,
          left: isPos ? "50%" : `${50 - pct}%`,
          background: isPos
            ? "linear-gradient(90deg,#dc2626,#f87171)"
            : "linear-gradient(90deg,#7c3aed,#a78bfa)",
        }} />
      </div>
      <span className={`w-16 text-right text-[0.95rem] tabular-nums font-bold ${isPos ? "text-red-400" : "text-violet-400"}`}>
        {value > 0 ? "+" : ""}
        {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-20">
      <div className="w-6 h-6 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
      <span className="text-[0.95rem] tracking-[0.22em] text-slate-400 uppercase">Loading market data</span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [ticker, setTicker]         = useState("AAPL");
  const [inputVal, setInputVal]     = useState("AAPL");
  const [msData, setMsData]         = useState(null);
  const [gexData, setGexData]       = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState("structure");

  // ── Key management ──
  const [keyStatus, setKeyStatus]   = useState({ tv: null, anthropic: null }); // null=unknown
  const [tvDraft, setTvDraft]       = useState("");
  const [anthDraft, setAnthDraft]   = useState("");
  const [keysSaving, setKeysSaving] = useState(false);
  const [keysError, setKeysError]   = useState(null);

  const fetchKeyStatus = useCallback(async () => {
    try {
      const r = await fetch(`${PROXY}/keys/status`);
      const d = await r.json();
      setKeyStatus(d);
    } catch { /* proxy not up yet */ }
  }, []);

  const saveKeys = async () => {
    const payload = {};
    if (tvDraft.trim())   payload.tv        = tvDraft.trim();
    if (anthDraft.trim()) payload.anthropic = anthDraft.trim();
    if (!Object.keys(payload).length) return;
    setKeysSaving(true);
    setKeysError(null);
    try {
      const r = await fetch(`${PROXY}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await fetchKeyStatus();
      setTvDraft("");
      setAnthDraft("");
    } catch (e) {
      setKeysError(e.message);
    } finally {
      setKeysSaving(false);
    }
  };

  const loadData = useCallback(async (sym) => {
    setLoading(true);
    setError(null);
    setMsData(null);
    setGexData(null);
    setAiAnalysis(null);
    try {
      const { ms, gex } = await loadTickerData(sym);
      setMsData(ms);
      setGexData(gex);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeyStatus(); loadData("AAPL"); }, []);

  const runAI = async () => {
    if (!msData) return;
    setAiLoading(true);
    setAiAnalysis(null);
    setActiveTab("ai");
    try {
      const brief = await getAIBrief(ticker, msData?.data, gexData?.data?.totals);
      setAiAnalysis(brief);
    } catch (e) {
      setAiAnalysis("Error: " + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSearch = () => {
    const sym = inputVal.trim().toUpperCase();
    if (sym) { setTicker(sym); loadData(sym); }
  };

  const ms          = msData?.data;
  const sf          = ms?.supporting_factors;
  const kl          = ms?.key_levels;
  const price       = kl?.spot || gexData?.data?.price;
  const gexPoints   = gexData?.data?.points || [];
  const maxAbs      = Math.max(...gexPoints.map(p => Math.abs(p.net || 0)), 1);
  const nearStrikes = gexPoints
    .filter(p => price && Math.abs(p.strike - price) / price < 0.08)
    .sort((a, b) => a.strike - b.strike);

  const TABS = [
    { id: "structure", label: "Structure" },
    { id: "levels",    label: "Levels"    },
    { id: "gex",       label: "GEX"       },
    { id: "ai",        label: "⚡ AI Brief"},
  ];

  return (
    <div className="min-h-screen bg-slate-950 bg-grid-pattern bg-grid font-mono text-slate-300" style={{background:"#020617"}}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-slate-900 border-b border-white/[0.05]"
              style={{ boxShadow: "0 4px 32px rgba(0,0,0,0.5)" }}>

        {/* Primary nav */}
        <div className="flex items-center gap-4 px-6 py-3 flex-wrap">

          {/* Wordmark */}
          <div className="shrink-0 mr-1">
            <div className="font-display text-[26px] tracking-[0.16em] leading-none text-amber-400"
                 style={{ textShadow: "0 0 24px rgba(245,158,11,0.4)" }}>
              VOLSCAN
            </div>
            <div className="text-[0.85rem] tracking-[0.24em] text-slate-400 uppercase mt-0.5">
              Options Intelligence
            </div>
          </div>

          <div className="h-7 w-px bg-white/[0.06] shrink-0" />

          {/* Search */}
          <div className="flex gap-2 items-center">
            <input
              value={inputVal}
              onChange={e => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="TICKER"
              className="w-28 bg-white/[0.04] border border-white/[0.08] rounded px-3 py-1.5
                         text-[1.2rem] tracking-widest text-slate-200 placeholder-slate-400
                         focus:outline-none focus:border-amber-400/50 transition-colors font-mono"
            />
            <button onClick={handleSearch} className="btn-scan">SCAN</button>
          </div>

          {/* Demo chips */}
          <div className="flex gap-1.5 flex-wrap">
            {DEMO_TICKERS.map(t => (
              <button key={t}
                      onClick={() => { setInputVal(t); setTicker(t); loadData(t); }}
                      className={`ticker-chip ${ticker === t ? "active" : ""}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* AI button */}
          {ms && (
            <button onClick={runAI} disabled={aiLoading} className="btn-ai">
              {aiLoading ? "ANALYZING…" : "⚡ AI BRIEF"}
            </button>
          )}
        </div>

        {/* API key subrow */}
        <div className="flex items-center gap-4 px-6 py-2 border-t border-white/[0.04] flex-wrap"
             style={{ background: "rgba(0,0,0,0.22)" }}>

          {/* TV Key */}
          <div className="flex items-center gap-2">
            <span className="text-[0.9rem] tracking-[0.18em] text-slate-400 uppercase shrink-0">TV</span>
            {keyStatus.tv?.active ? (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse2 inline-block" />
                <span className="text-[1.0rem] text-slate-400 font-mono">{keyStatus.tv.masked}</span>
                <span className="text-[0.9rem] px-1.5 py-0.5 rounded border border-emerald-500/25
                                 text-emerald-600 bg-emerald-500/[0.06] tracking-wider">FULL ACCESS</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                <span className="text-[0.9rem] text-slate-400">demo only</span>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-white/[0.06] shrink-0" />

          {/* Anthropic Key */}
          <div className="flex items-center gap-2">
            <span className="text-[0.9rem] tracking-[0.18em] text-slate-400 uppercase shrink-0">AI</span>
            {keyStatus.anthropic?.active ? (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse2 inline-block" />
                <span className="text-[1.0rem] text-slate-400 font-mono">{keyStatus.anthropic.masked}</span>
                <span className="text-[0.9rem] px-1.5 py-0.5 rounded border border-amber-500/25
                                 text-amber-600 bg-amber-500/[0.06] tracking-wider">ENABLED</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                <span className="text-[0.9rem] text-slate-400">ai disabled</span>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-white/[0.06] shrink-0" />

          {/* Key inputs */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="password"
              value={tvDraft}
              onChange={e => setTvDraft(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveKeys()}
              placeholder="TV key…"
              className="key-input w-32"
            />
            <input
              type="password"
              value={anthDraft}
              onChange={e => setAnthDraft(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveKeys()}
              placeholder="Anthropic key…"
              className="key-input w-40"
            />
            <button
              onClick={saveKeys}
              disabled={keysSaving || (!tvDraft.trim() && !anthDraft.trim())}
              className="text-[0.9rem] px-2.5 py-1.5 rounded border border-white/[0.08] text-slate-400
                         hover:border-amber-400/40 hover:text-amber-400 transition-all duration-150
                         disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer bg-transparent tracking-wider"
            >
              {keysSaving ? "SAVING…" : "SET"}
            </button>
            {keysError && <span className="text-[0.9rem] text-red-500">✗ {keysError}</span>}
          </div>
        </div>
      </header>

      {/* ══ MAIN ════════════════════════════════════════════════════════════ */}
      <main className="px-6 py-7 max-w-screen-xl mx-auto">

        {loading && <Spinner />}

        {error && !loading && (
          <div className="mb-5 p-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] animate-fade-up">
            <p className="text-red-400 text-xs font-semibold mb-1">⚠ Failed to load</p>
            <p className="text-slate-400 text-[1.1rem]">{error}</p>
            <p className="text-slate-400 text-[1.0rem] mt-2">
              Demo tickers: {DEMO_TICKERS.join(", ")} — check proxy is running on :3001
            </p>
          </div>
        )}

        {ms && !loading && (
          <div className="space-y-6">

            {/* ── Hero ── */}
            <div className="animate-fade-up flex items-start justify-between gap-6 flex-wrap">
              <div>
                <div className="flex items-baseline gap-4 flex-wrap">
                  <span className="font-display text-[64px] leading-none tracking-wider text-white">
                    {ticker}
                  </span>
                  {price && (
                    <span className="font-display text-[44px] leading-none text-amber-400"
                          style={{ textShadow: "0 0 20.9rem rgba(245,158,11,0.35)" }}>
                      ${Number(price).toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <BiasChip bias={ms.bias} />
                  <span className="text-slate-800">·</span>
                  {ms.tags?.slice(0, 5).map(tag => (
                    <span key={tag} className="text-[0.85rem] tracking-widest text-slate-400 uppercase">| {tag}</span>
                  ))}
                </div>
                <p className="mt-3 text-slate-400 text-[1.1rem] leading-relaxed max-w-xl">
                  {ms.headline}
                </p>
              </div>

              {ms.signal && (
                <div className="shrink-0 rounded-xl border border-amber-400/15 px-5 py-4 text-right"
                     style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.06),rgba(245,158,11,0.02))" }}>
                  <p className="text-[0.85rem] tracking-[0.22em] text-amber-600 uppercase mb-1">Signal</p>
                  <p className="text-amber-400 font-semibold text-[13px] tracking-wide">{ms.signal}</p>
                  <p className="text-[0.95rem] text-slate-400 mt-1 tracking-wide">{ms.structure_regime}</p>
                </div>
              )}
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-6 border-b border-white/[0.05]">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`tab-btn ${activeTab === t.id ? "active" : ""}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Structure ── */}
            {activeTab === "structure" && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

                <Card title="Gamma Structure" accent="#f59e0b">
                  <MetricRow label="Flip Price"      value={fmt$(kl?.gamma_flip)} highlight />
                  <MetricRow label="Dist to Flip"    value={fmtPct(sf?.distance_to_flip_pct)} />
                  <MetricRow label="GEX / 1% Move"   value={sf?.gamma_notional_per_1pct_move_usd
                    ? `$${(sf.gamma_notional_per_1pct_move_usd/1e6).toFixed(0)}M` : "—"} />
                  <MetricRow label="Gamma Tone"      value={ms.drivers?.gamma_tone?.state} />
                  <MetricRow label="% Expiring Near" value={fmtPct(sf?.pct_gamma_expiring_nearest_expiry)} />
                </Card>

                <Card title="Skew & Positioning" accent="#818cf8">
                  <MetricRow label="PCR (OI)"       value={sf?.pcr_oi?.toFixed(2)} />
                  <MetricRow label="PCR (Volume)"   value={sf?.pcr_volume?.toFixed(2)} />
                  <MetricRow label="Put IV Premium" value={fmtPct(sf?.put_call_25d_iv_premium_pct)} />
                  <MetricRow label="Skew Tone"      value={ms.drivers?.skew_tone?.state} />
                  <MetricRow label="Call Regime"    value={sf?.call_regime} />
                </Card>

                <Card title="Expected Move" accent="#34d399">
                  <div className="flex gap-2.5 mb-4">
                    {[
                      { t: "1 DAY",  v: sf?.expected_move_pct_1d },
                      { t: "1 WEEK", v: sf?.expected_move_pct_1w },
                    ].map(({ t, v }) => (
                      <div key={t} className="flex-1 rounded-lg bg-slate-400/50 border border-white/[0.05] p-3 text-center">
                        <p className="text-[0.85rem] tracking-widest text-slate-400 uppercase mb-1.5">{t}</p>
                        <p className="text-emerald-400 font-semibold tabular-nums text-sm">
                          {v != null ? `±${Number(v).toFixed(2)}%` : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                  <MetricRow label="Spec Interest"    value={sf?.speculative_interest_score?.toFixed(2)} />
                  <MetricRow label="Structure Regime" value={ms.structure_regime} dim />
                </Card>

                <Card title="Interpretation" accent="#64748b">
                  <p className="text-slate-400 text-[1.1rem] leading-relaxed mb-4">
                    {ms.expected_behavior}
                  </p>
                  {ms.drivers?.skew_tone?.tags?.length > 0 && (
                    <>
                      <p className="card-label mb-2">Skew Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ms.drivers.skew_tone.tags.map(tag => (
                          <span key={tag}
                                className="text-[0.95rem] px-2 py-0.5 rounded border border-amber-500/20
                                           text-amber-600 bg-amber-500/[0.05] tracking-wider">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </Card>

              </div>
            )}

            {/* ── Levels ── */}
            {activeTab === "levels" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Price Dispersion" accent="#f59e0b">
                  <PriceDispersionChart kl={kl} />
                </Card>

                <Card title="Flip Context" accent="#f59e0b">
                  <p className="text-amber-400 font-semibold text-sm tracking-wide mb-2">
                    {ms.drivers?.flip_context?.state?.replace(/_/g, " ").toUpperCase()}
                  </p>
                  <p className="text-slate-400 text-[1.1rem] leading-relaxed mb-4">
                    {ms.drivers?.flip_context?.label}
                  </p>
                  <MetricRow label="Distance to Flip"
                             value={ms.drivers?.flip_context?.distance_pct != null
                               ? `${Number(ms.drivers.flip_context.distance_pct).toFixed(2)}%` : "—"}
                             highlight />
                  <MetricRow label="Gamma Tone" value={ms.drivers?.gamma_tone?.label} />
                  <MetricRow label="Sentiment"  value={ms.drivers?.sentiment} />
                </Card>
              </div>
            )}

            {/* ── GEX ── */}
            {activeTab === "gex" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="GEX By Strike — ±8% from spot" accent="#34d399">
                  <p className="text-[0.95rem] text-slate-400 mb-4 leading-relaxed">
                    Red = positive net GEX · Purple = negative net GEX
                  </p>
                  {nearStrikes.length > 0 ? (
                    <div className="space-y-0.5">
                      {[...nearStrikes]
                        .sort((a, b) => b.strike - a.strike)
                        .map((p) => (
                          <GexBar key={p.strike} point={p} maxAbs={maxAbs} price={price} />
                        ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-[1.1rem]">No GEX data available.</p>
                  )}
                </Card>

                <Card title="GEX Summary" accent="#34d399">
                  {gexData?.data?.totals ? (
                    <>
                      <MetricRow label="Flip Price"
                                 value={fmt$(gexData.data.totals.gex_flip_price)} highlight />
                      <MetricRow label="GEX / 1% Move"
                                 value={gexData.data.totals.gex_value_per_1pct
                                   ? `$${(gexData.data.totals.gex_value_per_1pct/1e6).toFixed(0)}M` : "—"} />
                      <MetricRow label="Put / Call OI"
                                 value={gexData.data.totals.put_call_oi?.toFixed(2)} />
                    </>
                  ) : (
                    <p className="text-slate-400 text-[1.1rem]">No totals available.</p>
                  )}

                  {ms.drivers?.gamma_tone && (
                    <div className="mt-5 p-3.5 rounded-lg border border-white/[0.05] bg-slate-400/40">
                      <p className="text-[0.85rem] tracking-[0.2em] text-slate-400 uppercase mb-1.5">Gamma Tone</p>
                      <p className="text-emerald-400 text-xs font-semibold mb-1">{ms.drivers.gamma_tone.state}</p>
                      <p className="text-slate-400 text-[1.0rem] leading-relaxed">{ms.drivers.gamma_tone.label}</p>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* ── AI Brief ── */}
            {activeTab === "ai" && (
              <div className="max-w-2xl">
                <div className="rounded-xl border border-amber-400/10 p-6 animate-fade-up"
                     style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.04),rgba(245,158,11,0.01))" }}>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-amber-400 text-lg">⚡</span>
                      <div>
                        <p className="text-[0.85rem] tracking-[0.2em] text-amber-600 uppercase">AI Trading Brief</p>
                        <p className="text-slate-400 text-[1.0rem] mt-0.5">{ticker}</p>
                      </div>
                    </div>
                    {!aiAnalysis && !aiLoading && (
                      <button onClick={runAI} className="btn-ai">GENERATE</button>
                    )}
                  </div>

                  {aiLoading && (
                    <div className="flex items-center gap-3 py-8 justify-center">
                      <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                      <span className="text-[0.95rem] tracking-[0.2em] text-slate-400">GENERATING ANALYSIS…</span>
                    </div>
                  )}

                  {!aiLoading && !aiAnalysis && (
                    <p className="text-slate-400 text-[1.1rem] leading-relaxed">
                      Generate a Claude-powered brief with regime context, key risks,
                      trade setup ideas, and watch levels.
                    </p>
                  )}

                  {aiAnalysis && (
                    <div
                      className="text-slate-400 text-[1.2rem] leading-7
                                 [&_strong]:text-amber-400 [&_strong]:font-semibold [&_strong]:tracking-wide"
                      dangerouslySetInnerHTML={{ __html: parseMarkdown(aiAnalysis) }}
                    />
                  )}
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <footer className="mt-16 px-6 py-4 border-t border-white/[0.03] flex items-center justify-between">
        <span className="text-[0.85rem] tracking-[0.22em] text-slate-800 uppercase">
          Volscan · Data via Trading Volatility API
        </span>
        <span className="text-[0.85rem] tracking-[0.22em] text-slate-800 uppercase">
          {new Date().toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" })}
        </span>
      </footer>
    </div>
  );
}
