import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { AI } from "../server/ai";
import { Keys } from "../server/providers";
import { PreviewBuilds } from "../server/preview-builds";
import { createApp } from "../server/app";
import {
  PreviewCompileController,
  previewTextHash,
  previewCompileBusy,
} from "../src/preview-compile";
import type { CompileJob, AiRun } from "../shared/types";
import type { PreviewBuildState } from "../shared/preview-builds";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function setup(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-preview-build-")),
    store = new Store(root),
    compiler = new Compiler(store),
    p = store.create("Synthetic preview", [
      { path: "main.tex", data: Buffer.from("Before ORIGINAL after.") },
      { path: "notes.tex", data: Buffer.from("Independent source.") },
    ]);
  const run: AiRun & Record<string, any> = {
    id: randomUUID(),
    projectId: p.id,
    conversationId: store.createConversation(p.id, "Same chat").id,
    provider: "openai",
    model: "fixture",
    mode: "manual",
    scope: "project",
    path: "main.tex",
    from: 7,
    to: 15,
    status: "preview",
    created: new Date().toISOString(),
    prompt: "Revise",
    text: "Explanation",
    insertion: "Replacement",
    before: "Before ORIGINAL after.",
    baseRevision: 0,
    lastRevision: 0,
    contextFiles: ["main.tex", "notes.tex"],
  };
  store.saveRun(run);
  store.projectLocks.set(p.id, run.id);
  store.locks.set(p.id + "/main.tex", run.id);
  const ai = new AI(store, compiler, new Keys()),
    journal = ai.previewBuilds;
  let starts = 0;
  t.mock.method(compiler, "start", (id: string, clean: boolean, draft: any) => {
    starts++;
    assert.equal(clean, false);
    assert.equal(
      draft.content,
      "Before " + draft.content.slice(7, -7) + " after.",
    );
    const job: CompileJob = {
      id: randomUUID(),
      projectId: id,
      preview: true,
      previewRequest: draft.request,
      generation: p.generation,
      root: "main.tex",
      engine: "pdflatex",
      status: "running",
      pdf: false,
      started: new Date().toISOString(),
      diagnostics: [],
      log: "",
    };
    compiler.jobs.set(job.id, job);
    fs.mkdirSync(compiler.dir(job.id), { recursive: true });
    compiler.persist(job);
    return job;
  });
  t.after(() => {
    for (const timer of ai.leases.values()) clearTimeout(timer);
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, store, compiler, p, run, ai, journal, starts: () => starts };
}
test("preview retries reuse one exact snapshot and never alter source/history/chat; mismatched text rejects", (t) => {
  const f = setup(t),
    request = randomUUID(),
    before = JSON.stringify({
      p: f.store.project(f.p.id),
      files: f.store.exportFiles(f.p.id),
      history: f.store.checkpoints(f.p.id),
      runs: f.store.runs(f.p.id),
      chats: f.store.conversations(f.p.id),
    });
  const first = f.ai.compileDraft(f.run.id, "Unicode 研究 👩🏽‍🔬", request),
    replay = f.ai.compileDraft(f.run.id, "Unicode 研究 👩🏽‍🔬", request);
  assert.equal(first.id, replay.id);
  assert.equal(f.starts(), 1);
  assert.equal(first.previewRequest?.textHash, hash("Unicode 研究 👩🏽‍🔬"));
  assert.throws(
    () => f.ai.compileDraft(f.run.id, "Different", request),
    /different replacement/,
  );
  assert.equal(f.compiler.list(f.p.id).length, 0);
  assert.equal(
    JSON.stringify({
      p: f.store.project(f.p.id),
      files: f.store.exportFiles(f.p.id),
      history: f.store.checkpoints(f.p.id),
      runs: f.store.runs(f.p.id),
      chats: f.store.conversations(f.p.id),
    }),
    before,
  );
});
test("cancel before delayed start persists a tombstone, repeated Stop is safe, and a fresh request remains possible", (t) => {
  const f = setup(t),
    request = randomUUID();
  const stopped = f.journal.cancel(f.run.id, request);
  assert.equal(stopped.cancelled, true);
  assert.equal(stopped.job, null);
  assert.deepEqual(f.journal.cancel(f.run.id, request), stopped);
  assert.throws(
    () => f.ai.compileDraft(f.run.id, "Replacement", request),
    /stopped before/,
  );
  assert.equal(f.starts(), 0);
  assert.ok(f.ai.compileDraft(f.run.id, "Replacement", randomUUID()).id);
  assert.equal(f.starts(), 1);
});
test("Stop cancels only the owned preview and approval waits for actual process drain", (t) => {
  const f = setup(t),
    request = randomUUID(),
    job = f.ai.compileDraft(f.run.id, "Replacement", request);
  f.compiler.processes.set(job.id, {} as any); // A controlled process remains live until the test closes it.
  f.journal.cancel(f.run.id, request);
  assert.equal(job.status, "running");
  assert.equal(job.cancelRequested, true);
  assert.throws(
    () => f.ai.approve(f.run.id, "Replacement"),
    /compiler|preview build/,
  );
  f.compiler.processes.delete(job.id);
  job.status = "cancelled";
  f.compiler.persist(job);
  assert.deepEqual(f.ai.approve(f.run.id, "Replacement"), {
    text: "Replacement",
  });
  assert.equal(f.store.readText(f.p.id, "main.tex").content, f.run.before);
});
test("discard/finish cancels owned previews without stopping unrelated builds or rewriting source", (t) => {
  const f = setup(t),
    request = randomUUID(),
    job = f.ai.compileDraft(f.run.id, "Replacement", request);
  f.compiler.jobs.set("unrelated", {
    ...job,
    id: "unrelated",
    projectId: "other",
    previewRequest: undefined,
  });
  f.ai.stop(f.run.id);
  f.ai.finish(f.run.id);
  assert.equal(job.status, "cancelled");
  assert.equal(f.compiler.jobs.get("unrelated")?.status, "running");
  assert.equal(f.journal.status(f.run.id, request).cancelled, true);
  assert.equal(f.store.readText(f.p.id, "main.tex").content, f.run.before);
  assert.equal(f.store.checkpoints(f.p.id).length, 1);
});
test("request journal survives restart, recovers a lost journal update from job ownership, and never restarts compilation", (t) => {
  const f = setup(t),
    request = randomUUID(),
    job = f.ai.compileDraft(f.run.id, "Replacement", request);
  job.status = "succeeded";
  job.pdf = true;
  f.compiler.persist(job);
  f.store.db
    .prepare("UPDATE preview_build_requests SET job=NULL WHERE run=?")
    .run(f.run.id);
  f.store.close();
  const reopened = new Store(f.root);
  f.store.db = reopened.db;
  const compiler = new Compiler(f.store),
    journal = new PreviewBuilds(f.store, compiler);
  const status = journal.status(f.run.id, request);
  assert.equal(status.job?.id, job.id);
  assert.equal(status.job?.status, "succeeded");
  assert.equal(journal.status(f.run.id).requestId, request);
  assert.equal(f.starts(), 1);
  assert.equal(
    (
      f.store.db
        .prepare("SELECT job FROM preview_build_requests WHERE run=?")
        .get(f.run.id) as any
    ).job,
    job.id,
  );
  compiler.jobs.delete(job.id);
  assert.equal(journal.status(f.run.id, request).unavailable, true);
});
test("preview identities, source revisions, stopped runs and project ownership are validated", (t) => {
  const f = setup(t);
  for (const invalid of ["", "../escape", [], 2, "x".repeat(81)])
    assert.throws(() => f.journal.cancel(f.run.id, invalid), /Invalid/);
  assert.throws(
    () => f.ai.compileDraft(f.run.id, "\ud800", randomUUID()),
    /valid text/,
  );
  f.store.save(f.p.id, "main.tex", "External", 0, f.run.id);
  assert.throws(
    () => f.ai.compileDraft(f.run.id, "Replacement", randomUUID()),
    /source changed/,
  );
  f.ai.stop(f.run.id);
  assert.throws(
    () => f.ai.compileDraft(f.run.id, "Replacement", randomUUID()),
    /no longer active/,
  );
  assert.equal(f.starts(), 0);
});
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function controller(
  t: any,
  overrides: Partial<
    ConstructorParameters<typeof PreviewCompileController>[0]
  > = {},
) {
  let starts = 0,
    cancels = 0,
    current: PreviewBuildState = { runId: "run", cancelled: false, job: null };
  const ctl = new PreviewCompileController(
    {
      read: async () => structuredClone(current),
      start: async (runId, text, requestId) => {
        starts++;
        const job: CompileJob = {
          id: "build",
          projectId: "project",
          preview: true,
          status: "running",
          generation: 0,
          root: "main.tex",
          engine: "pdflatex",
          started: "today",
          pdf: false,
          diagnostics: [],
          log: "",
        };
        current = {
          runId,
          requestId,
          textHash: hash(text),
          cancelled: false,
          job,
        };
        return structuredClone(job);
      },
      cancel: async (runId, requestId) => {
        cancels++;
        current = {
          ...current,
          runId,
          requestId,
          cancelled: true,
          job: current.job ? { ...current.job, cancelRequested: true } : null,
        };
        return structuredClone(current);
      },
      requestId: () => "exact-preview-request",
      hash: previewTextHash,
      notify: () => {},
      ...overrides,
    },
    100000,
  );
  t.after(() => ctl.dispose());
  return {
    ctl,
    starts: () => starts,
    cancels: () => cancels,
    set: (value: PreviewBuildState) => {
      current = value;
    },
    get: () => current,
  };
}
test("local preview controller recovers a lost successful start without a second compilation", async (t) => {
  const f = controller(t);
  let lose = true;
  const start = (f.ctl as any).ports.start;
  (f.ctl as any).ports.start = async (...args: any[]) => {
    const job = await start(...args);
    if (lose) {
      lose = false;
      throw new Error("Lost successful start");
    }
    return job;
  };
  await f.ctl.begin("run", "研究 👩🏽‍🔬");
  assert.equal(f.ctl.view.phase, "uncertain");
  assert.equal(previewCompileBusy(f.ctl.view), true);
  await f.ctl.retry();
  assert.equal(f.starts(), 1);
  assert.equal(f.ctl.view.phase, "running");
  assert.equal(f.ctl.view.requestId, "exact-preview-request");
});
test("Stop before a start response wins over late success, with exact request cancellation", async (t) => {
  const pending = deferred<CompileJob>(),
    f = controller(t, { start: async () => pending.promise });
  const start = f.ctl.begin("run", "Replacement");
  await new Promise((r) => setTimeout(r, 0));
  await f.ctl.stop();
  assert.equal(f.cancels(), 1);
  assert.equal(f.ctl.view.phase, "finished");
  assert.equal(f.ctl.view.cancelled, true);
  pending.resolve({ id: "late", status: "running" } as CompileJob);
  await start;
  assert.equal(f.ctl.view.job, undefined);
  assert.equal(f.ctl.view.phase, "finished");
  assert.equal(f.ctl.view.cancelled, true);
});
test("old hash, old poll and old errors cannot overwrite a new replacement run", async (t) => {
  const slow = deferred<string>(),
    read = deferred<PreviewBuildState>();
  let hashes = 0;
  const f = controller(t, {
    hash: async (text) => (++hashes === 1 ? slow.promise : hash(text)),
  });
  const old = f.ctl.begin("old", "Old");
  f.ctl.clear();
  await f.ctl.begin("new", "New");
  slow.resolve(hash("Old"));
  await old;
  assert.equal(f.ctl.view.runId, "new");
  assert.equal(f.ctl.view.stale, false);
  const g = controller(t, { read: async () => read.promise });
  const open = g.ctl.open("old", "Old");
  g.ctl.clear();
  await g.ctl.begin("new", "New");
  read.reject(new Error("late read error"));
  await open;
  assert.equal(g.ctl.view.runId, "new");
  assert.equal(g.ctl.view.error, undefined);
});
test("poll failures keep the target locked, retry cancellation safely, and allow the terminal cancelled result", async (t) => {
  const f = controller(t);
  await f.ctl.begin("run", "Replacement");
  await f.ctl.stop();
  assert.equal(f.ctl.view.phase, "stopping");
  const read = (f.ctl as any).ports.read;
  let fail = true;
  (f.ctl as any).ports.read = async (...args: any[]) => {
    if (fail) {
      fail = false;
      throw new Error("Temporary status failure");
    }
    return read(...args);
  };
  await (f.ctl as any).read();
  assert.equal(f.ctl.view.phase, "uncertain");
  assert.equal(previewCompileBusy(f.ctl.view), true);
  const state = f.get();
  f.set({ ...state, job: { ...state.job!, status: "cancelled" } });
  await f.ctl.retry();
  assert.equal(f.ctl.view.phase, "finished");
  assert.equal(f.ctl.view.job?.status, "cancelled");
  assert.equal(f.cancels(), 2);
});
test("opening saved preview status never compiles and labels output from a different replacement", async (t) => {
  const f = controller(t);
  await f.ctl.begin("run", "Old draft");
  const state = f.get();
  f.set({ ...state, job: { ...state.job!, status: "succeeded", pdf: true } });
  await f.ctl.open("run", "Current draft");
  assert.equal(f.starts(), 1);
  assert.equal(f.ctl.view.phase, "finished");
  assert.equal(f.ctl.view.stale, true);
});
test("Stop while hashing never submits a delayed start, even after the hash resolves", async (t) => {
  const pending = deferred<string>(),
    f = controller(t, { hash: async () => pending.promise });
  const start = f.ctl.begin("run", "Exact draft");
  await f.ctl.stop();
  pending.resolve(hash("Exact draft"));
  await start;
  assert.equal(f.starts(), 0);
  assert.equal(f.cancels(), 1);
  assert.equal(f.ctl.view.phase, "finished");
});
test("a stale successful poll cannot overwrite a new preview request", async (t) => {
  const pending = deferred<PreviewBuildState>(),
    f = controller(t);
  await f.ctl.begin("old", "Old");
  (f.ctl as any).ports.read = async () => pending.promise;
  const poll = (f.ctl as any).read();
  f.ctl.clear();
  await f.ctl.begin("new", "New");
  pending.resolve({
    runId: "old",
    requestId: "old-request",
    cancelled: false,
    job: { id: "old-build", status: "succeeded" } as CompileJob,
  });
  await poll;
  assert.equal(f.ctl.view.runId, "new");
  assert.equal(f.ctl.view.job?.id, "build");
});
test("an explicit retry after a rejected start keeps its request ID and exact draft", async (t) => {
  const f = controller(t);
  let fail = true;
  const start = (f.ctl as any).ports.start,
    requests: any[] = [];
  (f.ctl as any).ports.start = async (...args: any[]) => {
    requests.push(args);
    if (fail) {
      fail = false;
      throw new Error("Start unavailable");
    }
    return start(...args);
  };
  await f.ctl.begin("run", "Exact draft");
  await f.ctl.retry();
  assert.equal(f.starts(), 1);
  assert.deepEqual(requests[0], requests[1]);
});
test("preview routes enforce origin checks and validate request IDs without generating AI", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-preview-api-")),
    env = await createApp(root, { seed: false });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = env.store.create("API fixture", []),
    id = randomUUID();
  env.store.saveRun({
    id,
    projectId: p.id,
    mode: "manual",
    status: "stopped",
  } as any);
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    url = `/api/ai/runs/${id}/compile-preview`;
  assert.equal((await env.app.inject({ url, headers })).statusCode, 200);
  assert.equal(
    (
      await env.app.inject({
        url,
        headers: { ...headers, origin: "https://untrusted.invalid" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await env.app.inject({
        url: url + "/cancel",
        method: "POST",
        headers,
        payload: { requestId: randomUUID() },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await env.app.inject({
        url: url + "/cancel",
        method: "POST",
        headers,
        payload: { requestId: "bad" },
      })
    ).statusCode,
    400,
  );
});
