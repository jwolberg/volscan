const PROXY = import.meta.env.VITE_PROXY_URL ?? "http://localhost:3001";

export { PROXY };

export async function apiFetch(path, { signal } = {}) {
  const url = `${PROXY}/tv${path}`;
  const res = await fetch(url, {
    signal: signal ?? AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? ": " + text.slice(0, 120) : ""}`);
  }
  return res.json();
}
