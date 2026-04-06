import { PROXY } from "./apiFetch.js";

export async function getNewsData(ticker, { signal } = {}) {
  const res = await fetch(`${PROXY}/news/${encodeURIComponent(ticker)}`, {
    signal: signal ?? AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? ": " + text.slice(0, 120) : ""}`);
  }
  return res.json();
}
