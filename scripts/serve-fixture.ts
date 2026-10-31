/** Isolated browser-test server. Synthetic responses only; never calls a provider. */
import path from "node:path";
import fs from "node:fs";
import { createApp } from "../server/app";
const root = path.resolve("data/browser-fixture");
const { app, ai, keys, store } = await createApp(root, { seed: true });
for (const p of store.list())
  store.update(p.id, { name: "Browser verification · synthetic responses" });
keys.set("openai", "non-secret-fixture");
await keys.verify("openai", (async () =>
  Response.json({
    data: [{ id: "gpt-6-luna" }, { id: "gpt-6.1-sol" }],
  })) as typeof fetch);
let calls = 0;
ai.providerRunner = async (input) => {
  calls++;
  fs.writeFileSync(
    path.join(root, "request-count.json"),
    JSON.stringify({ calls }),
  );
  const request = input.messages[0].content;
  if (input.tools) {
    const match = request.match(/<document>\n([\s\S]*?)\n<\/document>/);
    const original = match?.[1] ?? "";
    input.onText(
      "A small, reviewable change to the title. This response is a synthetic browser-test fixture.",
    );
    return {
      text: "A small, reviewable change to the title.",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      calls: [
        {
          id: "fixture-proposal",
          name: "propose_edits",
          arguments: JSON.stringify({
            summary: "Change the title in this synthetic project",
            files: [
              {
                path: "main.tex",
                content: original.replace("Small Ideas", "Clear Ideas"),
              },
            ],
          }),
        },
      ],
    };
  }
  const text =
    "% Café e\u0301 — 👩🏽‍🔬\n% A carefully paced thought, one character at a time.\n% Each run is one reversible edit.\n";
  for (let i = 0; i < text.length; i += 3) {
    if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
    input.onText(text.slice(i, i + 3));
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (request.includes("[error]") && i > 30)
      throw new Error("Synthetic network failure");
  }
  return {
    text,
    calls: [],
    usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
  };
};
await app.listen({ host: "127.0.0.1", port: 4317 });
console.log("Synthetic browser fixture: local requests only.");
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.once(sig, () => {
    void app.close().then(() => process.exit(0));
  });
