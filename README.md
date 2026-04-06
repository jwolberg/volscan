# VOLSCAN — Options Market Intelligence Dashboard

> A locally-run options analytics terminal built on the [Trading Volatility API](https://tradingvolatility.net), with an AI-powered trading brief and interactive chat assistant powered by Claude.

---

## Short Description

**VOLSCAN** is a dark-themed, Bloomberg-style options dashboard that displays real-time gamma structure, skew, expected moves, and key price levels for any ticker. It proxies the Trading Volatility API, Anthropic's Claude API, and Finnhub's news API through a local Express server so your keys never touch the browser.

---

## Detailed Summary

### What it is

VOLSCAN is a self-hosted React + Node.js web app for options traders who want fast, structured access to market microstructure data — gamma exposure, skew positioning, flip levels, and expected move bands — alongside an AI-generated trading brief that synthesizes all of it into actionable context.

The UI is intentionally terminal-dense: monospace fonts, dark navy backgrounds, amber accents, and data-first layout. No charting libraries.

---

### Architecture

```
volscan/
├── proxy/
│   └── server.js              # Express proxy — TV API + Anthropic API + Finnhub news
├── src/
│   ├── api/
│   │   ├── apiFetch.js        # Base fetch wrapper + PROXY constant
│   │   ├── apiFetch.test.js
│   │   ├── getAIBrief.js      # Claude AI brief request + markdown parser
│   │   ├── getAIBrief.test.js
│   │   ├── getNewsData.js     # Finnhub news fetch wrapper
│   │   ├── loadTickerData.js  # Fetches market-structure + gamma expirations
│   │   └── loadTickerData.test.js
│   ├── App.jsx                # React UI
│   ├── index.css              # Tailwind + component layer
│   └── main.jsx               # React entry point
├── .env                       # API keys (gitignored)
├── index.html
├── package.json
├── tailwind.config.mjs
└── vite.config.mjs
```

Two processes start concurrently via `npm run dev`:

| Process | Port | Role |
|---|---|---|
| `node proxy/server.js` | 3001 | Reverse-proxy for TV API and Anthropic |
| `vite` | 5173 | React dev server with HMR |

The React app only ever talks to `localhost:3001`. No API keys are sent from the browser.

---

### Proxy (`proxy/server.js`)

Built with Express + CommonJS. Reads keys from `.env` on startup and exposes runtime key management endpoints so keys can also be set from the UI without restarting.

**Routes:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health check — reports key status |
| `GET` | `/tv/*` | Proxies to `stocks.tradingvolatility.net/api/v2/*` |
| `POST` | `/anthropic` | Proxies to `api.anthropic.com/v1/messages` |
| `GET` | `/news/:ticker` | Proxies to Finnhub company news endpoint, returns top 5 articles |
| `GET` | `/keys/status` | Returns masked active key status |
| `POST` | `/keys` | Sets TV and/or Anthropic key for the current session; persists to `.env` |

**TV API auth logic:**
- If `TV_DEMO=1` in `.env` or no real key is set → sends `X-TV-DEMo: 1` header (demo mode, limited to a fixed set of tickers)
- If a real key is present → sends `Authorization: Bearer <key>`

---

### React App (`src/App.jsx`)

Single-file React component, no external UI library. Styled entirely with Tailwind CSS v3 and a custom component layer in `index.css` (cards, metric rows, tab buttons, GEX bars, bias chips).

**Four tabs:**

1. **Structure** — Gamma structure (flip price, dist to flip, GEX/1% move, gamma tone, % expiring), Skew & Positioning (PCR OI/vol, put IV premium, skew tone, call regime), Expected Move (1D/1W EM boxes, spec interest, structure regime), and Interpretation (expected behavior narrative, skew tags)

2. **Levels** — Price Dispersion chart: a custom SVG-free absolute-positioned visualization showing all sigma levels (±1σ 1D/1W/1M) and the gamma flip on a vertical price rail with vol-cone spread geometry. Highlights when flip is near spot. Flip Context card with distance, gamma tone label, and sentiment.

3. **GEX** — Horizontal bi-directional bar chart (red = positive net GEX / dealer buying pressure, purple = negative net GEX / dealer selling pressure), centered at zero, sorted highest-to-lowest strike. Bars within 3% of spot are full opacity; outside 8% are filtered out entirely. Supports **multiple expirations** displayed as color-coded overlapping bars: nearest (amber), first weekly (green), first monthly (blue), all other expiries (slate). GEX Summary card with flip price, GEX per 1% move, put/call OI, and gamma tone callout.

4. **⚡ AI Brief** — Sends the full market structure JSON and gamma expirations to Claude (`claude-sonnet-4-6`) via the local proxy. Returns a structured brief with five sections: REGIME SNAPSHOT, KEY RISKS, TRADE SETUP IDEAS, WATCH LEVELS, BOTTOM LINE. Under 300 words. References actual price levels. Once generated, a **💬 CHAT** button appears in the brief header to open the chat assistant pre-loaded with the brief as context.

**News Widget (persistent, below tabs):**
- Fetches up to 5 recent news articles for the searched ticker via [Finnhub](https://finnhub.io) (7-day window)
- Each article shows headline, source, time since publication, and an expandable one-sentence summary
- Click a headline to expand its summary; click the source link (`Reuters →`) to open the full article in a new tab
- Updates automatically on every ticker search; clears immediately when ticker changes so stale articles are never shown
- Requires `FINNHUB_API_KEY` in `.env` — widget shows a graceful error state if the key is missing

**Chat Assistant (💬 CHAT drawer):**
- Available globally via the CHAT button in the header, or directly from the AI Brief tab once a brief has been generated
- Opens a slide-in panel from the right
- Maintains a full conversation thread for the session
- System prompt is automatically loaded with the current ticker's market structure data; when opened from the AI Brief tab, the generated brief is also included so Claude can answer follow-up questions about specific risks, setups, or levels
- Requires Anthropic API key to be set

**Header:**
- Wordmark + ticker search input + SCAN button
- Demo ticker chips: AAPL, META, AMZN, XOM, GM, MCD, KO
- ⚡ AI BRIEF shortcut button (visible when data is loaded)
- 💬 CHAT button — opens the chat assistant
- API key subrow: live status indicators for TV and Anthropic keys, password inputs to set/update either key at runtime without restarting the proxy

---

### Setup

**1. Clone and install**
```bash
git clone <your-repo>
cd volscan
npm install
```

**2. Configure API keys**

The recommended approach is to set keys directly in `.env` — the proxy loads them on startup with no manual entry required:

```env
# Trading Volatility API key — leave blank or set TV_DEMO=1 for demo tickers only
TV_API_KEY=your_tv_key_here

# Set to 1 to force demo mode regardless of TV_API_KEY
TV_DEMO=0

# Anthropic API key — required for AI Brief and Chat features
ANTHROPIC_API_KEY=sk-ant-...

# Finnhub API key — required for the News widget (free tier at finnhub.io)
FINNHUB_API_KEY=your_finnhub_key_here
```

Alternatively, keys can be entered via the UI at runtime (see step 3). Keys set through the UI are automatically written back to `.env` so they persist across restarts.

**3. Run**
```bash
npm run dev
```

Opens at **http://localhost:5173**. The proxy starts automatically on **http://localhost:3001**.

Keys can also be set from the UI at runtime — paste into the TV/Anthropic inputs in the header and click SET. This updates the proxy's in-memory keys immediately **and writes them to `.env`**, so they are automatically loaded on the next restart.

**4. [ Optional ] Override proxy URL**

If the proxy runs on a non-default port or host, set `VITE_PROXY_URL` in your `.env`:
```env
VITE_PROXY_URL=http://localhost:3001
```

**5. Run tests**
```bash
npm test
```

---

### Demo Tickers

Without a TV API key (or with `TV_DEMO=1`), the following tickers are available via the Trading Volatility demo endpoint: **AAPL, META, AMZN, XOM, GM, MCD, KO, VIX**

---

### Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 |
| Styling | Tailwind CSS v3 + custom `@layer components` |
| Build tool | Vite 5 |
| Proxy server | Express 4 (CommonJS) |
| Env management | dotenv |
| Dev orchestration | concurrently |
| Data source | [Trading Volatility API](https://tradingvolatility.net) |
| News source | [Finnhub](https://finnhub.io) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Test runner | Vitest |

---

### Notes

- The production build (`npm run build`) outputs to `dist/` and still expects a proxy running on port 3001. Update `const PROXY` in `src/App.jsx` before deploying to point at your hosted proxy.
- Keys set via the UI are written to `.env` automatically and will be loaded on next startup. No manual editing required.
- `.env` is gitignored. Never commit API keys.
- The Finnhub free tier supports up to 60 API calls/minute — more than sufficient for interactive use.
