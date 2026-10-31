import { models, providerNames } from "./catalog";
import {
  providers,
  isCliProvider,
  type Provider,
  type ProviderState,
} from "./types";

export interface ModelChoice {
  provider: Provider;
  id: string;
  label: string;
  connection: string;
  isDefault?: boolean;
}
export const modelKey = (provider: Provider, id: string) => `${provider}:${id}`;
export const connectionName = (provider: Provider) =>
  isCliProvider(provider)
    ? providerNames[provider]
    : `${providerNames[provider]} API`;

function supportsComposer(provider: Provider, id: string) {
  if (isCliProvider(provider)) return true;
  if (
    /(embed|image|audio|tts|whisper|realtime|transcri|moderation|search|computer-use|deep-research|video|vision-only)/i.test(
      id,
    )
  )
    return false;
  return provider === "openai"
    ? /^(gpt-|o[1-9])/.test(id)
    : provider === "anthropic"
      ? /^claude-/.test(id)
      : provider === "gemini"
        ? /^gemini-/.test(id)
        : provider === "qwen"
          ? /^(qwen|qwq|qvq)/i.test(id)
          : /^deepseek-/i.test(id);
}

// Only connected sources contribute choices. Preserve the connection identity
// even when the same model can be reached through an API and a CLI login.
export function connectedModels(
  states: Partial<Record<Provider, ProviderState>> = {},
): ModelChoice[] {
  return providers.flatMap((provider) => {
    const state = states[provider];
    if (!state?.configured) return [];
    const choices =
      state.modelOptions ?? state.models.map((id) => ({ id, label: id }));
    return choices
      .filter(
        (m, i) =>
          m.id !== "default" &&
          supportsComposer(provider, m.id) &&
          choices.findIndex((n) => n.id === m.id) === i,
      )
      .map((m) => ({
        ...m,
        provider,
        connection: connectionName(provider),
        label:
          models.find(
            (known) => known.provider === provider && known.id === m.id,
          )?.label || m.label,
      }));
  });
}
