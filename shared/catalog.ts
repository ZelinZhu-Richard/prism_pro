import type { Model, Provider } from "./types";
export const CATALOG_VERSION = "2026-10-30.2";
export const CATALOG_DATE = "2026-10-30";
// Standard synchronous, uncached USD / million tokens. Conservative context caps
// are supported-app limits, not claims about every provider's maximum window.
export const models: Model[] = [
  {
    id: "gemini-2.5-flash-lite",
    provider: "gemini",
    label: "Gemini 2.5 Flash-Lite",
    input: 0.1,
    output: 0.4,
    context: 100000,
    maxOutput: 4096,
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    label: "Gemini 3.5 Flash-Lite",
    input: 0.3,
    output: 2.5,
    context: 100000,
    maxOutput: 4096,
  },
  {
    id: "gemini-3.8-flash",
    provider: "gemini",
    label: "Gemini 3.8 Flash",
    input: 0.75,
    output: 3.75,
    priceExpires: "2027-01-01",
    context: 100000,
    maxOutput: 8192,
  },
  // Qwen prices vary by region/deployment and billing currency. Until verified
  // for this user's endpoint, keep these selectable but require explicit choice.
  {
    id: "qwen3.8-flash",
    provider: "qwen",
    label: "Qwen 3.8 Flash",
    input: null,
    output: null,
    context: 100000,
    maxOutput: 4096,
  },
  {
    id: "qwen3.7-plus",
    provider: "qwen",
    label: "Qwen 3.7 Plus",
    input: null,
    output: null,
    context: 100000,
    maxOutput: 8192,
  },
  {
    id: "qwen3.8-max",
    provider: "qwen",
    label: "Qwen 3.8 Max",
    input: null,
    output: null,
    context: 100000,
    maxOutput: 8192,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    label: "GPT-6 Luna",
    input: 0.1,
    output: 0.5,
    context: 100000,
    maxOutput: 4096,
  },
  {
    id: "gpt-6.1-sol",
    provider: "openai",
    label: "GPT-6.1 Sol",
    input: 2,
    output: 10,
    context: 100000,
    maxOutput: 8192,
  },
  {
    id: "gpt-6-astra",
    provider: "openai",
    label: "GPT-6 Astra",
    input: 10,
    output: 50,
    context: 100000,
    maxOutput: 8192,
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5",
    input: 0.1,
    output: 0.5,
    context: 100000,
    maxOutput: 4096,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    input: 2,
    output: 10,
    context: 100000,
    maxOutput: 8192,
  },
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    input: 4,
    output: 20,
    context: 100000,
    maxOutput: 8192,
  },
  // Peak rates are used as a conservative estimate. The actual bill may be lower.
  {
    id: "deepseek-flash",
    provider: "deepseek",
    label: "DeepSeek Flash",
    input: 0.3,
    output: 1.2,
    context: 100000,
    maxOutput: 4096,
  },
  {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    label: "DeepSeek V4 Pro",
    input: 1.32,
    output: 3.96,
    context: 100000,
    maxOutput: 8192,
  },
];
export const providerNames: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  qwen: "Qwen",
};
export function estimateCost(model: Model, input: number, output = 4096) {
  if (model.input === null || model.output === null) return Infinity;
  const m =
    model.longAbove && input > model.longAbove
      ? (model.longMultiplier ?? 1)
      : 1;
  return ((input * model.input + output * model.output) * m) / 1e6;
}
export function cheapest(
  provider: Provider,
  available: string[],
  input: number,
  output = 4096,
  catalog = models,
  now = new Date(),
) {
  const age = (now.getTime() - Date.parse(CATALOG_DATE)) / 86400000;
  if (age > 90) return null; // Explicit choice is required when the catalog is stale.
  return (
    catalog
      .filter(
        (m) =>
          m.provider === provider &&
          available.includes(m.id) &&
          input + output <= m.context &&
          output <= m.maxOutput &&
          Number.isFinite(m.input) &&
          Number.isFinite(m.output) &&
          (!m.priceExpires || now.getTime() < Date.parse(m.priceExpires)),
      )
      .sort(
        (a, b) =>
          estimateCost(a, input, output) - estimateCost(b, input, output) ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
