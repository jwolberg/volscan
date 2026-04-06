import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "./apiFetch.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("returns parsed JSON on a successful response", async () => {
    const payload = { price: 195.5 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    }));

    const result = await apiFetch("/tickers/AAPL/market-structure");
    expect(result).toEqual(payload);
  });

  it("throws with status code on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    }));

    await expect(apiFetch("/tickers/AAPL/market-structure")).rejects.toThrow("HTTP 429");
  });

  it("includes truncated body in the error message", async () => {
    const longBody = "x".repeat(200);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => longBody,
    }));

    await expect(apiFetch("/tickers/AAPL/market-structure")).rejects.toThrow(
      /HTTP 500: x{120}/
    );
  });

  it("throws cleanly when the body read fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => { throw new Error("body read failed"); },
    }));

    await expect(apiFetch("/test")).rejects.toThrow("HTTP 503");
  });

  it("forwards a caller-supplied AbortSignal", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const signal = AbortSignal.timeout(5000);
    await apiFetch("/test", { signal });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal })
    );
  });
});
