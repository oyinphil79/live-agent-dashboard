import type { Tokens } from "./types";

export const MODEL = "gpt-5-mini";

// USD per 1M tokens for gpt-5-mini. Reasoning tokens are billed as output
// and are already included in the output count the API returns.
// Check https://openai.com/api/pricing and update if it changes.
export const PRICE = { input: 0.25, output: 2.0 };

export function costOf(t: Tokens): number {
  return (t.input * PRICE.input + t.output * PRICE.output) / 1_000_000;
}
