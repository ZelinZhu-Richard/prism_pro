import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  supervisorPath,
  supervisorIdentity,
  supervisorResult,
  compilerLog,
  processGroup,
  atomicJson,
} from "../server/supervision";
import { Compiler, compilerEnvironment } from "../server/compiler";
import { Store } from "../server/store";
const supported = process.platform !== "win32";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, label: string, ms = 6000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out: " + label);
    await pause(15);
  }
}
function harness(
  t: any,
  mode: string,
  timeoutMs: number | null = 5000,
  start = true,
) {
  const root = path.resolve(
    "data/verification/supervision-test-" + randomUUID(),
  );
  fs.mkdirSync(root, { recursive: true });
  const env = compilerEnvironment(root),
    token = randomUUID();
  // Explicit args deliberately do not inherit this test runner's tsx loader.
  const child = spawn(process.execPath, [supervisorPath, root, token], {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  // An IPC-only handle may not deliver a later stdio-close after an explicit
  // disconnect. Observe process exit with a referenced bounded wait instead.
  const closed = until(
    () => child.exitCode !== null || child.signalCode !== null,
    "supervisor exit",
  );
  assert.ok(child.pid);
  atomicJson(path.join(root, "supervisor.json"), {
    version: 1,
    token,
    pid: child.pid,
  });
  const fixture = path.resolve("tests/fixtures/compiler-process.mjs");
  if (start)
    child.send({
      type: "start",
      token,
      command: process.execPath,
      args: [fixture, mode, root],
      cwd: root,
      env,
      timeoutMs,
    });
  t.after(async () => {
    if (child.connected) child.send({ type: "cancel" }, () => {});
    try {
      await Promise.race([closed, pause(2500)]);
    } finally {
      const members = spawnSync(
        "/bin/ps",
        ["-g", String(child.pid), "-o", "command="],
        { encoding: "utf8" },
      ).stdout;
      // Test cleanup targets only a currently identified, freshly owned tree.
      if (members?.includes(root))
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {}
      await until(
        () => processGroup(child.pid!)?.length === 0,
        "fixture cleanup",
      );
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  return {
    root,
    child,
    closed,
    result: () => supervisorResult(root, supervisorIdentity(root)!),
  };
}
test(
  "supervisor retains exact fragmented Unicode and completes only after process drain",
  { skip: !supported },
  async (t) => {
    const h = harness(t, "unicode");
    await h.closed;
    assert.equal(compilerLog(h.root), "Café · 中文 👩🏽‍💻\n");
    assert.deepEqual(processGroup(h.child.pid!), []);
    assert.equal(h.result()?.reason, "exit");
    assert.equal(h.result()?.code, 0);
    assert.equal(h.result()?.drained, true);
    assert.equal(h.result()?.escalated, false);
  },
);
test(
  "supervisor and compiler inherit no API keys, Node options or tsx flags",
  { skip: !supported },
  async (t) => {
    const previous = process.env.NODE_OPTIONS,
      key = process.env.OPENAI_API_KEY;
    process.env.NODE_OPTIONS = "--require=/does/not/exist";
    process.env.OPENAI_API_KEY = "synthetic-private-key";
    try {
      const h = harness(t, "environment");
      await h.closed;
      const out = JSON.parse(compilerLog(h.root)!);
      assert.equal(out.env.OPENAI_API_KEY, undefined);
      assert.equal(out.env.NODE_OPTIONS, undefined);
      assert.deepEqual(out.args, []);
      assert.equal(h.result()?.reason, "exit");
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previous;
      if (key === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = key;
    }
  },
);
test(
  "Stop drains a descendant ignoring TERM before allowing completion",
  { skip: !supported },
  async (t) => {
    const h = harness(t, "tree");
    await until(
      () => compilerLog(h.root)?.includes("TREE READY") ?? false,
      "tree ready",
    );
    h.child.send({ type: "cancel" });
    await pause(150);
    assert.equal(h.child.exitCode, null); // Launcher exit alone cannot release the group.
    assert.ok((processGroup(h.child.pid!)?.length ?? 0) > 0);
    await h.closed;
    assert.equal(h.result()?.reason, "cancel");
    assert.equal(h.result()?.escalated, true);
    await until(
      () => processGroup(h.child.pid!)?.length === 0,
      "TERM-resistant descendant drain",
    );
  },
);
test(
  "deadline is owned by supervisor and escalates independently of backend timers",
  { skip: !supported },
  async (t) => {
    const h = harness(t, "ignore-term", 250);
    await h.closed;
    assert.equal(h.result()?.reason, "timeout");
    assert.equal(h.result()?.escalated, true);
    await until(
      () => processGroup(h.child.pid!)?.length === 0,
      "deadline drain",
    );
  },
);
test(
  "loss of parent IPC drains TERM-resistant work",
  { skip: !supported },
  async (t) => {
    const h = harness(t, "ignore-term");
    await until(() => compilerLog(h.root)?.includes("READY") ?? false, "ready");
    h.child.disconnect();
    await h.closed;
    assert.equal(h.result()?.reason, "parent-lost");
    assert.equal(h.result()?.escalated, true);
    await until(
      () => processGroup(h.child.pid!)?.length === 0,
      "parent-loss drain",
    );
  },
);
for (const action of ["cancel", "parent-lost"] as const)
  test(
    `unlimited work retains ${action} cleanup without a deadline timer`,
    { skip: !supported },
    async (t) => {
      const h = harness(t, "ignore-term", null);
      await until(
        () => compilerLog(h.root)?.includes("READY") ?? false,
        "unlimited ready",
      );
      await pause(300);
      assert.equal(h.child.exitCode, null);
      assert.equal(h.result(), null);
      if (action === "cancel") h.child.send({ type: "cancel" });
      else h.child.disconnect();
      await h.closed;
      assert.equal(h.result()?.reason, action);
      assert.equal(h.result()?.escalated, true);
      await until(
        () => processGroup(h.child.pid!)?.length === 0,
        "unlimited drain",
      );
    },
  );
test(
  "parent loss before the start handshake launches no compiler",
  { skip: !supported },
  async (t) => {
    const h = harness(t, "ignore-term", 5000, false);
    h.child.disconnect();
    await h.closed;
    assert.equal(h.result()?.reason, "parent-lost");
    assert.equal(h.result()?.drained, true);
    assert.equal(compilerLog(h.root), "");
    assert.equal(
      fs.readdirSync(h.root).some((f) => f.startsWith("ready-")),
      false,
    );
  },
);
test(
  "a successful launcher cannot leave an unbounded background process",
  { skip: !supported },
  async (t) => {
    const h = harness(t, "orphan");
    await h.closed;
    assert.equal(h.result()?.reason, "error");
    assert.equal(h.result()?.code, 0);
    assert.equal(h.result()?.escalated, true);
    await until(() => processGroup(h.child.pid!)?.length === 0, "orphan drain");
  },
);
test(
  "restart waits for a live recorded group and never signals a saved PID",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const h = harness(t, "ignore-term");
    await until(() => compilerLog(h.root)?.includes("READY") ?? false, "ready");
    const root = path.join(h.root, "app"),
      store = new Store(root),
      first = new Compiler(store);
    const p = store.create("Synthetic recovery", [
      { path: "main.tex", data: Buffer.from("\\documentclass{article}") },
    ]);
    const id = randomUUID(),
      dir = path.join(root, "builds", id);
    fs.mkdirSync(path.join(dir, "out"), { recursive: true });
    const job = {
      id,
      projectId: p.id,
      generation: p.generation,
      root: "main.tex",
      engine: "pdflatex",
      status: "running",
      log: "",
      diagnostics: [],
      pdf: false,
      started: new Date().toISOString(),
    };
    atomicJson(path.join(dir, "job.json"), job);
    // A stale/wrong identity pointing at a live unrelated fixture must not be killed.
    const identity = {
      version: 1 as const,
      token: randomUUID(),
      pid: h.child.pid!,
    };
    atomicJson(path.join(dir, "supervisor.json"), identity);
    atomicJson(path.join(dir, "supervisor-result.json"), {
      token: identity.token,
      reason: "exit",
      code: 0,
      signal: null,
      drained: true,
      escalated: false,
    });
    fs.writeFileSync(path.join(dir, "out/main.pdf"), "%PDF-fake fixture");
    const restarted = new Compiler(store);
    assert.equal(restarted.jobs.get(id)?.status, "running");
    assert.equal(restarted.jobs.get(id)?.pdf, false);
    assert.throws(() => restarted.start(p.id), /already running/);
    restarted.cancel(id);
    await pause(150);
    assert.ok(h.child.connected); // cancel did not target the saved PID or foreign IPC.
    assert.equal(h.result(), null);
    assert.equal(restarted.jobs.get(id)?.status, "running");
    h.child.send({ type: "cancel" });
    await h.closed;
    await until(
      () => restarted.jobs.get(id)?.status === "cancelled",
      "recovered terminal status",
    );
    assert.equal(restarted.jobs.get(id)?.pdf, false);
    assert.equal(restarted.processes.size, 0);
    await restarted.shutdown();
    await first.shutdown();
    store.close();
  },
);
test(
  "journal write failure cannot disable cleanup",
  { skip: !supported },
  async (t) => {
    const h = harness(t, "ignore-term");
    await until(() => compilerLog(h.root)?.includes("READY") ?? false, "ready");
    fs.mkdirSync(path.join(h.root, "supervisor-result.json"));
    h.child.send({ type: "cancel" });
    await h.closed;
    assert.equal(h.result(), null);
    await until(
      () => processGroup(h.child.pid!)?.length === 0,
      "cleanup despite journal failure",
    );
  },
);
test("journal validation and deadline limits reject malformed inputs", (t) => {
  const root = path.resolve(
    "data/verification/supervision-journal-" + randomUUID(),
  );
  fs.mkdirSync(root, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const identity = { version: 1 as const, token: randomUUID(), pid: 2 };
  atomicJson(path.join(root, "supervisor.json"), identity);
  atomicJson(path.join(root, "supervisor-result.json"), {
    token: randomUUID(),
    reason: "exit",
    code: 0,
    signal: null,
    drained: true,
    escalated: false,
  });
  assert.equal(supervisorResult(root, identity), null);
  fs.writeFileSync(path.join(root, "supervisor.json"), " ".repeat(5000));
  assert.equal(supervisorIdentity(root), null);
  assert.equal(processGroup(0), null);
  assert.equal(processGroup(1), null);
  assert.equal(processGroup(Number.NaN), null);
  const store = new Store(path.join(root, "app")),
    compiler = new Compiler(store);
  assert.throws(
    () => new Compiler(store, undefined, { timeoutMs: 2_147_483_648 }),
    /deadline/,
  );
  assert.throws(
    () => new Compiler(store, undefined, { timeoutMs: Number.NaN }),
    /deadline/,
  );
  store.close();
});
