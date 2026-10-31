import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CliBackends,
  CliStream,
  cliArgs,
  cliEnvironment,
  reviewResult,
  runCommand,
  type CliInput,
  type CommandRunner,
} from "../server/cli";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { AI } from "../server/ai";
import { Keys } from "../server/providers";
import { createApp } from "../server/app";
import type { AiEvent, AiRequest, CliProvider } from "../shared/types";

function directory(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const fixtureEnv = {
  HOME: os.homedir(),
  PRISM_CODEX_BIN: process.execPath,
  PRISM_CLAUDE_BIN: process.execPath,
};
const input = (provider: CliProvider): CliInput => ({
  provider,
  model: "default",
  system: "Synthetic test",
  messages: [{ role: "user", content: "Private fixture context" }],
  maxOutput: 4096,
  signal: new AbortController().signal,
  onText: () => {},
});
function events(provider: CliProvider, text: string) {
  return provider === "codex"
    ? [
        {
          type: "item.completed",
          item: { id: "answer", type: "agent_message", text },
        },
        {
          type: "turn.completed",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      ]
    : [
        {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text },
          },
        },
        { type: "assistant", message: { content: [{ type: "text", text }] } },
        {
          type: "result",
          subtype: "success",
          result: text,
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      ];
}
function fake(generation: CommandRunner): CommandRunner {
  return async (command) => {
    if (command.args.includes("--version"))
      return { code: 0, stdout: "0.165.0 / 2.1.314", stderr: "" };
    if (command.args.includes("--help"))
      return {
        code: 0,
        stdout:
          "--ignore-user-config --ignore-rules --ephemeral --safe-mode --restricted --no-session-persistence --include-partial-messages",
        stderr: "",
      };
    if (command.args.includes("status"))
      return {
        code: 0,
        stdout: command.args.includes("auth")
          ? JSON.stringify({
              loggedIn: true,
              authMethod: "oauth_token",
              apiProvider: "firstParty",
              email: "private-fixture@example.invalid",
            })
          : "Logged in using ChatGPT",
        stderr: "",
      };
    return generation(command);
  };
}
function emit(command: Parameters<CommandRunner>[0], values: unknown[]) {
  const text = values.map((e) => JSON.stringify(e)).join("\n");
  for (let n = 0; n < text.length; n += 3)
    command.onOutput?.(text.slice(n, n + 3));
  return { code: 0, stdout: text, stderr: "" };
}

test("CLI authentication checks are read-only, sanitize identity, and never generate", async (t) => {
  const root = directory(t);
  const cli = new CliBackends(
    root,
    fake(async () => {
      throw new Error("Generation must not occur");
    }),
    fixtureEnv,
  );
  for (const provider of ["codex", "claude-code"] as const) {
    const state = await cli.check(provider);
    assert.equal(state.configured, true);
    assert.equal(state.source, "cli");
    assert.ok(!JSON.stringify(state).includes("private-fixture"));
  }
  assert.deepEqual(fs.readdirSync(path.join(root, "cli-runs")), []);
  const missing = new CliBackends(
    root,
    fake(async () => {
      throw new Error();
    }),
    { PRISM_CODEX_BIN: path.join(root, "missing") },
  );
  assert.equal((await missing.check("codex")).installed, false);
});

test("CLI subprocesses isolate context and exclude keys and unsafe configuration", () => {
  const env = cliEnvironment({
    HOME: "/fixture",
    USER: "fixture-user",
    LOGNAME: "fixture-user",
    PATH: "/bin",
    OPENAI_API_KEY: "secret",
    ANTHROPIC_API_KEY: "secret",
    CODEX_API_KEY: "secret",
    CLAUDE_CODE_OAUTH_TOKEN: "secret",
    ANTHROPIC_AUTH_TOKEN: "secret",
    SSH_AUTH_SOCK: "/private/agent-secret.sock",
    ANTHROPIC_BASE_URL: "https://evil.invalid",
    NODE_OPTIONS: "--require=evil",
    CLAUDECODE: "nested",
  });
  assert.ok(!JSON.stringify(env).includes("secret"));
  assert.equal(env.USER, "fixture-user");
  assert.equal(env.LOGNAME, "fixture-user");
  assert.equal(env.SSH_AUTH_SOCK, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.ANTHROPIC_BASE_URL, undefined);
  const codex = cliArgs(input("codex"), "/isolated");
  assert.ok(codex.includes('forced_login_method="chatgpt"'));
  assert.ok(
    codex.includes(
      'permissions.prism.filesystem={":minimal"="read",":workspace_roots"="read"}',
    ),
  );
  assert.ok(codex.includes("features.shell_tool=false"));
  assert.ok(codex.includes("--ignore-user-config"));
  assert.ok(!codex.includes("danger-full-access"));
  const claude = cliArgs(input("claude-code"), "/isolated");
  assert.deepEqual(claude.slice(-2), ["--tools", ""]);
  assert.ok(claude.includes("--safe-mode") && claude.includes("--restricted"));
  assert.ok(
    claude.some((arg) =>
      arg.includes('"blockReadsOutsideWorkingDirectories":true'),
    ),
  );
  assert.ok(!claude.includes("--bare"));
  assert.ok(
    ![...codex, ...claude].some((arg) =>
      arg.includes("Private fixture context"),
    ),
  );
});

test("Claude login and generation retain the OS identity used by the saved login", async (t) => {
  const root = directory(t);
  let calls = 0;
  const runner = fake(async (command) => {
    calls++;
    return emit(command, events("claude-code", "OK"));
  });
  const cli = new CliBackends(
    root,
    async (command) => {
      // Model the observed CLI failure: saved credentials alone are insufficient
      // when the non-interactive process has lost its OS user identity.
      assert.equal(command.env.USER, "fixture-user");
      assert.equal(command.env.LOGNAME, "fixture-user");
      assert.equal(command.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
      assert.equal(command.env.SSH_AUTH_SOCK, undefined);
      return runner(command);
    },
    {
      ...fixtureEnv,
      USER: "fixture-user",
      LOGNAME: "fixture-user",
      CLAUDE_CODE_OAUTH_TOKEN: "do-not-forward",
      SSH_AUTH_SOCK: "/private/agent.sock",
    },
  );
  assert.equal((await cli.check("claude-code")).configured, true);
  assert.equal((await cli.stream(input("claude-code"))).text, "OK");
  assert.equal(calls, 1);
});

for (const provider of ["codex", "claude-code"] as const) {
  test(`${provider} fragmented JSONL preserves Unicode, suppresses duplicate final text, and normalizes usage`, async (t) => {
    let visible = "",
      calls = 0;
    const root = directory(t);
    const cli = new CliBackends(
      root,
      fake(async (command) => {
        calls++;
        assert.ok(path.isAbsolute(command.cwd));
        assert.match(command.stdin!, /Private fixture context/);
        assert.equal(command.args.includes("Private fixture context"), false);
        return emit(command, events(provider, "é 👩🏽‍🔬 \\alpha"));
      }),
      fixtureEnv,
    );
    const result = await cli.stream({
      ...input(provider),
      onText: (t) => (visible += t),
    });
    assert.equal(visible, "é 👩🏽‍🔬 \\alpha");
    assert.equal(result.text, visible);
    assert.equal(result.usage.totalTokens, 15);
    assert.equal(calls, 1);
    assert.deepEqual(fs.readdirSync(path.join(root, "cli-runs")), []);
  });
  test(`${provider} partial failure keeps emitted text and sanitizes raw CLI errors`, () => {
    let visible = "";
    const stream = new CliStream(provider, (t) => (visible += t));
    stream.feed(JSON.stringify(events(provider, "partial")[0]) + "\n");
    assert.throws(
      () =>
        stream.feed(
          JSON.stringify({
            type: "error",
            message: "private-key-and-context",
          }) + "\n",
        ),
      (e) => e instanceof Error && !e.message.includes("private-key"),
    );
    assert.equal(visible, "partial");
    assert.equal(stream.complete, false);
  });
  test(`${provider} Manual Type needs no API key, makes one generation and supports exact Undo`, async (t) => {
    const root = directory(t),
      store = new Store(root),
      compiler = new Compiler(store);
    t.after(() => store.close());
    const project = store.create("CLI fixture", [
      { path: "main.tex", data: Buffer.from("before ORIGINAL after") },
    ]);
    let generations = 0;
    const cli = new CliBackends(
      root,
      fake(async (command) => {
        generations++;
        return emit(command, events(provider, "new α"));
      }),
      fixtureEnv,
    );
    const ai = new AI(
      store,
      compiler,
      new Keys(),
      async () => {
        throw new Error("API adapter used");
      },
      cli,
    );
    const request: AiRequest = {
      projectId: project.id,
      provider,
      model: "default",
      mode: "manual",
      prompt: "Revise",
      path: "main.tex",
      revision: 0,
      from: 7,
      to: 15,
    };
    assert.equal(ai.quote(request).cost, null);
    const id = await ai.run(request, () => {});
    assert.equal(generations, 1);
    assert.equal(store.run(id).status, "typing");
    ai.progress(id, "new α", 0);
    ai.finish(id);
    assert.equal(
      store.readText(project.id, "main.tex").content,
      "before new α after",
    );
    ai.undo(id);
    assert.equal(
      store.readText(project.id, "main.tex").content,
      "before ORIGINAL after",
    );
    assert.equal(store.locks.size, 0);
  });
  test(`${provider} Review Edits uses Prism tools and retains revision-bound Apply/Undo`, async (t) => {
    const root = directory(t),
      store = new Store(root),
      compiler = new Compiler(store);
    t.after(() => store.close());
    const project = store.create("CLI fixture", [
      { path: "main.tex", data: Buffer.from("Original") },
      { path: "second.tex", data: Buffer.from("Second") },
    ]);
    let generations = 0;
    const cli = new CliBackends(
      root,
      fake(async (command) => {
        generations++;
        const response =
          generations === 1
            ? {
                text: "",
                calls: [
                  { name: "read_file", arguments: '{"path":"second.tex"}' },
                ],
              }
            : {
                text: "Two revisions for review.",
                calls: [
                  {
                    name: "propose_edits",
                    arguments: JSON.stringify({
                      summary: "Revise",
                      files: [
                        { path: "main.tex", content: "New" },
                        { path: "second.tex", content: "New second" },
                      ],
                    }),
                  },
                ],
              };
        if (generations === 2) assert.match(command.stdin!, /Second/);
        return emit(command, events(provider, JSON.stringify(response)));
      }),
      fixtureEnv,
    );
    const ai = new AI(
      store,
      compiler,
      new Keys(),
      async () => {
        throw new Error("API adapter used");
      },
      cli,
    );
    const collected: AiEvent[] = [];
    await ai.run(
      {
        projectId: project.id,
        provider,
        model: "default",
        mode: "review",
        prompt: "Revise both",
        path: "main.tex",
        revision: 0,
        from: 0,
        to: 0,
      },
      (e) => collected.push(e),
    );
    const proposal = store.proposals(project.id)[0];
    assert.equal(generations, 2);
    assert.equal(proposal.files.length, 2);
    assert.equal(store.readText(project.id, "main.tex").content, "Original");
    store.applyProposal(proposal.id);
    assert.equal(
      store.readText(project.id, "second.tex").content,
      "New second",
    );
    store.applyProposal(proposal.id, true);
    assert.equal(store.readText(project.id, "main.tex").content, "Original");
    assert.ok(
      !collected.some((e) => e.type === "text" && e.text.includes('"calls"')),
    );
  });
}

test("expired Claude login invalidates status without exposing the raw error", async (t) => {
  const cli = new CliBackends(
    directory(t),
    fake(async (command) =>
      emit(command, [
        {
          type: "result",
          subtype: "success",
          is_error: true,
          result: "Login expired private-fixture-secret",
        },
      ]),
    ),
    fixtureEnv,
  );
  await cli.check("claude-code");
  await assert.rejects(cli.stream(input("claude-code")), /claude auth login/);
  assert.equal(cli.state("claude-code").configured, false);
  assert.ok(!JSON.stringify(cli.all()).includes("private-fixture-secret"));
});

test("malformed and unrecognized CLI tool requests never execute", () => {
  for (const result of [
    "not JSON",
    '{"text":"x","calls":[{"name":"Bash","arguments":"{}"}]}',
    '{"text":"x","calls":[{"name":"read_file","arguments":"invalid"}]}',
  ])
    assert.throws(
      () =>
        reviewResult(result, {
          ...input("codex"),
          tools: [{ name: "read_file", description: "read", parameters: {} }],
        }),
      /invalid edit proposal/,
    );
});

test("real subprocess cancellation and timeout terminate promptly; partial output is retained", async (t) => {
  const cwd = directory(t),
    controller = new AbortController();
  let visible = "";
  const running = runCommand({
    file: process.execPath,
    args: ["-e", 'process.stdout.write("partial");setInterval(()=>{},1000)'],
    cwd,
    env: cliEnvironment(),
    timeoutMs: 3000,
    signal: controller.signal,
    onOutput: (chunk) => {
      visible += chunk;
      controller.abort();
    },
  });
  await assert.rejects(running, /Stopped/);
  assert.equal(visible, "partial");
  await assert.rejects(
    runCommand({
      file: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      cwd,
      env: cliEnvironment(),
      timeoutMs: 40,
    }),
    /timed out/,
  );
});

test("Stop cancels a CLI login check before any paid generation", async (t) => {
  const root = directory(t),
    store = new Store(root),
    compiler = new Compiler(store);
  t.after(() => store.close());
  const project = store.create("fixture", [
    { path: "main.tex", data: Buffer.from("Original") },
  ]);
  let entered!: () => void;
  const started = new Promise<void>((resolve) => (entered = resolve));
  const cli = new CliBackends(
    root,
    async (command) => {
      assert.ok(command.args.includes("--version"));
      entered();
      return await new Promise((_, reject) =>
        command.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Stopped", "AbortError")),
          { once: true },
        ),
      );
    },
    fixtureEnv,
  );
  const ai = new AI(store, compiler, new Keys(), undefined, cli);
  let id = "";
  const run = ai.run(
    {
      projectId: project.id,
      provider: "codex",
      model: "default",
      mode: "manual",
      prompt: "Write",
      path: "main.tex",
      revision: 0,
      from: 0,
      to: 0,
    },
    (e) => {
      if (e.type === "run") id = e.run.id;
    },
  );
  await started;
  ai.stop(id);
  await run;
  ai.finish(id);
  assert.equal(store.run(id).status, "stopped");
  assert.equal(store.locks.size, 0);
});

test("HTTP CLI settings expose no key field and reject attempts to save one", async (t) => {
  const { app } = await createApp(directory(t), { seed: false });
  t.after(() => app.close());
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  for (const provider of ["codex", "claude-code"]) {
    const response = await app.inject({
      method: "PUT",
      url: `/api/providers/${provider}/key`,
      headers,
      payload: { key: "fixture-secret" },
    });
    assert.equal(response.statusCode, 400);
    const settings = await app.inject({ url: "/api/settings", headers });
    assert.equal(settings.json().providers[provider].source, "cli");
    assert.ok(!settings.body.includes("fixture-secret"));
  }
});
test("CLI exit without a completion event fails even when the exit code is zero", async (t) => {
  const cli = new CliBackends(
    directory(t),
    async (command) => emit(command, [events("codex", "partial")[0]]),
    fixtureEnv,
  );
  let visible = "";
  await assert.rejects(
    cli.stream({ ...input("codex"), onText: (text) => (visible += text) }),
    /before completing/,
  );
  assert.equal(visible, "partial");
});
test(
  "cancellation kills subprocess descendants that ignore SIGTERM",
  { skip: process.platform === "win32" },
  async (t) => {
    const controller = new AbortController();
    let pid = 0;
    const program =
      'const {spawn}=require("node:child_process");const c=spawn(process.execPath,["-e",\'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)\'],{stdio:"ignore"});setTimeout(()=>process.stdout.write(String(c.pid)),100);setInterval(()=>{},1000)';
    await assert.rejects(
      runCommand({
        file: process.execPath,
        args: ["-e", program],
        cwd: directory(t),
        env: cliEnvironment(),
        signal: controller.signal,
        timeoutMs: 3000,
        onOutput: (chunk) => {
          pid = Number(chunk);
          controller.abort();
        },
      }),
      /Stopped/,
    );
    assert.ok(pid > 0);
    t.after(() => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    });
    await new Promise((resolve) => setTimeout(resolve, 650));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  },
);
