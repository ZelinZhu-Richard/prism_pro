import test from "node:test";
import assert from "node:assert/strict";
import {
  streamProvider,
  requestBody,
  Keys,
  type ProviderInput,
} from "../server/providers";
import { providers, type Provider } from "../shared/types";
import {
  environmentKey,
  providerBaseUrl,
  qwenBaseUrl,
} from "../server/provider-config";
const fragments = (events: unknown[]) => {
  const bytes = new TextEncoder().encode(
    events
      .map(
        (e) =>
          "data: " +
          (typeof e === "string" ? e : JSON.stringify(e)) +
          "\r\n\r\n",
      )
      .join(""),
  );
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3)
        controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  });
};
test("Gemini and Qwen model verification uses the configured official endpoint without generation", async () => {
  for (const provider of ["gemini", "qwen"] as const) {
    const keys = new Keys();
    const endpoint =
      "https://example-workspace.us-east-1.maas.aliyuncs.com/compatible-mode/v1";
    keys.set(
      provider,
      "session-secret",
      provider === "qwen" ? endpoint : undefined,
    );
    let requests = 0;
    const state = await keys.verify(provider, (async (url, init) => {
      requests++;
      assert.equal(
        String(url),
        (provider === "qwen" ? endpoint : providerBaseUrl(provider)) +
          "/models",
      );
      assert.equal(init?.method, undefined);
      assert.equal(
        (init?.headers as any).Authorization,
        "Bearer session-secret",
      );
      return Response.json({ data: [{ id: "fixture-model" }] });
    }) as typeof fetch);
    assert.equal(requests, 1);
    assert.deepEqual(state.models, ["fixture-model"]);
    assert.equal(state.source, "session");
    assert.ok(!JSON.stringify(state).includes("session-secret"));
    if (provider === "qwen") {
      keys.set(
        provider,
        undefined,
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
      );
      assert.equal(keys.key(provider), "session-secret");
      assert.equal(keys.state(provider).verifiedAt, undefined);
    }
  }
});
test("Qwen endpoints reject credential forwarding to untrusted hosts", () => {
  for (const url of [
    "http://dashscope.aliyuncs.com/compatible-mode/v1",
    "https://dashscope.aliyuncs.com.evil.test/compatible-mode/v1",
    "https://evil.test/compatible-mode/v1",
    "https://user:secret@dashscope.aliyuncs.com/compatible-mode/v1",
    "https://dashscope.aliyuncs.com:8080/compatible-mode/v1",
    "https://dashscope.aliyuncs.com/compatible-mode/v1?redirect=evil",
    "https://dashscope.aliyuncs.com/api/v1",
  ])
    assert.throws(() => qwenBaseUrl(url), /official Alibaba/);
  assert.equal(
    qwenBaseUrl("https://dashscope.aliyuncs.com/compatible-mode/v1/"),
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  );
  assert.equal(environmentKey("gemini", { GOOGLE_API_KEY: "alias" }), "alias");
  assert.equal(
    environmentKey("qwen", {
      DASHSCOPE_API_KEY: "alias",
      QWEN_API_KEY: "primary",
    }),
    "primary",
  );
});
const streams: Record<Provider, unknown[]> = {
  gemini: [],
  qwen: [],
  openai: [
    { type: "response.output_text.delta", delta: "café 👩‍🔬" },
    {
      type: "response.output_item.added",
      output_index: 1,
      item: { type: "function_call", call_id: "call1", name: "read_file" },
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 1,
      delta: '{"path":',
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 1,
      delta: '"main.tex"}',
    },
    {
      type: "response.completed",
      response: { usage: { input_tokens: 10, output_tokens: 12 } },
    },
  ],
  anthropic: [
    { type: "message_start", message: { usage: { input_tokens: 10 } } },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "café 👩‍🔬" },
    },
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "call1", name: "read_file" },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"path":' },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '"main.tex"}' },
    },
    {
      type: "message_delta",
      usage: { output_tokens: 12 },
      delta: { stop_reason: "tool_use" },
    },
    { type: "message_stop" },
  ],
  deepseek: [
    {
      choices: [
        {
          delta: {
            content: "café 👩‍🔬",
            tool_calls: [
              {
                index: 0,
                id: "call1",
                function: { name: "read_file", arguments: '{"path":' },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"main.tex"}' } }],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 12 },
    },
    "[DONE]",
  ],
};
streams.qwen = structuredClone(streams.deepseek);
streams.gemini = structuredClone(streams.deepseek);
const signature = { google: { thought_signature: "opaque-fixture-signature" } };
(streams.gemini[0] as any).choices[0].delta.tool_calls[0].extra_content =
  signature;
(streams.gemini[1] as any).choices[0].delta.extra_content = signature;
for (const provider of providers) {
  test(
    provider + " normalizes fragmented UTF-8, tools, usage and request mapping",
    async () => {
      let text = "",
        calls = 0;
      const input: ProviderInput = {
        provider,
        model: "fixture",
        system: "rules",
        messages: [{ role: "user", content: "question" }],
        tools: [
          {
            name: "read_file",
            description: "Read",
            parameters: { type: "object" },
          },
        ],
        maxOutput: 4096,
        signal: new AbortController().signal,
        onText: (delta) => (text += delta),
        fetcher: (async (url, init) => {
          calls++;
          assert.ok(String(url).startsWith("https://"));
          assert.ok(String(url).startsWith(providerBaseUrl(provider)));
          assert.ok(init?.headers);
          const body = JSON.parse(String(init?.body));
          assert.equal(body.stream, true);
          assert.equal(init?.redirect, "error");
          if (provider === "gemini" || provider === "qwen")
            assert.equal(body.thinking, undefined);
          if (provider === "qwen") assert.equal(body.enable_thinking, false);
          return new Response(fragments(streams[provider]), { status: 200 });
        }) as typeof fetch,
      };
      const result = await streamProvider(input, "fixture-key");
      assert.equal(calls, 1);
      assert.equal(text, "café 👩‍🔬");
      assert.equal(result.text, text);
      assert.deepEqual(result.calls, [
        {
          id: "call1",
          name: "read_file",
          arguments: '{"path":"main.tex"}',
          ...(provider === "gemini" ? { extraContent: signature } : {}),
        },
      ]);
      assert.equal(result.usage.inputTokens, 10);
      assert.equal(result.usage.outputTokens, 12);
      assert.equal(result.usage.totalTokens, 22);
      const follow = requestBody({
        ...input,
        messages: [
          ...input.messages,
          {
            role: "assistant",
            content: result.text,
            calls: result.calls,
            extraContent: result.extraContent,
          },
          { role: "tool", callId: "call1", content: "source" },
        ],
      });
      assert.ok(
        JSON.stringify(follow).includes(
          provider === "openai"
            ? "function_call_output"
            : provider === "anthropic"
              ? "tool_result"
              : "tool_call_id",
        ),
      );
      assert.ok(!JSON.stringify(follow).includes("fixture-key"));
      if (provider === "gemini") {
        assert.deepEqual(
          (follow as any).messages[2].tool_calls[0].extra_content,
          signature,
        );
        assert.deepEqual((follow as any).messages[2].extra_content, signature);
      }
    },
  );
  test(
    provider + " rejects incomplete streams and preserves already emitted text",
    async () => {
      let visible = "";
      const first = streams[provider].find(
        (e: any) =>
          e.type === "response.output_text.delta" ||
          e.type === "content_block_delta" ||
          e.choices,
      );
      await assert.rejects(
        streamProvider(
          {
            provider,
            model: "x",
            system: "",
            messages: [],
            maxOutput: 4096,
            signal: new AbortController().signal,
            onText: (t) => (visible += t),
            fetcher: (async () =>
              new Response(fragments([first]))) as typeof fetch,
          },
          "test",
        ),
        /unexpectedly/,
      );
      assert.equal(visible, "café 👩‍🔬");
    },
  );
  test(
    provider +
      " sanitizes provider HTTP errors without exposing keys or response bodies",
    async () => {
      await assert.rejects(
        streamProvider(
          {
            provider,
            model: "x",
            system: "",
            messages: [],
            maxOutput: 1,
            signal: new AbortController().signal,
            onText: () => {},
            fetcher: (async () =>
              new Response("private-provider-body", {
                status: 401,
              })) as typeof fetch,
          },
          "secret",
        ),
        /API key rejected/,
      );
    },
  );
}
test("stream cancellation aborts without another request", async () => {
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(
    streamProvider(
      {
        provider: "openai",
        model: "x",
        system: "",
        messages: [],
        maxOutput: 1,
        signal: controller.signal,
        onText: () => controller.abort(),
        fetcher: (async () => {
          count++;
          return new Response(fragments(streams.openai));
        }) as typeof fetch,
      },
      "test",
    ),
    /Stopped/,
  );
  assert.equal(count, 1);
});
test("model access verification is explicit and no key appears in state", async () => {
  const keys = new Keys();
  keys.set("openai", "session-secret");
  assert.equal(keys.state("openai").verifiedAt, undefined);
  await keys.verify("openai", (async () =>
    Response.json({ data: [{ id: "gpt-6-luna" }] })) as typeof fetch);
  assert.deepEqual(keys.state("openai").models, ["gpt-6-luna"]);
  assert.ok(keys.state("openai").verifiedAt);
  assert.ok(!JSON.stringify(keys.all()).includes("session-secret"));
  keys.set("openai", "new-key");
  assert.deepEqual(keys.state("openai").models, []);
});

test("DeepSeek output-limit event keeps its last text delta", async () => {
  let text = "";
  await assert.rejects(
    streamProvider(
      {
        provider: "deepseek",
        model: "fixture",
        system: "",
        messages: [],
        maxOutput: 1,
        signal: new AbortController().signal,
        onText: (t) => (text += t),
        fetcher: (async () =>
          new Response(
            fragments([
              {
                choices: [
                  {
                    delta: { content: "last visible" },
                    finish_reason: "length",
                  },
                ],
              },
            ]),
          )) as typeof fetch,
      },
      "fixture-key",
    ),
    /output limit/,
  );
  assert.equal(text, "last visible");
});
