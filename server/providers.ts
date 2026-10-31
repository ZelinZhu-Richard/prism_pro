import type { ApiProvider as Provider, ProviderState } from "../shared/types";
import { AppError } from "./files";
import {
  providerConfig as config,
  environmentKey,
  providerBaseUrl,
  qwenBaseUrl,
} from "./provider-config";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  extraContent?: Record<string, unknown>;
}
export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  calls?: ToolCall[];
  callId?: string;
  extraContent?: Record<string, unknown>;
}
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface StreamResult {
  text: string;
  calls: ToolCall[];
  usage: Record<string, unknown>;
  extraContent?: Record<string, unknown>;
}
export interface ProviderInput {
  provider: Provider;
  model: string;
  system: string;
  messages: Message[];
  tools?: ToolSpec[];
  maxOutput: number;
  signal: AbortSignal;
  onText: (text: string) => void;
  fetcher?: typeof fetch;
  baseUrl?: string;
}
export class Keys {
  private values = new Map<Provider, string>();
  private states = new Map<Provider, ProviderState>();
  private qwenEndpoint?: string;
  baseUrl(provider: Provider) {
    return provider === "qwen" && this.qwenEndpoint
      ? this.qwenEndpoint
      : providerBaseUrl(provider);
  }
  key(provider: Provider) {
    return this.values.get(provider) || environmentKey(provider);
  }
  state(provider: Provider): ProviderState {
    const key = this.key(provider);
    let endpoint: { baseUrl?: string; error?: string } = {};
    if (provider === "qwen") {
      try {
        endpoint.baseUrl = this.baseUrl(provider);
      } catch {
        endpoint.error =
          "Invalid QWEN_BASE_URL. Use an official Alibaba Cloud endpoint.";
      }
    }
    return {
      ...this.states.get(provider),
      ...endpoint,
      configured: !!key,
      source: this.values.has(provider)
        ? "session"
        : key
          ? "environment"
          : "none",
      models: this.states.get(provider)?.models ?? [],
    };
  }
  all() {
    return Object.fromEntries(
      (Object.keys(config) as Provider[]).map((p) => [p, this.state(p)]),
    );
  }
  set(provider: Provider, value: string | undefined, baseUrl?: string) {
    if (!config[provider]) throw new AppError(400, "Unknown provider.");
    if (
      value !== undefined &&
      (value.length > 1000 || /[\r\n\x00]/.test(value))
    )
      throw new AppError(400, "Invalid API key.");
    if (baseUrl !== undefined) {
      if (provider !== "qwen")
        throw new AppError(400, "Only Qwen supports a regional endpoint.");
      try {
        this.qwenEndpoint = baseUrl.trim()
          ? qwenBaseUrl(baseUrl.trim())
          : undefined;
      } catch (e) {
        throw new AppError(400, (e as Error).message);
      }
    }
    if (value !== undefined) {
      if (value.trim()) this.values.set(provider, value.trim());
      else this.values.delete(provider);
    }
    this.states.delete(provider);
  }
  async verify(provider: Provider, fetcher = fetch) {
    if (!this.key(provider)) throw new AppError(400, "Add an API key first.");
    const all: string[] = [];
    const options: NonNullable<ProviderState["modelOptions"]> = [];
    let after = "";
    try {
      for (let page = 0; page < 10; page++) {
        const response = await fetcher(
          this.baseUrl(provider) +
            "/models" +
            (provider === "anthropic"
              ? "?limit=100" +
                (after ? "&after_id=" + encodeURIComponent(after) : "")
              : ""),
          {
            headers: headers(provider, this.key(provider)),
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "The API key was rejected."
              : `Model access check failed (HTTP ${response.status}).`,
          );
        const json = (await response.json()) as any;
        if (!Array.isArray(json.data))
          throw new Error("Unexpected model-list response.");
        all.push(
          ...json.data
            .filter((m: any) => m.lifecycle !== "retired")
            .map((m: any) => m.id)
            .filter((x: any) => typeof x === "string"),
        );
        options.push(
          ...json.data
            .filter(
              (m: any) => typeof m.id === "string" && m.lifecycle !== "retired",
            )
            .map((m: any) => ({ id: m.id, label: m.display_name || m.id })),
        );
        if (provider !== "anthropic" || !json.has_more || !json.last_id) break;
        after = json.last_id;
      }
      this.states.set(provider, {
        configured: true,
        source: this.state(provider).source,
        models: all,
        modelOptions: options,
        modelSource: "account",
        verifiedAt: new Date().toISOString(),
      });
    } catch (e) {
      const message =
        e instanceof Error &&
        /^Model access|^The API|^Unexpected/.test(e.message)
          ? e.message
          : "Could not reach the provider. Check your connection and API key.";
      this.states.set(provider, {
        configured: true,
        source: this.state(provider).source,
        models: [],
        error: message,
      });
      throw new AppError(502, message);
    }
    return this.state(provider);
  }
}
function headers(provider: Provider, key: string): Record<string, string> {
  return provider === "anthropic"
    ? {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      }
    : { "content-type": "application/json", Authorization: "Bearer " + key };
}
export function requestBody(input: ProviderInput) {
  const { provider, model, system, messages, tools, maxOutput } = input;
  if (provider === "openai") {
    const items: any[] = [];
    for (const m of messages) {
      if (m.role === "tool")
        items.push({
          type: "function_call_output",
          call_id: m.callId,
          output: m.content,
        });
      else {
        if (m.content) items.push({ role: m.role, content: m.content });
        for (const c of m.calls ?? [])
          items.push({
            type: "function_call",
            call_id: c.id,
            name: c.name,
            arguments: c.arguments,
          });
      }
    }
    return {
      model,
      instructions: system,
      input: items,
      max_output_tokens: maxOutput,
      store: false,
      stream: true,
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              type: "function",
              ...t,
              strict: false,
            })),
          }
        : {}),
    };
  }
  if (provider === "anthropic") {
    const items: any[] = [];
    for (const m of messages) {
      const role = m.role === "tool" ? "user" : m.role;
      const content: any[] =
        m.role === "tool"
          ? [{ type: "tool_result", tool_use_id: m.callId, content: m.content }]
          : [
              ...(m.content ? [{ type: "text", text: m.content }] : []),
              ...(m.calls ?? []).map((c) => ({
                type: "tool_use",
                id: c.id,
                name: c.name,
                input: JSON.parse(c.arguments),
              })),
            ];
      if (items.at(-1)?.role === role) items.at(-1).content.push(...content);
      else items.push({ role, content });
    }
    return {
      model,
      system,
      messages: items,
      max_tokens: maxOutput,
      stream: true,
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
    };
  }
  return {
    model,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content || null,
        ...(m.callId ? { tool_call_id: m.callId } : {}),
        ...(provider === "gemini" && m.extraContent
          ? { extra_content: m.extraContent }
          : {}),
        ...(m.calls?.length
          ? {
              tool_calls: m.calls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: c.arguments },
                ...(provider === "gemini" && c.extraContent
                  ? { extra_content: c.extraContent }
                  : {}),
              })),
            }
          : {}),
      })),
    ],
    max_tokens: maxOutput,
    ...(provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
    ...(provider === "qwen" ? { enable_thinking: false } : {}),
    stream: true,
    stream_options: { include_usage: true },
    ...(tools?.length
      ? { tools: tools.map((t) => ({ type: "function", function: t })) }
      : {}),
  };
}
export async function* sseJson(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (data === "[DONE]") {
          yield { __done: true };
          continue;
        }
        if (data) {
          try {
            yield JSON.parse(data);
          } catch {
            throw new AppError(
              502,
              "The provider returned malformed streaming data.",
            );
          }
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
export function normalizeUsage(provider: Provider, raw: Record<string, any>) {
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  const cachedInputTokens = count(
    provider === "openai"
      ? raw.input_tokens_details?.cached_tokens
      : provider === "anthropic"
        ? raw.cache_read_input_tokens
        : (raw.prompt_cache_hit_tokens ??
          raw.prompt_tokens_details?.cached_tokens),
  );
  const cacheCreationInputTokens =
    provider === "anthropic" ? count(raw.cache_creation_input_tokens) : 0;
  const inputTokens =
    count(
      provider === "openai" || provider === "anthropic"
        ? raw.input_tokens
        : raw.prompt_tokens,
    ) +
    (provider === "anthropic"
      ? cachedInputTokens + cacheCreationInputTokens
      : 0);
  const outputTokens = count(
    provider === "openai" || provider === "anthropic"
      ? raw.output_tokens
      : raw.completion_tokens,
  );
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
  };
}
export async function streamProvider(
  input: ProviderInput,
  key: string,
): Promise<StreamResult> {
  const endpoint =
    input.provider === "openai"
      ? "/responses"
      : input.provider === "anthropic"
        ? "/messages"
        : "/chat/completions";
  const response = await (input.fetcher ?? fetch)(
    (input.provider === "qwen" && input.baseUrl
      ? qwenBaseUrl(input.baseUrl)
      : providerBaseUrl(input.provider)) + endpoint,
    {
      method: "POST",
      headers: headers(input.provider, key),
      body: JSON.stringify(requestBody(input)),
      signal: input.signal,
      redirect: "error",
    },
  );
  if (!response.ok || !response.body) {
    const messages: Record<number, string> = {
      401: "API key rejected. Check Settings.",
      403: "This key cannot access the selected model.",
      429: "Provider rate limit or credit limit reached. Try again later.",
      400: "The provider rejected this model or request. Check the model identifier in Settings.",
    };
    throw new AppError(
      502,
      messages[response.status] ??
        `Provider request failed (HTTP ${response.status}).`,
    );
  }
  let text = "",
    usage: Record<string, unknown> = {},
    completed = false;
  const calls = new Map<number, ToolCall>();
  let extraContent: Record<string, unknown> | undefined;
  for await (const e of sseJson(response.body)) {
    if (input.signal.aborted) throw new DOMException("Stopped", "AbortError");
    if (e.error || e.type === "error" || e.type === "response.failed")
      throw new AppError(
        502,
        "The provider stopped the request with an error. Your saved text is intact.",
      );
    let delta = "",
      limitReached = false;
    if (input.provider === "openai") {
      if (e.type === "response.output_text.delta") delta = e.delta ?? "";
      if (
        e.type === "response.output_item.added" &&
        e.item?.type === "function_call"
      )
        calls.set(e.output_index, {
          id: e.item.call_id,
          name: e.item.name,
          arguments: "",
        });
      if (e.type === "response.function_call_arguments.delta") {
        const c = calls.get(e.output_index);
        if (c) c.arguments += e.delta ?? "";
      }
      if (
        e.type === "response.output_item.done" &&
        e.item?.type === "function_call"
      )
        calls.set(e.output_index, {
          id: e.item.call_id,
          name: e.item.name,
          arguments: e.item.arguments,
        });
      if (e.type === "response.completed") {
        completed = true;
        usage = e.response?.usage ?? {};
      }
      if (e.type === "response.incomplete")
        throw new AppError(
          502,
          "The response reached its output limit. Partial text has been kept.",
        );
    } else if (input.provider === "anthropic") {
      if (e.type === "message_start") usage = { ...usage, ...e.message?.usage };
      if (
        e.type === "content_block_start" &&
        e.content_block?.type === "tool_use"
      )
        calls.set(e.index, {
          id: e.content_block.id,
          name: e.content_block.name,
          arguments: "",
        });
      if (e.type === "content_block_delta") {
        if (e.delta?.type === "text_delta") delta = e.delta.text ?? "";
        if (e.delta?.type === "input_json_delta") {
          const c = calls.get(e.index);
          if (c) c.arguments += e.delta.partial_json ?? "";
        }
      }
      if (e.type === "message_delta") {
        usage = { ...usage, ...e.usage };
        if (e.delta?.stop_reason === "max_tokens")
          throw new AppError(
            502,
            "The response reached its output limit. Partial text has been kept.",
          );
      }
      if (e.type === "message_stop") completed = true;
    } else {
      const choice = e.choices?.[0];
      if (input.provider === "gemini" && choice?.delta?.extra_content)
        extraContent = choice.delta.extra_content;
      delta = choice?.delta?.content ?? "";
      for (const t of choice?.delta?.tool_calls ?? []) {
        const c = calls.get(t.index) ?? { id: "", name: "", arguments: "" };
        if (t.id) c.id = t.id;
        if (t.function?.name) c.name += t.function.name;
        if (t.function?.arguments) c.arguments += t.function.arguments;
        if (input.provider === "gemini" && t.extra_content)
          c.extraContent = t.extra_content;
        calls.set(t.index, c);
      }
      if (e.usage) usage = e.usage;
      if (choice?.finish_reason === "length") limitReached = true;
      if (
        choice?.finish_reason === "stop" ||
        choice?.finish_reason === "tool_calls"
      )
        completed = true;
    }
    if (delta) {
      text += delta;
      input.onText(delta);
    }
    if (limitReached)
      throw new AppError(
        502,
        "The response reached its output limit. Partial text has been kept.",
      );
  }
  if (!completed)
    throw new AppError(
      502,
      "The provider connection ended unexpectedly. Partial text has been kept.",
    );
  return {
    text,
    calls: [...calls.values()],
    usage: normalizeUsage(input.provider, usage),
    ...(extraContent ? { extraContent } : {}),
  };
}
