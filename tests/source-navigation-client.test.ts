import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  SourceNavigationQuery,
  openSourceLocation,
  locationItems,
  locationId,
  type NavigationCapture,
  type SourceNavigationView,
  type NavigationContext,
} from "../src/source-navigation";
import type {
  SourceLocation,
  SourceNavigationResult,
} from "../shared/source-navigation";
import type { TextFile } from "../shared/types";
const hash = async (text: string) =>
  createHash("sha256").update(text).digest("hex");
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const main: TextFile = {
    path: "main.tex",
    revision: 2,
    content: "Use \\Value{Exact arguments}.\n",
  },
  target: TextFile = {
    path: "styles/local.sty",
    revision: 4,
    content: "% 新 👩🏽‍💻 é\n\\newcommand{\\Value}[1]{#1}\n",
  },
  capture: NavigationCapture = {
    projectId: "A",
    generation: 7,
    request: {
      kind: "command",
      name: "Value",
      mode: "definitions",
      current: { ...main },
    },
  };
function location(file = target): SourceLocation {
  const from = file.content.indexOf("\\Value");
  return {
    path: file.path,
    revision: file.revision,
    kind: "command",
    name: "Value",
    role: "definition",
    from,
    to: from + 6,
    line: file.content.slice(0, from).split("\n").length,
    preview: "\\newcommand{\\Value}[1]{#1}",
    hash: digest(file.content),
  };
}
function result(c = capture): SourceNavigationResult {
  return {
    projectId: c.projectId,
    generation: c.generation,
    kind: c.request.kind,
    name: c.request.name,
    mode: c.request.mode,
    total: 1,
    locations: [location()],
    warnings: [],
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function ports(file = main) {
  let context: NavigationContext = { projectId: "A", file: { ...file } },
    current = true;
  const selected: unknown[] = [],
    opened: string[] = [],
    reads: string[] = [];
  const p = {
    context: () => context,
    current: () => current,
    hash,
    read: async (path: string, _signal: AbortSignal) => {
      reads.push(path);
      return { ...target };
    },
    open: async (
      path: string,
      allowed: (candidate?: TextFile | null) => boolean,
    ) => {
      opened.push(path);
      if (!allowed() || !allowed(target)) return;
      context = { projectId: "A", file: { ...target } };
      return context.file;
    },
    select: (l: SourceLocation, f: TextFile) =>
      selected.push({
        from: l.from,
        to: l.to,
        content: f.content,
        path: f.path,
      }),
  };
  return {
    p,
    selected,
    opened,
    reads,
    get context() {
      return context;
    },
    set context(value: NavigationContext) {
      context = value;
    },
    close() {
      current = false;
    },
  };
}
test("same-file navigation verifies the visible unsaved buffer without reading, saving or opening a file", async () => {
  const visible = { ...main, content: "Unsaved 👩🏽‍💻 é \\Value{Exact}.\n" },
    f = ports(visible),
    l = { ...location(visible), unsaved: true };
  assert.equal(await openSourceLocation(capture, l, f.p), true);
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.opened, []);
  assert.equal(f.context.file.content, visible.content);
  assert.deepEqual(f.selected, [
    { from: l.from, to: l.to, path: visible.path, content: visible.content },
  ]);
});
test("cross-file navigation checks a complete hash, then validates the fresh open against the same bytes", async () => {
  const f = ports(),
    l = location();
  assert.equal(await openSourceLocation(capture, l, f.p), true);
  assert.deepEqual(f.reads, [target.path]);
  assert.deepEqual(f.opened, [target.path]);
  assert.equal(f.selected.length, 1);
  assert.equal(f.context.file.content.slice(l.from, l.to), "\\Value");
});
test("a changed target cannot open or select the unrelated old offset", async () => {
  const f = ports();
  f.p.read = async () => ({
    ...target,
    revision: 5,
    content: "Added line\n" + target.content,
  });
  await assert.rejects(
    () => openSourceLocation(capture, location(), f.p),
    /source location changed/,
  );
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.selected, []);
  assert.equal(f.context.file.path, main.path);
});
test("a second target change between validation and open is refused by the candidate guard", async () => {
  const f = ports();
  f.p.open = async (path, allowed) => {
    f.opened.push(path);
    const changed = {
      ...target,
      revision: 5,
      content: target.content + "Later edit\n",
    };
    assert.equal(allowed(changed), false);
    return undefined;
  };
  await assert.rejects(
    () => openSourceLocation(capture, location(), f.p),
    /source location changed/,
  );
  assert.deepEqual(f.selected, []);
  assert.equal(f.context.file.path, main.path);
});
test("new visible typing during a pending source read cancels navigation without a save/open", async () => {
  const f = ports(),
    pending = deferred<TextFile>();
  f.p.read = () => pending.promise;
  const work = openSourceLocation(capture, location(), f.p);
  f.context = {
    ...f.context,
    file: { ...f.context.file, content: "New unsaved writing" },
  };
  pending.resolve({ ...target });
  assert.equal(await work, false);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.selected, []);
  assert.equal(f.context.file.content, "New unsaved writing");
});
test("captured content is immutable even if an external holder mutates the context object during hashing", async () => {
  const f = ports(),
    pending = deferred<string>();
  f.p.hash = () => pending.promise;
  const work = openSourceLocation(capture, location(main), f.p);
  f.context.file.content += "Later writing";
  pending.resolve(digest(main.content));
  assert.equal(await work, false);
  assert.deepEqual(f.selected, []);
});
test("closing pending reads or file opening aborts promptly and prevents late selection", async () => {
  for (const stage of ["read", "open"]) {
    const f = ports(),
      abort = new AbortController(),
      pending = deferred<TextFile | undefined>(),
      started = deferred<boolean>();
    if (stage === "read")
      f.p.read = () => {
        started.resolve(true);
        return pending.promise as Promise<TextFile>;
      };
    else
      f.p.open = async (_path, allowed) => {
        started.resolve(true);
        const file = await pending.promise;
        return allowed(file) ? file : undefined;
      };
    const work = openSourceLocation(capture, location(), {
      ...f.p,
      signal: abort.signal,
    });
    await started.promise;
    f.close();
    abort.abort(Error("Canceled lookup"));
    await assert.rejects(() => work, /Canceled lookup/);
    pending.resolve({ ...target });
    await Promise.resolve();
    assert.deepEqual(f.selected, []);
    assert.equal(f.context.file.path, main.path);
  }
});
test("lookup deadline cancels a nonresponding read and leaves the active source intact", async () => {
  const f = ports();
  let signal: AbortSignal | undefined;
  f.p.read = (_path, s) => {
    signal = s;
    return new Promise(() => {});
  };
  await assert.rejects(
    () => openSourceLocation(capture, location(), { ...f.p, deadlineMs: 10 }),
    /timed out/,
  );
  assert.equal(signal?.aborted, true);
  assert.deepEqual(f.selected, []);
  assert.deepEqual(f.opened, []);
});
test("failed source saves, read errors and failed hash calculation propagate without a selection", async () => {
  for (const stage of ["read", "open", "hash"] as const) {
    const f = ports();
    f.p[stage] = async () => {
      throw Error("Recoverable " + stage + " failure");
    };
    await assert.rejects(
      () => openSourceLocation(capture, location(), f.p),
      new RegExp("Recoverable " + stage),
    );
    assert.deepEqual(f.selected, []);
    assert.equal(f.context.file.path, main.path);
  }
});
test("invalid ranges, wrong spelling and foreign active project never become source selections", async () => {
  for (const patch of [
    { from: -1 },
    { to: 99999 },
    { from: 0, to: 6 },
    { name: "Other" },
  ]) {
    const f = ports();
    await assert.rejects(
      () => openSourceLocation(capture, { ...location(), ...patch }, f.p),
      /source location changed/,
    );
    assert.deepEqual(f.selected, []);
  }
  const f = ports();
  f.context = { ...f.context, projectId: "B" };
  assert.equal(await openSourceLocation(capture, location(), f.p), false);
  assert.deepEqual(f.reads, []);
});
test("identical content across a save acknowledgement remains navigable while Unicode normalization differences do not", async () => {
  const f = ports();
  f.p.open = async (_path, allowed) => {
    const same = { ...target, revision: 9 };
    assert(allowed(same));
    f.context = { projectId: "A", file: same };
    return same;
  };
  assert.equal(await openSourceLocation(capture, location(), f.p), true);
  const g = ports();
  g.p.read = async () => ({
    ...target,
    content: target.content.normalize("NFC"),
  });
  await assert.rejects(
    () => openSourceLocation(capture, location(), g.p),
    /source location changed/,
  );
  assert.deepEqual(g.opened, []);
});
test("location rows retain duplicate-path provenance, literal snippets, stable identities and active-buffer labels", () => {
  const r = result();
  r.locations[0].column = 13;
  r.locations.push({ ...location(main), unsaved: true });
  r.total = 2;
  const items = locationItems(r);
  assert.equal(items.length, 2);
  assert.equal(items[0].label, "styles/local.sty:2:13");
  assert.equal(items[0].detail, r.locations[0].preview);
  assert.equal(items[1].shortcut, "Active buffer");
  assert.notEqual(items[0].id, items[1].id);
  assert.equal(items[0].id, locationId(r.locations[0]));
});
test("source lookup publishes loading and a matching ready result", async () => {
  const views: SourceNavigationView[] = [],
    query = new SourceNavigationQuery({
      read: async () => result(),
      notify: (v) => views.push(v),
    });
  await query.load(capture);
  assert.equal(views[0].loading, true);
  assert.equal(query.view.loading, false);
  assert.equal(query.view.result?.total, 1);
  query.dispose();
});
test("a refreshed query aborts its predecessor and ignores out-of-order and disposed replies", async () => {
  const one = deferred<SourceNavigationResult>(),
    two = deferred<SourceNavigationResult>(),
    signals: AbortSignal[] = [],
    views: SourceNavigationView[] = [];
  let calls = 0;
  const query = new SourceNavigationQuery({
    read: (_c, s) => {
      signals.push(s);
      return ++calls === 1 ? one.promise : two.promise;
    },
    notify: (v) => views.push(v),
  });
  const first = query.load(capture),
    second = query.load(capture);
  two.resolve(result());
  await second;
  assert.equal(signals[0].aborted, true);
  const count = views.length;
  one.resolve({ ...result(), locations: [], total: 0 });
  await first;
  assert.equal(views.length, count);
  assert.equal(query.view.result?.total, 1);
  query.dispose();
  await query.load(capture);
  assert.equal(calls, 2);
});
test("foreign, older, mismatched and malformed source responses keep the prior result and require refresh", async () => {
  let reply: any = result();
  const query = new SourceNavigationQuery({
    read: async () => reply,
    notify: () => {},
  });
  await query.load(capture);
  const valid = query.view.result;
  for (const patch of [
    { projectId: "B" },
    { generation: 6 },
    { generation: "7" },
    { name: "Other" },
    { kind: "label" },
    { mode: "references" },
    { locations: null },
    { total: -1 },
    { locations: [{ ...location(), hash: "invalid" }] },
  ]) {
    reply = { ...result(), ...patch };
    await query.load(capture);
    assert(query.view.error);
    assert.equal(query.view.result, valid);
    assert.equal(query.view.loading, false);
  }
  query.dispose();
});
test("timed-out lookup retains the last result and ignores a late response", async () => {
  const late = deferred<SourceNavigationResult>();
  let calls = 0,
    signal: AbortSignal | undefined;
  const query = new SourceNavigationQuery({
    deadlineMs: 10,
    read: (_c, s) => {
      signal = s;
      return ++calls === 1 ? Promise.resolve(result()) : late.promise;
    },
    notify: () => {},
  });
  await query.load(capture);
  const valid = query.view.result,
    work = query.load(capture);
  await new Promise((r) => setTimeout(r, 20));
  assert.match(query.view.error!, /timed out/);
  assert.equal(signal?.aborted, true);
  assert.equal(query.view.result, valid);
  late.resolve({ ...result(), total: 0, locations: [] });
  await work;
  assert.equal(query.view.result, valid);
  query.dispose();
});
test("a failed lookup remains recoverable through an explicit successful refresh", async () => {
  let failed = true;
  const query = new SourceNavigationQuery({
    read: async () => {
      if (failed) throw Error("Backend unavailable");
      return result();
    },
    notify: () => {},
  });
  await query.load(capture);
  assert.match(query.view.error!, /Backend unavailable/);
  failed = false;
  await query.load(capture);
  assert.equal(query.view.error, undefined);
  assert.equal(query.view.result?.total, 1);
  query.dispose();
});
