import test from "node:test";
import assert from "node:assert/strict";
import { DiskMonitor } from "../src/disk-status";
import type { DiskStatus } from "../shared/disk-status";
const status: DiskStatus = {
  projectId: "project",
  generation: 2,
  checkedAt: 1000,
  changes: [{ path: "main.tex", change: "modified" }],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(t: any) {
  let now = 1000;
  const seen: any[] = [],
    signals: AbortSignal[] = [];
  const d = {
    read: async (signal: AbortSignal) => {
      signals.push(signal);
      return status;
    },
    notify: (v: any) => seen.push(v),
    now: () => now,
    deadlineMs: 1000,
  };
  const monitor = new DiskMonitor("project", 2, d);
  t.after(() => monitor.dispose());
  return {
    monitor,
    d,
    seen,
    signals,
    next() {
      now += 31000;
    },
  };
}
test("live monitor performs only reads, coalesces in-flight checks and keeps the previous changes through network errors/backoff", async (t) => {
  const f = fixture(t);
  await f.monitor.check();
  const pending = deferred<DiskStatus>();
  let count = 0;
  f.d.read = async () => {
    count++;
    return pending.promise;
  };
  const run = f.monitor.check();
  await f.monitor.check(true);
  assert.equal(count, 1);
  pending.resolve(status);
  await run;
  f.d.read = async () => {
    count++;
    throw Error("Backend unavailable");
  };
  await f.monitor.check();
  assert.equal(f.monitor.view.status, status);
  assert.equal(f.monitor.view.error, "Backend unavailable");
  const old = count;
  await f.monitor.check();
  assert.equal(count, old);
  f.next();
  await f.monitor.check();
  assert.equal(count, old + 1);
  f.d.read = async () => ({ ...status, changes: [] });
  await f.monitor.check(true);
  assert.deepEqual(f.monitor.view.status?.changes, []);
  assert.equal(f.monitor.view.error, undefined);
});
test("paused or disposed monitors abort transport and ignore late results from hidden tabs or old projects", async (t) => {
  const f = fixture(t),
    pending = deferred<DiskStatus>();
  let signal!: AbortSignal;
  f.d.read = async (s) => {
    signal = s;
    return pending.promise;
  };
  const run = f.monitor.check();
  f.monitor.pause();
  assert(signal.aborted);
  const paused = f.seen.length;
  pending.resolve(status);
  await run;
  assert.equal(f.seen.length, paused);
  assert.equal(f.monitor.view.status, undefined);
  const later = deferred<DiskStatus>();
  f.d.read = async () => later.promise;
  const second = f.monitor.check();
  f.monitor.dispose();
  const disposed = f.seen.length;
  later.resolve(status);
  await second;
  assert.equal(f.seen.length, disposed);
});
test("new source generations cancel stale observations, reject older/wrong-project responses and retain last known conflicts", async (t) => {
  const f = fixture(t);
  await f.monitor.check();
  const pending = deferred<DiskStatus>();
  f.d.read = async () => pending.promise;
  const run = f.monitor.check();
  f.monitor.updateGeneration(3);
  pending.resolve({ ...status, changes: [] });
  await run;
  assert.equal(f.monitor.view.status, status);
  f.d.read = async () => status;
  await f.monitor.check(true);
  assert.match(f.monitor.view.error!, /older project/);
  assert.equal(f.monitor.view.status, status);
  f.d.read = async () => ({ ...status, projectId: "other", generation: 4 });
  await f.monitor.check(true);
  assert.equal(f.monitor.view.status, status);
  f.d.read = async () => ({ ...status, generation: 3, changes: [] });
  await f.monitor.check(true);
  assert.equal(f.monitor.view.status?.generation, 3);
  assert.equal(f.monitor.view.error, undefined);
});
test("deadline releases a hung request, preserves last observation and ignores its eventual response", async (t) => {
  const f = fixture(t);
  await f.monitor.check();
  f.d.deadlineMs = 10;
  const pending = deferred<DiskStatus>();
  let signal!: AbortSignal;
  f.d.read = async (s) => {
    signal = s;
    return pending.promise;
  };
  const run = f.monitor.check();
  await new Promise((r) => setTimeout(r, 30));
  assert(signal.aborted);
  assert.match(f.monitor.view.error!, /timed out/);
  assert.equal(f.monitor.view.status, status);
  f.d.read = async () => ({ ...status, changes: [] });
  await f.monitor.check(true);
  pending.resolve(status);
  await run;
  assert.deepEqual(f.monitor.view.status?.changes, []);
});
test("only a confirmed resolution removes its selected path; other observed conflicts remain", async (t) => {
  const f = fixture(t);
  f.d.read = async () => ({
    ...status,
    changes: [...status.changes, { path: "refs.bib", change: "deleted" }],
  });
  await f.monitor.check();
  f.monitor.resolved("main.tex");
  assert.deepEqual(f.monitor.view.status?.changes, [
    { path: "refs.bib", change: "deleted" },
  ]);
});
test("restart or another session cannot clear review for an older open revision; a newer local save acknowledgment is not a conflict", async () => {
  const { noticedDiskChanges } = await import("../src/disk-status");
  const project: any = {
    id: "project",
    files: [{ path: "main.tex", revision: 4, deleted: false }],
  };
  const doc: any = {
    path: "main.tex",
    revision: 3,
    content: "Local candidate",
  };
  assert.deepEqual(
    noticedDiskChanges({ ...status, generation: 8, changes: [] }, project, doc),
    [{ path: "main.tex", change: "modified" }],
  );
  assert.deepEqual(
    noticedDiskChanges(undefined, project, { ...doc, revision: 5 }),
    [],
  );
  assert.deepEqual(
    noticedDiskChanges({ ...status, projectId: "other" }, project, {
      ...doc,
      revision: 4,
    }),
    [],
  );
  assert.deepEqual(noticedDiskChanges(status, project, doc), status.changes);
  assert.deepEqual(
    noticedDiskChanges(
      undefined,
      { ...project, files: [{ path: "main.tex", revision: 4, deleted: true }] },
      doc,
    ),
    [{ path: "main.tex", change: "deleted" }],
  );
});
