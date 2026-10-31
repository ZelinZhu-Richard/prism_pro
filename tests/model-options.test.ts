import test from "node:test";
import assert from "node:assert/strict";
import { connectedModels, modelKey } from "../shared/model-options";
import type { ProviderState } from "../shared/types";
const state = (
  models: string[],
  extra: Partial<ProviderState> = {},
): ProviderState => ({ configured: true, source: "session", models, ...extra });

test("one picker combines Codex login with Claude API and preserves the selected connection", () => {
  const choices = connectedModels({
    codex: state(["gpt-6.1-sol", "gpt-6-luna"], {
      source: "cli",
      modelOptions: [
        { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
        { id: "gpt-6-luna", label: "GPT-6 Luna" },
      ],
    }),
    anthropic: state(["claude-sonnet-5-5", "claude-opus-5-5"]),
    openai: state(["gpt-6.1-sol"]),
    deepseek: state(["deepseek-flash"], { configured: false }),
  });
  assert.equal(choices.length, 5);
  assert.ok(
    choices.some((c) => c.provider === "codex" && c.connection === "Codex CLI"),
  );
  assert.ok(
    choices.some(
      (c) => c.provider === "anthropic" && c.connection === "Anthropic API",
    ),
  );
  assert.equal(new Set(choices.map((c) => modelKey(c.provider, c.id))).size, 5);
  assert.equal(
    choices.some((c) => c.id === "default" || c.provider === "deepseek"),
    false,
  );
});
test("model choices use discovered text models, omit duplicates and unsupported modalities, and retain unknown names", () => {
  const choices = connectedModels({
    openai: state([
      "gpt-next",
      "gpt-next",
      "gpt-image-1",
      "gpt-realtime",
      "text-embedding-3-small",
    ]),
    gemini: state(["gemini-next-pro", "gemini-embedding-1"]),
    "claude-code": state(["default", "sonnet", "opus", "haiku"], {
      source: "cli",
    }),
  });
  assert.deepEqual(
    choices.map((c) => c.id),
    ["gpt-next", "gemini-next-pro", "sonnet", "opus", "haiku"],
  );
  assert.deepEqual(connectedModels(), []);
  assert.deepEqual(connectedModels({ codex: state([]) }), []);
});
