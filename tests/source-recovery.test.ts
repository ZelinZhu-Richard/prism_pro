import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store";
import { SourceRecovery } from "../server/source-recovery";
import { SourceDraftStore } from "../server/source-drafts";
import {
  SourceDrafts,
  DraftPersistenceError,
  visibleSource,
  type DraftStorage,
} from "../src/source-drafts";
import { createApp } from "../server/app";

function fixture(t: any) {
  const root = path.resolve(
    "data/verification/source-recovery-unit-" + randomUUID(),
  );
  let store = new Store(root);
  const project = store.create("Source safety", [
    { path: "main.tex", data: Buffer.from("Original α.\n") },
    { path: "other.tex", data: Buffer.from("Other source.") },
  ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    project,
    get store() {
      return store;
    },
    get recovery() {
      return new SourceRecovery(store);
    },
    get drafts() {
      return new SourceDraftStore(store);
    },
    file: (name = "main.tex") =>
      path.join(root, "projects", project.id, "files", name),
    reopen: () => {
      store.close();
      store = new Store(root);
    },
  };
}
function history(store: Store, id: string) {
  return store.checkpoints(id).flatMap((c) =>
    store
      .exportCheckpoint(id, c.id)
      .filter((f) => f.path === "main.tex")
      .map((f) => f.data.toString()),
  );
}
test("read-only disk review binds bytes, source revision and generation without source/history changes", (t) => {
  const f = fixture(t),
    before = f.store.checkpoints(f.project.id),
    generation = f.store.project(f.project.id).generation;
  fs.writeFileSync(f.file(), "External 👩🏽‍💻 e\u0301\n");
  const r = f.recovery.review(f.project.id, "main.tex");
  assert.equal(r.changed, true);
  assert.equal(r.saved.content, "Original α.\n");
  assert.equal(r.disk.content, "External 👩🏽‍💻 e\u0301\n");
  assert.equal(f.recovery.review(f.project.id, "main.tex").token, r.token);
  assert.deepEqual(f.store.checkpoints(f.project.id), before);
  assert.equal(f.store.project(f.project.id).generation, generation);
});
for (const action of ["disk", "editor"] as const)
  test(`live ${action} resolution preserves disk and earlier source in history`, (t) => {
    const f = fixture(t);
    fs.writeFileSync(f.file(), "External source\n");
    const r = f.recovery.review(f.project.id, "main.tex"),
      inode = fs.statSync(f.file()).ino;
    const out = f.recovery.resolve(f.project.id, {
      path: r.path,
      token: r.token,
      action,
      content: "Merged editor source\n",
    });
    assert.equal(
      out.file?.content,
      action === "disk" ? "External source\n" : "Merged editor source\n",
    );
    assert.equal(fs.readFileSync(f.file(), "utf8"), out.file?.content);
    assert.ok(history(f.store, f.project.id).includes("Original α.\n"));
    assert.ok(history(f.store, f.project.id).includes("External source\n"));
    if (action === "disk") assert.equal(fs.statSync(f.file()).ino, inode);
    f.reopen();
    assert.equal(
      f.store.readText(f.project.id, "main.tex").content,
      out.file?.content,
    );
  });
for (const change of ["disk", "revision", "generation"] as const)
  test(`a ${change} change after review rejects resolution without writes`, (t) => {
    const f = fixture(t),
      r = f.recovery.review(f.project.id, "main.tex");
    if (change === "disk") fs.writeFileSync(f.file(), "Later disk source");
    if (change === "revision")
      f.store.save(f.project.id, "main.tex", "Later app source", 0);
    if (change === "generation")
      f.store.save(f.project.id, "other.tex", "Later other", 0);
    const before = fs.readFileSync(f.file()),
      checkpoints = f.store.checkpoints(f.project.id);
    assert.throws(
      () =>
        f.recovery.resolve(f.project.id, {
          path: r.path,
          token: r.token,
          action: "editor",
          content: "Stale overwrite",
        }),
      /changed again/,
    );
    assert.deepEqual(fs.readFileSync(f.file()), before);
    assert.deepEqual(f.store.checkpoints(f.project.id), checkpoints);
  });
test("recovery rejects an active agent and keeps browser/disk candidates independent", (t) => {
  const f = fixture(t),
    r = f.recovery.review(f.project.id, "main.tex");
  f.store.projectLocks.set(f.project.id, "agent");
  assert.throws(
    () =>
      f.recovery.resolve(f.project.id, {
        path: r.path,
        token: r.token,
        action: "editor",
        content: "Draft",
      }),
    /reserved/,
  );
  assert.equal(
    f.recovery.review(f.project.id, "main.tex").disk.content,
    "Original α.\n",
  );
});
for (const action of ["disk", "editor"] as const)
  test(`external deletion can be explicitly kept or restored (${action})`, (t) => {
    const f = fixture(t);
    fs.unlinkSync(f.file());
    const r = f.recovery.review(f.project.id, "main.tex");
    assert.equal(r.disk.kind, "missing");
    const out = f.recovery.resolve(f.project.id, {
      path: r.path,
      token: r.token,
      action,
      content: "Recovered deleted draft",
    });
    if (action === "disk") {
      assert.equal(out.file, null);
      assert.equal(fs.existsSync(f.file()), false);
    } else
      assert.equal(
        fs.readFileSync(f.file(), "utf8"),
        "Recovered deleted draft",
      );
    assert.ok(history(f.store, f.project.id).includes("Original α.\n"));
  });
test("non-text disk content cannot be replaced through editor recovery", (t) => {
  const f = fixture(t),
    bytes = Buffer.from([255, 0, 1]);
  fs.writeFileSync(f.file(), bytes);
  const r = f.recovery.review(f.project.id, "main.tex");
  assert.equal(r.disk.kind, "binary");
  assert.equal(r.disk.size, bytes.length);
  assert.match(r.disk.hash!, /^[a-f0-9]{64}$/);
  assert.notEqual(r.saved.hash, r.disk.hash);
  assert.equal(r.disk.content, undefined);
  assert.throws(
    () =>
      f.recovery.resolve(f.project.id, {
        path: r.path,
        token: r.token,
        action: "editor",
        content: "Lose binary",
      }),
    /no longer editable/,
  );
  assert.deepEqual(fs.readFileSync(f.file()), bytes);
});
test("reviewing and resolving one file does not import another file's external edit", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file(), "External main");
  fs.writeFileSync(f.file("other.tex"), "External other");
  const r = f.recovery.review(f.project.id, "main.tex");
  f.recovery.resolve(f.project.id, {
    path: r.path,
    token: r.token,
    action: "disk",
  });
  assert.equal(
    f.store.readText(f.project.id, "other.tex").content,
    "Other source.",
  );
  assert.equal(fs.readFileSync(f.file("other.tex"), "utf8"), "External other");
  assert.throws(
    () => f.store.save(f.project.id, "other.tex", "Unexpected", 0),
    /changed outside Leaf/,
  );
});
test("read-only reviews reject escaping paths and do not read symlink targets", (t) => {
  const f = fixture(t);
  assert.throws(() => f.recovery.review(f.project.id, "../sentinel"));
  const sentinel = path.join(f.root, "sentinel.txt");
  fs.writeFileSync(sentinel, "Private fixture");
  fs.unlinkSync(f.file());
  fs.symlinkSync(sentinel, f.file());
  assert.throws(() => f.recovery.review(f.project.id, "main.tex"), /preserved/);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "Private fixture");
});
class Memory implements DraftStorage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
test("a deferred A/main.tex editor callback after B/main.tex opens changes neither B source nor A recovery journal", async () => {
  const drafts = new SourceDrafts(new Memory(), "client", () => 1);
  let active = {
    project: "A",
    file: { path: "main.tex", revision: 0, content: "A source" },
  };
  const callback = (project: string, path: string, text: string) => {
    const current = visibleSource(project, path, active.project, active.file);
    if (!current) return;
    drafts.write(project, path, current.revision, text, current.content);
    active = { ...active, file: { ...current, content: text } };
  };
  const delayed = Promise.resolve().then(() =>
    callback("A", "main.tex", "Late A event"),
  );
  active = {
    project: "B",
    file: { path: "main.tex", revision: 7, content: "B source" },
  };
  await delayed;
  assert.equal(active.file.content, "B source");
  assert.deepEqual(drafts.list("A"), []);
  assert.deepEqual(drafts.list("B"), []);
  callback("B", "main.tex", "Valid B edit");
  assert.equal(active.file.content, "Valid B edit");
  assert.equal(drafts.list("B")[0].text, "Valid B edit");
  callback("B", "other.tex", "Late different-file event");
  assert.equal(active.file.content, "Valid B edit");
});
test("browser journal preserves exact unsaved and empty text across a new page identity", () => {
  const storage = new Memory(),
    a = new SourceDrafts(storage, "a", () => 1),
    b = new SourceDrafts(storage, "b");
  const text = "  新文本 👩🏽‍💻 e\u0301\n";
  a.write("p", "main.tex", 2, text, "Saved");
  assert.equal(b.list("p")[0].text, text);
  a.write("p", "main.tex", 2, "", "Saved");
  assert.equal(b.list("p")[0].text, "");
  assert.equal(b.list("other").length, 0);
});
test("late save acknowledgments preserve newer browser typing and cannot clear another page's draft", () => {
  const storage = new Memory(),
    a = new SourceDrafts(storage, "a", () => 1),
    b = new SourceDrafts(storage, "b", () => 2);
  a.write("p", "main.tex", 0, "First", "Saved");
  const newer = a.write("p", "main.tex", 0, "Newest", "Saved");
  b.write("p", "main.tex", 0, "Other page", "Saved");
  const ack = a.saved("p", "main.tex", "First", 1)!;
  assert.equal(ack.text, "Newest");
  assert.ok(ack.sequence > newer.sequence);
  assert.equal(ack.revision, 1);
  a.saved("p", "main.tex", "Newest", 2);
  assert.equal(a.list("p").length, 1);
  assert.equal(a.list("p")[0].text, "Other page");
});
test("discard binds the exact browser draft and never evicts another file", () => {
  const a = new SourceDrafts(new Memory(), "a", () => 1),
    first = a.write("p", "a.tex", 0, "First", "Saved");
  a.write("p", "b.tex", 0, "Other", "Saved");
  a.write("p", "a.tex", 0, "Newer", "Saved");
  assert.throws(() => a.discard(first), /changed in another view/);
  assert.equal(a.list("p").length, 2);
  const current = a.list("p", "a.tex")[0],
    clear = a.discard(current);
  assert.equal(clear?.cleared, true);
  assert.equal(a.list("p")[0].path, "b.tex");
  assert.ok(
    a.write("p", "a.tex", 1, "Again", "Saved").sequence > clear!.sequence,
  );
});
test("quota failure exposes the full exact draft for backend fallback without claiming browser persistence", () => {
  const memory = new Memory();
  memory.setItem = () => {
    throw Error("Quota");
  };
  const a = new SourceDrafts(memory, "a");
  assert.throws(
    () => a.write("p", "main.tex", 0, "Keep me", "Saved"),
    (e: any) =>
      e instanceof DraftPersistenceError && e.draft.text === "Keep me",
  );
});
test("a backend-normalized draft can consume its byte-identical browser copy regardless of JSON property order", () => {
  const a = new SourceDrafts(new Memory(), "a", () => 1),
    d = a.write("p", "main.tex", 0, "Draft", "Saved");
  const normalized = {
    id: d.id,
    project: d.project,
    path: d.path,
    sequence: d.sequence,
    revision: d.revision,
    text: d.text,
    updated: d.updated,
  };
  assert.equal(a.discard(normalized).cleared, true);
  assert.deepEqual(a.list("p"), []);
});
test("unknown browser records stay untouched and oversized source drafts are rejected", () => {
  const memory = new Memory();
  memory.setItem("unrelated", "do not inspect");
  memory.setItem("prism:source-draft:v1:broken", "invalid json");
  const a = new SourceDrafts(memory, "a");
  assert.deepEqual(a.list("p"), []);
  assert.equal(memory.length, 2);
  assert.throws(
    () => a.write("p", "main.tex", 0, "a".repeat(2 * 1024 * 1024 + 1), "Saved"),
    /2 MiB/,
  );
});
test("SQLite drafts persist through backend restart and never enter source or history exports", (t) => {
  const f = fixture(t),
    a = new SourceDrafts(new Memory(), "a", () => 1),
    d = a.write(f.project.id, "main.tex", 0, "Unsaved exact 🧪\n", "Saved"),
    before = f.store.checkpoints(f.project.id);
  f.drafts.save(f.project.id, d);
  f.reopen();
  assert.deepEqual(f.drafts.list(f.project.id), [d]);
  assert.equal(
    f.store.readText(f.project.id, "main.tex").content,
    "Original α.\n",
  );
  assert.deepEqual(f.store.checkpoints(f.project.id), before);
  assert.ok(
    f.store
      .exportFiles(f.project.id)
      .every((file) => !file.data.includes(Buffer.from(d.text))),
  );
});
test("SQLite sequence tombstones prevent delayed writes from reviving cleared drafts", (t) => {
  const f = fixture(t),
    a = new SourceDrafts(new Memory(), "a", () => 1),
    first = a.write(f.project.id, "main.tex", 0, "First", "Saved"),
    second = a.write(f.project.id, "main.tex", 0, "Newest", "Saved");
  f.drafts.save(f.project.id, second);
  assert.deepEqual(f.drafts.save(f.project.id, first), second);
  const clear = a.discard(second)!;
  const saved = f.drafts.save(f.project.id, clear);
  assert.equal(saved.cleared, true);
  assert.equal(saved.text, "");
  assert.deepEqual(f.drafts.save(f.project.id, second), saved);
  f.reopen();
  assert.deepEqual(f.drafts.save(f.project.id, second), saved);
});
test("SQLite draft retries are exact and identities cannot cross files/projects", (t) => {
  const f = fixture(t),
    a = new SourceDrafts(new Memory(), "a", () => 1),
    d = a.write(f.project.id, "main.tex", 0, "Draft", "Saved");
  f.drafts.save(f.project.id, d);
  assert.deepEqual(f.drafts.save(f.project.id, d), d);
  assert.throws(
    () => f.drafts.save(f.project.id, { ...d, text: "Other" }),
    /different text/,
  );
  assert.throws(
    () => f.drafts.save(f.project.id, { ...d, path: "other.tex", sequence: 2 }),
    /different file/,
  );
  const p = f.store.create("Other", [
    { path: "main.tex", data: Buffer.from("Other") },
  ]);
  assert.throws(
    () => f.drafts.save(p.id, { ...d, project: p.id, sequence: 2 }),
    /different project/,
  );
  for (const patch of [
    { path: "../x" },
    { sequence: -1 },
    { text: "a".repeat(2 * 1024 * 1024 + 1) },
    { revision: -1 },
  ])
    assert.throws(() => f.drafts.save(f.project.id, { ...d, ...patch }));
});
test("source recovery APIs preserve origin, local header and active-run guards", async (t) => {
  const root = path.resolve(
      "data/verification/source-recovery-api-" + randomUUID(),
    ),
    f = await createApp(root, { seed: false });
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = f.store.create("API", [
    { path: "main.tex", data: Buffer.from("Original") },
  ]);
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    url = `/api/projects/${p.id}/disk`;
  const review = (
    await f.app.inject({ method: "GET", url: url + "?path=main.tex", headers })
  ).json();
  assert.equal(
    (
      await f.app.inject({
        method: "GET",
        url: url + "?path=main.tex",
        headers: { ...headers, origin: "https://outside.invalid" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: url + "/resolve",
        headers: { host: headers.host },
        payload: { path: "main.tex", token: review.token, action: "disk" },
      })
    ).statusCode,
    403,
  );
  f.store.projectLocks.set(p.id, "agent");
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: url + "/resolve",
        headers,
        payload: { path: "main.tex", token: review.token, action: "disk" },
      })
    ).statusCode,
    409,
  );
  const d = new SourceDrafts(new Memory(), "a").write(
    p.id,
    "main.tex",
    0,
    "Recovery allowed while agent works",
    "Original",
  );
  assert.equal(
    (
      await f.app.inject({
        method: "PUT",
        url: `/api/projects/${p.id}/source-drafts`,
        headers,
        payload: d,
      })
    ).statusCode,
    200,
  );
  assert.equal(f.store.readText(p.id, "main.tex").content, "Original");
  f.store.projectLocks.delete(p.id);
});

test("disk review exposes editor eligibility for missing text versus missing assets/folders", (t) => {
  const f = fixture(t);
  f.store.add(f.project.id, "asset.bin", Buffer.from([0, 1, 255]));
  f.store.add(f.project.id, "empty", Buffer.alloc(0), true);
  assert.equal(f.recovery.review(f.project.id, "main.tex").editable, true);
  assert.equal(f.recovery.review(f.project.id, "asset.bin").editable, false);
  assert.equal(f.recovery.review(f.project.id, "empty").editable, false);
  fs.unlinkSync(f.file("main.tex"));
  fs.unlinkSync(f.file("asset.bin"));
  fs.rmdirSync(f.file("empty"));
  assert.equal(f.recovery.review(f.project.id, "main.tex").editable, true);
  assert.equal(f.recovery.review(f.project.id, "asset.bin").editable, false);
  assert.equal(f.recovery.review(f.project.id, "empty").editable, false);
});
