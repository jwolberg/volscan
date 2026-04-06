import { PROXY } from "./apiFetch.js";

export function parseMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

export async function getAIBrief(ticker, msData, gammaExpirations) {
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
        content: `Analyze ${ticker}:\n\n${JSON.stringify({ market_structure: msData, gamma_expirations: gammaExpirations }, null, 2)}`
      }]
    }),
  });
  const d = await res.json();
  return d.content?.map(b => b.text || "").join("\n") || "No response.";
}
