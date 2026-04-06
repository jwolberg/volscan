import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadTickerData } from "./loadTickerData.js";
import * as apiFetchModule from "./apiFetch.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadTickerData", () => {
  it("fires both requests in parallel and returns { ms, gex }", async () => {
    const msFixture  = { spot: 195.5, regime: "low_vol" };
    const gexFixture = { expirations: [] };

    vi.spyOn(apiFetchModule, "apiFetch").mockImplementation((path) => {
      if (path.includes("market-structure")) return Promise.resolve(msFixture);
      if (path.includes("expirations"))      return Promise.resolve(gexFixture);
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    const result = await loadTickerData("AAPL");
    expect(result).toEqual({ ms: msFixture, gex: gexFixture });
  });

  it("rejects if either request fails", async () => {
    vi.spyOn(apiFetchModule, "apiFetch").mockImplementation((path) => {
      if (path.includes("market-structure")) return Promise.resolve({ spot: 100 });
      return Promise.reject(new Error("HTTP 503"));
    });

    await expect(loadTickerData("AAPL")).rejects.toThrow("HTTP 503");
  });

  it("passes the signal through to apiFetch", async () => {
    const spy = vi.spyOn(apiFetchModule, "apiFetch").mockResolvedValue({});
    const signal = AbortSignal.timeout(5000);

    await loadTickerData("AAPL", { signal });

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mock.calls.forEach(([, opts]) => {
      expect(opts.signal).toBe(signal);
    });
  });
});
