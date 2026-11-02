import test from "node:test";
import assert from "node:assert/strict";
import { DiskCheck, diskSelection } from "../src/disk-discovery";
import { ApiError, api } from "../src/api";
import type {
  DiskDiscoveryView,
  DiskImportResult,
} from "../shared/disk-discovery";
const scan: DiskDiscoveryView = {
  projectId: "project",
  generation: 3,
  folder: "/synthetic/managed/files",
  token: "a".repeat(64),
  added: [{ path: "new.tex", kind: "text", size: 3 }],
  changed: [],
  skipped: [],
  scanned: 2,
  bytes: 3,
};
const result: DiskImportResult = {
  project: { id: "project", generation: 4 } as any,
  imported: ["new.tex"],
  replayed: false,
};
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: any) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup(t: any) {
  const seen: any[] = [],
    requests: any[] = [],
    applied: any[] = [];
  let ids = 0;
  const d = {
    scan: async (_signal: AbortSignal) => scan,
    import: async (req: any, _signal: AbortSignal) => {
      requests.push(req);
      return result;
    },
    applied: async (value: DiskImportResult) => {
      applied.push(value);
    },
    id: () => `00000000-0000-0000-0000-${String(++ids).padStart(12, "0")}`,
    notify: (v: any) => seen.push(v),
    deadlineMs: 1000,
  };
  const controller = new DiskCheck(d);
  t.after(() => controller.dispose());
  return { controller, d, seen, requests, applied };
}
test("disk checks do not import until an explicit selected action and pass captured token in one request", async (t) => {
  const f = setup(t);
  await f.controller.check();
  assert.equal(f.controller.view.phase, "ready");
  assert.equal(f.requests.length, 0);
  await f.controller.import(["new.tex"]);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].token, scan.token);
  assert.deepEqual(f.requests[0].paths, ["new.tex"]);
  assert.equal(f.controller.view.phase, "done");
  assert.equal(f.applied.length, 1);
});
test("uncertain network result blocks new checks and retries the exact request ID/selection/token", async (t) => {
  const f = setup(t);
  let count = 0;
  f.d.import = async (req, signal) => {
    f.requests.push(req);
    if (!count++) throw Error("Lost response");
    return { ...result, replayed: true };
  };
  await f.controller.check();
  await f.controller.import(["new.tex"]);
  const request = f.controller.view.request;
  assert.equal(f.controller.view.phase, "uncertain");
  await f.controller.check();
  assert.equal(f.controller.view.phase, "uncertain");
  await f.controller.import(["different.tex"]);
  assert.equal(f.controller.view.phase, "done");
  assert.equal(f.requests[0], request);
  assert.equal(f.requests[1], request);
  assert.equal(f.applied.length, 1);
});
test("a definite stale response preserves review evidence and requires a refreshed scan before a new import", async (t) => {
  const f = setup(t);
  f.d.import = async () => {
    throw new ApiError("Disk changed", 409);
  };
  await f.controller.check();
  await f.controller.import(["new.tex"]);
  assert.equal(f.controller.view.phase, "failed");
  assert.equal(f.controller.view.scan, scan);
  assert.equal(f.controller.view.request, undefined);
  await f.controller.import(["new.tex"]);
  assert.equal(f.controller.view.phase, "failed");
  await f.controller.check();
  assert.equal(f.controller.view.phase, "ready");
});
test("late out-of-order checks and disposal cannot publish results or apply metadata", async (t) => {
  const f = setup(t),
    old = deferred<DiskDiscoveryView>();
  let count = 0;
  f.d.scan = async () =>
    count++ === 0 ? old.promise : { ...scan, generation: 5 };
  const pending = f.controller.check();
  await f.controller.check();
  old.resolve(scan);
  await pending;
  assert.equal(f.controller.view.scan?.generation, 5);
  const response = deferred<DiskImportResult>();
  f.d.import = async () => response.promise;
  const importing = f.controller.import(["new.tex"]);
  f.controller.dispose();
  response.resolve(result);
  await importing;
  assert.equal(f.applied.length, 0);
});
test("import deadline retains the exact request and ignores a late acknowledgment without applying metadata", async (t) => {
  const f = setup(t);
  f.d.deadlineMs = 15;
  const response = deferred<DiskImportResult>();
  f.d.import = async () => response.promise;
  await f.controller.check();
  const pending = f.controller.import(["new.tex"]),
    request = f.controller.view.request;
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(f.controller.view.phase, "uncertain");
  assert.equal(f.controller.view.request, request);
  response.resolve(result);
  await pending;
  assert.equal(f.applied.length, 0);
  f.d.import = async (req) => {
    f.requests.push(req);
    return { ...result, replayed: true };
  };
  await f.controller.import(["ignored.tex"]);
  assert.equal(f.requests[0], request);
  assert.equal(f.controller.view.phase, "done");
});
test("metadata refresh failure after a confirmed import remains replayable even when refresh returns a 409", async (t) => {
  const f = setup(t);
  let count = 0;
  f.d.applied = async () => {
    if (!count++) throw new ApiError("Metadata changed", 409);
  };
  await f.controller.check();
  await f.controller.import(["new.tex"]);
  assert.equal(f.controller.view.phase, "uncertain");
  const request = f.controller.view.request;
  await f.controller.import(["other.tex"]);
  assert.equal(f.requests[1], request);
  assert.equal(f.controller.view.phase, "done");
});
test("aborting local API transport forwards its signal without changing the incumbent request header/body", async (t) => {
  const original = globalThis.fetch;
  let actual: any;
  globalThis.fetch = (async (url, init) => {
    actual = { url, init };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const abort = new AbortController();
  await api(
    "/synthetic",
    "POST",
    { value: "source" },
    { signal: abort.signal },
  );
  assert.equal(actual.url, "/api/synthetic");
  assert.equal(actual.init.signal, abort.signal);
  assert.equal(actual.init.headers["X-Prism-Request"], "1");
  assert.equal(actual.init.body, JSON.stringify({ value: "source" }));
});

test("refreshing a disk review keeps only prior selected paths and never silently selects newly arrived files", () => {
  const entries = [
    { path: "kept.tex", kind: "text" as const, size: 1 },
    { path: "new.tex", kind: "text" as const, size: 2 },
  ];
  assert.deepEqual(
    [...diskSelection(new Set(["kept.tex", "gone.tex"]), entries)],
    ["kept.tex"],
  );
  assert.deepEqual([...diskSelection(new Set(), entries)], []);
  assert.deepEqual(
    [...diskSelection(undefined, entries)],
    ["kept.tex", "new.tex"],
  );
  const many = Array.from({ length: 1001 }, (_, i) => ({
    path: String(i) + ".tex",
    kind: "text" as const,
    size: 1,
  }));
  assert.equal(diskSelection(undefined, many).size, 1000);
});
