import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseMarkdown, getAIBrief } from "./getAIBrief.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── parseMarkdown ────────────────────────────────────────────────────────────

describe("parseMarkdown", () => {
  it("converts **text** to <strong>", () => {
    expect(parseMarkdown("**REGIME SNAPSHOT**")).toBe("<strong>REGIME SNAPSHOT</strong>");
  });

  it("converts newlines to <br/>", () => {
    expect(parseMarkdown("line1\nline2")).toBe("line1<br/>line2");
  });

  it("handles both transforms in the same string", () => {
    expect(parseMarkdown("**Header**\nbody")).toBe("<strong>Header</strong><br/>body");
  });

  it("returns plain text unchanged when no markdown is present", () => {
    expect(parseMarkdown("plain text")).toBe("plain text");
  });
});

// ─── getAIBrief ───────────────────────────────────────────────────────────────

describe("getAIBrief", () => {
  it("returns joined text from content blocks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        content: [{ text: "**BOTTOM LINE**" }, { text: "Bullish." }],
      }),
    }));

    const result = await getAIBrief("AAPL", {}, []);
    expect(result).toBe("**BOTTOM LINE**\nBullish."); // join("\n") adds the separator
  });

  it("falls back to 'No response.' when content is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({}),
    }));

    const result = await getAIBrief("AAPL", {}, []);
    expect(result).toBe("No response.");
  });

  it("sends POST to the proxy /anthropic endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: "ok" }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getAIBrief("META", { spot: 500 }, []);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/anthropic$/);
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.messages[0].content).toContain("META");
  });
});
