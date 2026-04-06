import { apiFetch } from "./apiFetch.js";

export async function loadTickerData(ticker, { signal } = {}) {
  const [ms, gex] = await Promise.all([
    apiFetch(`/tickers/${ticker}/market-structure`, { signal }),
    apiFetch(`/tickers/${ticker}/curves/gamma/expirations`, { signal }),
  ]);
  return { ms, gex };
}
