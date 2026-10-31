# Model catalog

Codex CLI and Claude Code are subscription-login backends, outside the API price ranking. Their catalog entries have null prices. Manual Type preserves the selected CLI model (or the CLI's default) and shows subscription usage limits. Claude exposes explicit Haiku/Sonnet/Opus aliases; both backends accept an explicit model identifier. Availability is determined by the CLI account when a request runs, with no automatic Prism model or provider fallback.

Version **2026-10-30.2**, checked **2026-10-30**. Catalog implementation: `shared/catalog.ts`.

Official pricing sources:

- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Qwen regional pricing](https://docs.bailian.console.aliyun.com/en/model-studio/model-pricing) and [recommended models](https://www.alibabacloud.com/help/en/model-studio/models)

Uncached, synchronous USD per million tokens used by the catalog:

| Provider  | Model                 | Input | Output |
| --------- | --------------------- | ----: | -----: |
| OpenAI    | gpt-6-luna            |  0.10 |   0.50 |
| OpenAI    | gpt-6.1-sol           |  2.00 |  10.00 |
| OpenAI    | gpt-6-astra           | 10.00 |  50.00 |
| Anthropic | claude-haiku-5-5      |  0.10 |   0.50 |
| Anthropic | claude-sonnet-5-5     |  2.00 |  10.00 |
| Anthropic | claude-opus-5-5       |  4.00 |  20.00 |
| DeepSeek  | deepseek-flash        |  0.30 |   1.20 |
| DeepSeek  | deepseek-v4-pro       |  1.32 |   3.96 |
| Gemini    | gemini-2.5-flash-lite |  0.10 |   0.40 |
| Gemini    | gemini-3.5-flash-lite |  0.30 |   2.50 |
| Gemini    | gemini-3.8-flash      |  0.75 |   3.75 |

DeepSeek uses peak rates as a conservative estimate. Batch, cached-input, off-peak, and subscription prices are not used for routing. Supported application limits are deliberately capped at 100,000 context tokens, with 4,096 output tokens for Manual Type. These limits are not claims about each provider's full context capacity.

A model is automatically eligible only if its exact ID is returned by the user's recent model-access verification, it appears in this maintained streaming-text catalog, and its context/output capacity and known prices fit the request. The catalog is a supported subset, not every model offered by a provider. Remove retired models from the catalog when updating it; stale catalogs fail to automatic selection after 90 days. Access checks expire after 24 hours. No fallback model or provider is attempted after an error.

Estimated input uses UTF-8 byte count plus an overhead allowance as a conservative token bound. Selection minimizes `(estimated_input × input_rate + 4096 × output_rate) / 1,000,000`. This is a routing estimate, not provider billing telemetry. Actual usage is normalized and stored from streamed provider responses.

Custom model identifiers require explicit selection; their pricing and capability cannot be inferred. Users can also explicitly choose a catalog model when the model-list API is unavailable. Explicit selection never establishes verified access by itself.

Gemini 3.8 Flash's listed promotional rates apply through December 31, 2026. Its automatic eligibility expires on January 1, 2027; the application requires an explicit choice if no other verified priced model fits. Paid-tier text rates are used even if a key has free-tier allowance.

Qwen 3.8 Flash, 3.7 Plus, and 3.8 Max are selectable. Alibaba pricing depends on region/deployment scope and billing currency; this release has not verified USD rates for each accepted endpoint. Their catalog prices are null, so Manual Type requires an explicit Qwen model selection. No currency conversion or cross-provider fallback is guessed.

Provider protocol references: [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai), [Gemini thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures), and [Qwen OpenAI compatibility](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope). Live model access is checked only when requested in Settings, never inferred from catalog membership.
