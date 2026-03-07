# Volscan — Options Market Structure Intelligence

Volscan is a lightweight visualization client for exploring **options-driven market structure** using the **Trading Volatility Intelligence API**.

It provides fast visual diagnostics for understanding how **dealer positioning, gamma exposure, and volatility skew** may influence price behavior.

The application focuses on presenting **derived market structure signals**, not raw options data.

Key visualizations include:

• Gamma Exposure (GEX) by strike  
• Gamma flip level detection  
• Implied volatility skew diagnostics  
• Price dispersion across time horizons (1D / 1W / 1M)  
• Dealer positioning context  

Volscan is designed for traders, quants, and developers who want a **clean interface for interpreting options market structure in real time.**

---

# Architecture Overview

Volscan is intentionally lightweight.

All heavy analytics are computed by the **Trading Volatility API**.  
This frontend simply renders those results into visual diagnostics.

Browser
↓
Vite Dev Server (React) — 5173
↓
Local Proxy — 3001
↓
Trading Volatility API — stocks.tradingvolatility.net


The proxy handles:

- API authentication
- demo ticker routing
- CORS headers
- endpoint forwarding

---

# Features

### Gamma Exposure Visualization

Displays net gamma exposure by strike to highlight:

- potential **support / resistance zones**
- **gamma flip points**
- dealer hedging pressure

---

### Price Dispersion Model

Shows expected price dispersion across time horizons:

- **1 Day**
- **1 Week**
- **1 Month**

Spacing is proportional to **√time**, reflecting how volatility scales with time.

---

### Market Structure Context

The UI can display:

- Gamma tone
- Sentiment diagnostics
- Distance to gamma flip
- Dealer positioning context

These signals are computed server-side by the Trading Volatility intelligence layer.

---

# Quick Start

Install dependencies:

```bash
npm install
npm run dev

```





Opens at **http://localhost:5173** with the proxy running on **http://localhost:3001**.



## What runs

| Process | Port | What it does |
|---------|------|--------------|
| `vite`  | 5173 | React dev server with HMR |
| `proxy/server.js` | 3001 | Reverse-proxy to stocks.tradingvolatility.net |

## Proxy behaviour

- **Demo tickers** (AAPL, META, AMZN, XOM, GM, MCD, KO, VIX) — sends `X-TV-DEMo: 1`
- **All other tickers** — sends `Authorization: Bearer <key>`


---

## API keys required

| Key | Where to get it | Required? |
|---|---|---|
| `TV_API_KEY` | [tradingvolatility.net](https://tradingvolatility.net) | Yes — for market data |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | No — AI features disabled without it |


Enter your API key at the top of the page to access full features
---


## Health check

```
curl http://localhost:3001/health
```

