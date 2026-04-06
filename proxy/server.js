require("dotenv").config();
console.log("[env] loaded from:", require("path").resolve(".env"));
console.log
console.log("[env] ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "found" : "NOT FOUND");
const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

function persistToEnv(key, value) {
  const envPath = path.resolve(".env");
  let content = "";
  try { content = fs.readFileSync(envPath, "utf8"); } catch {}
  const lines = content.split("\n");
  const idx   = lines.findIndex(l => l.startsWith(`${key}=`));
  const entry = `${key}=${value}`;
  if (idx >= 0) lines[idx] = entry;
  else lines.push(entry);
  fs.writeFileSync(envPath, lines.join("\n"), "utf8");
  console.log(`[env] persisted ${key} to .env`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// mutable — can be overridden at runtime via POST /keys
let TV_API_KEY        = process.env.TV_API_KEY        || "";
let ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const TV_DEMO         = (process.env.TV_DEMO || "").trim() === "1";
const TV_BASE         = "https://stocks.tradingvolatility.net/api/v2";
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY   || "";

console.log("[config] TV_DEMO Mode:", TV_DEMO ? "Demo mode ON. Tickers limited" : "OFF (valid TV_API_KEY required)");

function isPlaceholderKey(k) {
  const v = (k || "").trim().toLowerCase();
  return !v || v === "your_tv_api_key_here…";
}

// ── Health / key status ───────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    keys: {
      tv:        !isPlaceholderKey(TV_API_KEY) ? "✓ set" : "DEMO MODE",
      anthropic: ANTHROPIC_API_KEY              ? "✓ set" : "MISSING — AI disabled",
    },
  });
});

// ── Runtime key management ────────────────────────────────────────────────────
// POST /keys  { tv?: string, anthropic?: string }  → set keys for this session
app.post("/keys", (req, res) => {
  const { tv, anthropic } = req.body || {};
  if (tv        !== undefined) { TV_API_KEY        = tv.trim();        persistToEnv("TV_API_KEY",        TV_API_KEY);        }
  if (anthropic !== undefined) { ANTHROPIC_API_KEY = anthropic.trim(); persistToEnv("ANTHROPIC_API_KEY", ANTHROPIC_API_KEY); }
  console.log("[keys] updated — TV:", TV_API_KEY ? `${TV_API_KEY.slice(0,4)}…` : "cleared",
              "| Anthropic:", ANTHROPIC_API_KEY ? `${ANTHROPIC_API_KEY.slice(0,8)}…` : "cleared");
  res.json({
    tv:        !isPlaceholderKey(TV_API_KEY) ? "set" : "demo",
    anthropic: ANTHROPIC_API_KEY              ? "set" : "missing",
  });
});

// GET /keys/status  → what's currently active (masked)
app.get("/keys/status", (_req, res) => {
  res.json({
    tv:        !isPlaceholderKey(TV_API_KEY)
                 ? { active: true,  masked: TV_API_KEY.slice(0,4) + "…" }
                 : { active: false, masked: null },
    anthropic: ANTHROPIC_API_KEY
                 ? { active: true,  masked: ANTHROPIC_API_KEY.slice(0,8) + "…" }
                 : { active: false, masked: null },
  });
});

// ── Trading Volatility proxy ──────────────────────────────────────────────────
app.get("/tv/*", async (req, res) => {
  try {
    const url = `${TV_BASE}/${req.params[0]}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;

    const headers = {};
    const demoMode = TV_DEMO || isPlaceholderKey(TV_API_KEY);

    if (!TV_DEMO && !isPlaceholderKey(TV_API_KEY)) {
      headers.Authorization = `Bearer ${TV_API_KEY}`;
    } else {
      headers["X-TV-DEMo"] = "1";
    }

    const r = await fetch(url, { headers });

    if (r.status === 429) {
      const retry = r.headers.get("retry-after") || "unknown";
      console.warn(`[TV RATE LIMIT] ${demoMode ? "DEMO" : "KEY"} | ${req.params[0]} | retry-after=${retry}s`);
    }

    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const body = ct.includes("application/json") ? await r.json() : await r.text();

    res.status(r.status);

    if (ct.includes("application/json")) {
      return res.json(body);
    }

    return res.json({
      error: {
        status: r.status,
        message: typeof body === "string" ? body.slice(0, 500) : "Upstream returned non-JSON"
      }
    });

  } catch (err) {
    console.error("[TV]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Anthropic proxy ───────────────────────────────────────────────────────────
app.get("/anthropic", (_req, res) =>
  res.status(405).json({ error: "Use POST /anthropic" })
);

app.post("/anthropic", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    console.error("[Anthropic] ANTHROPIC_API_KEY is not set in .env");
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in .env" });
  }

  console.log("[Anthropic] →", req.body?.model, "| messages:", req.body?.messages?.length);

  let r, text;
  try {
    r    = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    text = await r.text();
  } catch (err) {
    console.error("[Anthropic] fetch failed:", err.message);
    return res.status(500).json({ error: `Fetch failed: ${err.message}` });
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[Anthropic] non-JSON response (status", r.status, "):\n", text.slice(0, 400));
    return res.status(r.status).send(text);
  }

  if (data.error) {
    console.error("[Anthropic] API error:", JSON.stringify(data.error));
  } else {
    console.log("[Anthropic] ✓ response type:", data.type, "| stop_reason:", data.stop_reason);
  }

  res.status(r.status).json(data);
});

// ── News proxy (Finnhub) ──────────────────────────────────────────────────────
const TICKER_RE = /^[A-Z0-9.^-]{1,10}$/i;

app.get("/news/:ticker", async (req, res) => {
  if (!FINNHUB_API_KEY) {
    return res.status(503).json({ error: "FINNHUB_API_KEY not configured" });
  }
  const { ticker } = req.params;
  if (!TICKER_RE.test(ticker)) {
    return res.status(400).json({ error: "Invalid ticker" });
  }
  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[news] Finnhub error:", r.status, text.slice(0, 200));
      return res.status(r.status).json({ error: `News provider returned HTTP ${r.status}` });
    }
    const data = await r.json();
    const articles = (Array.isArray(data) ? data : [])
      .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
      .slice(0, 5)
      .map(({ headline, summary, url: link, source, datetime }) => ({
        headline: headline || "",
        summary:  summary  || "",
        url:      link     || "",
        source:   source   || "",
        datetime: datetime || 0,
      }));
    res.json({ articles });
  } catch (err) {
    console.error("[news]", err.message);
    res.status(500).json({ error: "News fetch failed" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n✅  Proxy on http://localhost:${PORT}`);
  console.log(`    TV key:    ${TV_API_KEY ? TV_API_KEY.slice(0, 8) + "…" : "NOT SET"}`);
  console.log(`    Anthropic: ${ANTHROPIC_API_KEY ? "✓ set (" + ANTHROPIC_API_KEY.slice(0, 12) + "…)" : "NOT SET"}`);
  console.log(`    Health:    http://localhost:${PORT}/\n`);
});
