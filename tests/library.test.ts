import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { Library } from "../server/library";
import { createApp } from "../server/app";
import { readZip } from "../server/files";
function setup(t: any) {
  const root = path.resolve("data/verification/library-test-" + randomUUID());
  let store = new Store(root),
    compiler = new Compiler(store),
    library = new Library(store, compiler);
  const a = store.create("同名 / project", [
      {
        path: "paper/main.tex",
        data: Buffer.from(
          "\\documentclass{article}\n\\begin{document}Synthetic source.\\end{document}\n",
        ),
      },
      { path: "assets/raw.bin", data: Buffer.from([0, 255, 1]) },
      { path: "empty", data: Buffer.alloc(0), directory: true },
    ]),
    b = store.create(a.name, [
      {
        path: "main.tex",
        data: Buffer.from(
          "\\documentclass{article}\n\\begin{document}Another source.\\end{document}\n",
        ),
      },
    ]);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    get library() {
      return library;
    },
    get compiler() {
      return compiler;
    },
    root,
    a,
    b,
    restart() {
      store.close();
      store = new Store(root);
      compiler = new Compiler(store);
      library = new Library(store, compiler);
    },
  };
}
const request = (action: string, projects: string[], tag?: string) => ({
  action,
  projects,
  ...(tag ? { tags: [tag] } : {}),
});
const apply = (f: any, action: string, projects: string[], tag?: string) =>
  f.library.apply({
    id: randomUUID(),
    preview: f.library.preview(request(action, projects, tag)),
  });
function addTag(f: any, name = "Research", color = "#6087b9") {
  const before = new Set(f.library.state().tags.map((t: any) => t.id));
  const r = f.library.changeTag({
    id: randomUUID(),
    action: "create",
    name,
    color,
  });
  return r.state.tags.find((t: any) => !before.has(t.id))!;
}
function invariant(store: Store, id: string) {
  return JSON.stringify({
    project: store.project(id, true),
    files: store
      .exportFiles(id)
      .map((f) => [f.path, f.data.toString("base64"), !!f.directory]),
    history: store.db
      .prepare(
        "SELECT id,payload FROM checkpoints WHERE project=? ORDER BY rowid",
      )
      .all(id),
    chats: store.db
      .prepare("SELECT * FROM conversations WHERE project=? ORDER BY rowid")
      .all(id),
    review: store.db
      .prepare("SELECT * FROM tracking_projects WHERE project=?")
      .all(id),
  });
}
test("library starts with neutral metadata without changing existing project source/history/chat", (t) => {
  const f = setup(t),
    before = invariant(f.store, f.a.id);
  assert.equal(f.library.state().tags.length, 0);
  assert.deepEqual(
    f.library.state().projects.find((p) => p.id === f.a.id),
    { id: f.a.id, deletedAt: null, revision: 0, archivedAt: null, tags: [] },
  );
  const tag = addTag(f);
  apply(f, "tag-add", [f.a.id], tag.id);
  apply(f, "archive", [f.a.id]);
  assert.equal(invariant(f.store, f.a.id), before);
  assert.ok(
    f.library.state().projects.find((p) => p.id === f.a.id)?.archivedAt,
  );
  apply(f, "unarchive", [f.a.id]);
  assert.equal(invariant(f.store, f.a.id), before);
});
test("bulk tag adds preserve other tags and removal only affects the selected tag/projects", (t) => {
  const f = setup(t),
    x = addTag(f, "X"),
    y = addTag(f, "Y");
  apply(f, "tag-add", [f.a.id], x.id);
  const p = f.library.preview(request("tag-add", [f.a.id, f.b.id], x.id));
  assert.equal(p.changes, 1);
  f.library.apply({ id: randomUUID(), preview: p });
  apply(f, "tag-add", [f.a.id], y.id);
  apply(f, "tag-remove", [f.a.id, f.b.id], x.id);
  const s = f.library.state();
  assert.deepEqual(s.projects.find((p) => p.id === f.a.id)!.tags, [y.id]);
  assert.deepEqual(s.projects.find((p) => p.id === f.b.id)!.tags, []);
  assert.throws(
    () => f.library.preview(request("tag-remove", [f.b.id], x.id)),
    /already have/,
  );
});
test("tag names, HEX colors, canonical uniqueness and revision conflicts are validated", (t) => {
  const f = setup(t),
    tag = addTag(f, "Cafe\u0301", "#AbCdEf");
  assert.equal(tag.name, "Café");
  assert.equal(tag.color, "#abcdef");
  for (const name of ["", "\nX", "x".repeat(121), "\u0000", "\ud800"])
    assert.throws(() => addTag(f, name));
  assert.throws(() => addTag(f, "CAFÉ"), /already has/);
  for (const color of ["red", "#fff", "#12345678", "url(x)"])
    assert.throws(() => addTag(f, "Other", color), /HEX/);
  assert.throws(
    () =>
      f.library.changeTag({
        id: randomUUID(),
        action: "update",
        tag: tag.id,
        expectedRevision: 8,
        name: "X",
        color: "#808080",
      }),
    /changed/,
  );
  const r = f.library.changeTag({
    id: randomUUID(),
    action: "update",
    tag: tag.id,
    expectedRevision: 0,
    name: "Renamed",
    color: "#808080",
  });
  assert.equal(r.state.tags[0].revision, 1);
});
test("tag removal is recoverable with memberships, conflict-safe rename before restore and restart", (t) => {
  const f = setup(t),
    tag = addTag(f);
  apply(f, "tag-add", [f.a.id], tag.id);
  f.library.changeTag({
    id: randomUUID(),
    action: "trash",
    tag: tag.id,
    expectedRevision: 0,
  });
  assert.throws(
    () => f.library.preview(request("tag-add", [f.b.id], tag.id)),
    /Restore a removed tag/,
  );
  const other = addTag(f);
  assert.throws(
    () =>
      f.library.changeTag({
        id: randomUUID(),
        action: "restore",
        tag: tag.id,
        expectedRevision: 1,
      }),
    /already has/,
  );
  f.library.changeTag({
    id: randomUUID(),
    action: "update",
    tag: tag.id,
    expectedRevision: 1,
    name: "Recovered",
    color: tag.color,
  });
  f.restart();
  f.library.changeTag({
    id: randomUUID(),
    action: "restore",
    tag: tag.id,
    expectedRevision: 2,
  });
  assert.deepEqual(
    f.library.state().projects.find((p) => p.id === f.a.id)!.tags,
    [tag.id],
  );
  assert.equal(
    f.library.state().tags.find((t) => t.id === other.id)!.name,
    "Research",
  );
});
test("archive, tag and Trash state persist; archived projects remain editable and restore preserves archive", (t) => {
  const f = setup(t),
    tag = addTag(f);
  apply(f, "archive", [f.a.id, f.b.id]);
  apply(f, "tag-add", [f.a.id, f.b.id], tag.id);
  const before = f.library.state();
  const file = f.store.readText(f.a.id, "paper/main.tex");
  f.store.save(
    f.a.id,
    file.path,
    file.content + "% independent edit\n",
    file.revision,
  );
  apply(f, "trash", [f.a.id, f.b.id]);
  assert.equal(f.store.list(true).length, 2);
  f.restart();
  assert.equal(f.store.list().length, 0);
  apply(f, "restore", [f.a.id, f.b.id]);
  for (const p of f.library.state().projects) {
    assert.equal(
      p.archivedAt,
      before.projects.find((x) => x.id === p.id)!.archivedAt,
    );
    assert.deepEqual(p.tags, [tag.id]);
    assert.equal(p.deletedAt, null);
  }
  assert.match(f.store.readText(f.a.id, file.path).content, /independent edit/);
});
test("all mutation retries are exact and recover after later metadata changes and restart", (t) => {
  const f = setup(t),
    tagReq = {
      id: randomUUID(),
      action: "create",
      name: "Once",
      color: "#808080",
    },
    r = f.library.changeTag(tagReq),
    tag = r.state.tags[0];
  assert.ok(f.library.changeTag(tagReq).replayed);
  const req = {
    id: randomUUID(),
    preview: f.library.preview(request("archive", [f.a.id, f.b.id])),
  };
  f.library.apply(req);
  apply(f, "unarchive", [f.a.id, f.b.id]);
  f.library.changeTag({
    id: randomUUID(),
    action: "update",
    tag: tag.id,
    expectedRevision: 0,
    name: "Later",
    color: "#6087b9",
  });
  f.restart();
  assert.ok(f.library.apply(req).replayed);
  assert.ok(f.library.changeTag(tagReq).replayed);
  assert.equal(f.library.state().tags.length, 1);
  assert.ok(f.library.state().projects.every((p) => p.archivedAt === null));
  assert.throws(
    () =>
      f.library.apply({
        ...req,
        preview: { ...req.preview, hash: "a".repeat(64) },
      }),
    /another action/,
  );
});
test("stale previews reject changes to target identity, membership, archive, Trash, or chosen tag", (t) => {
  const f = setup(t),
    tag = addTag(f);
  let p = f.library.preview(request("archive", [f.a.id]));
  f.store.update(f.a.id, { name: "Renamed" });
  assert.throws(
    () => f.library.apply({ id: randomUUID(), preview: p }),
    /changed/,
  );
  p = f.library.preview(request("archive", [f.a.id]));
  apply(f, "tag-add", [f.a.id], tag.id);
  assert.throws(
    () => f.library.apply({ id: randomUUID(), preview: p }),
    /changed/,
  );
  p = f.library.preview(request("archive", [f.a.id]));
  apply(f, "archive", [f.a.id]);
  assert.throws(
    () => f.library.apply({ id: randomUUID(), preview: p }),
    /already have/,
  );
  apply(f, "unarchive", [f.a.id]);
  p = f.library.preview(request("tag-remove", [f.a.id], tag.id));
  f.library.changeTag({
    id: randomUUID(),
    action: "update",
    tag: tag.id,
    expectedRevision: 0,
    name: "New tag name",
    color: tag.color,
  });
  assert.throws(
    () => f.library.apply({ id: randomUUID(), preview: p }),
    /metadata changed/,
  );
  p = f.library.preview(request("archive", [f.a.id]));
  f.store.trashProject(f.a.id);
  assert.throws(
    () => f.library.apply({ id: randomUUID(), preview: p }),
    /Trash/,
  );
});
test("source edits may continue during organization, while export generations are revision-bound", (t) => {
  const f = setup(t),
    archive = f.library.preview(request("archive", [f.a.id])),
    download = f.library.preview(request("export", [f.a.id]));
  const file = f.store.readText(f.a.id, "paper/main.tex");
  f.store.save(f.a.id, file.path, file.content + "% later\n", file.revision);
  assert.throws(() => f.library.export(download), /changed/);
  f.library.apply({ id: randomUUID(), preview: archive });
  assert.match(f.store.readText(f.a.id, file.path).content, /later/);
});
test("any active AI run or compilation blocks the entire Trash batch; safe metadata stays available", (t) => {
  const f = setup(t);
  for (const status of ["generating", "typing", "paused", "preview"]) {
    const run = {
      id: randomUUID(),
      projectId: f.b.id,
      conversationId: "fixture",
      status,
      prompt: "fixture",
      mode: "manual",
      provider: "openai",
      model: "fixture",
    };
    f.store.saveRun(run as any);
    assert.throws(
      () => f.library.preview(request("trash", [f.a.id, f.b.id])),
      /AI request/,
    );
    f.store.saveRun({ ...run, status: "stopped" } as any);
  }
  const before = f.store.list().length;
  const preview = f.library.preview(request("trash", [f.a.id, f.b.id]));
  const list = f.compiler.list.bind(f.compiler);
  f.compiler.list = (id: string) =>
    id === f.b.id ? [{ status: "running" } as any] : list(id);
  assert.throws(
    () => f.library.apply({ id: randomUUID(), preview }),
    /compilation/,
  );
  assert.equal(f.store.list().length, before);
  apply(f, "archive", [f.a.id, f.b.id]);
  assert.ok(f.library.state().projects.every((p) => p.archivedAt));
});
test("transaction rollback leaves an entire failed batch unmodified and its request retryable", (t) => {
  const f = setup(t),
    p = f.library.preview(request("archive", [f.a.id, f.b.id])),
    req = { id: randomUUID(), preview: p };
  f.store.db.exec(
    `CREATE TRIGGER fail_library BEFORE INSERT ON project_library WHEN NEW.project='${p.targets[1].id}' BEGIN SELECT RAISE(ABORT,'injected'); END;`,
  );
  assert.throws(() => f.library.apply(req), /injected/);
  assert.ok(f.library.state().projects.every((p) => p.revision === 0));
  assert.equal(
    (f.store.db.prepare("SELECT count(*) n FROM library_ops").get() as any).n,
    0,
  );
  f.store.db.exec("DROP TRIGGER fail_library");
  assert.equal(f.library.apply(req).replayed, false);
});
test("bulk export contains independent collision-free ZIPs with exact nested files and empty folders", async (t) => {
  const f = setup(t),
    before = [invariant(f.store, f.a.id), invariant(f.store, f.b.id)];
  apply(f, "archive", [f.a.id]);
  const plan = f.library.preview(request("export", [f.a.id, f.b.id]));
  const outer = await readZip(Buffer.from(f.library.export(plan)));
  assert.equal(outer.length, 2);
  assert.equal(new Set(outer.map((f) => f.path)).size, 2);
  for (const target of plan.targets) {
    const entry = outer.find((f) => f.path.endsWith(target.id + ".zip"))!;
    assert.ok(entry);
    const inner = await readZip(entry.data);
    const original = f.store.exportFiles(target.id);
    assert.deepEqual(
      inner
        .map((f) => [
          f.path,
          createHash("sha256").update(f.data).digest("hex"),
          !!f.directory,
        ])
        .sort(),
      original
        .map((f) => [
          f.path,
          createHash("sha256").update(f.data).digest("hex"),
          !!f.directory,
        ])
        .sort(),
    );
  }
  assert.deepEqual(
    [invariant(f.store, f.a.id), invariant(f.store, f.b.id)],
    before,
  );
});
test("selection, download and malformed request bounds reject before mutations", (t) => {
  const f = setup(t);
  for (const projects of [
    [],
    [f.a.id, f.a.id],
    ["../escape"],
    Array.from({ length: 101 }, () => randomUUID()),
  ])
    assert.throws(() => f.library.preview(request("archive", projects)));
  assert.throws(
    () =>
      f.library.preview(
        request(
          "export",
          Array.from({ length: 21 }, () => randomUUID()),
        ),
      ),
    /at most 20/,
  );
  assert.throws(() => f.library.apply({ id: randomUUID() }), /Invalid library/);
  assert.throws(() => f.library.apply({ id: "x", preview: {} }), /request ID/);
  assert.throws(() => f.library.preview(request("delete", [f.a.id])));
  assert.throws(
    () =>
      f.library.apply({
        id: randomUUID(),
        preview: f.library.preview(request("export", [f.a.id])),
      }),
    /Download ZIP/,
  );
  assert.equal(f.store.list().length, 2);
});
test("active tag, retained tag and per-project tag caps include restored memberships", (t) => {
  const f = setup(t),
    tags = Array.from({ length: 33 }, (_, i) => addTag(f, "Tag " + i));
  for (const tag of tags.slice(0, 32)) apply(f, "tag-add", [f.a.id], tag.id);
  assert.throws(() => apply(f, "tag-add", [f.a.id], tags[32].id), /32 active/);
  f.library.changeTag({
    id: randomUUID(),
    action: "trash",
    tag: tags[0].id,
    expectedRevision: 0,
  });
  apply(f, "tag-add", [f.a.id], tags[32].id);
  assert.throws(
    () =>
      f.library.changeTag({
        id: randomUUID(),
        action: "restore",
        tag: tags[0].id,
        expectedRevision: 1,
      }),
    /32 active/,
  );
  for (let i = 33; i < 101; i++) addTag(f, "Tag " + i);
  assert.throws(() => addTag(f, "Overflow"), /active tag/);
  f.store.db
    .prepare("UPDATE project_tags SET deletedAt=?")
    .run(new Date().toISOString());
  const insert = f.store.db.prepare(
    "INSERT INTO project_tags(id,name,name_key,color,revision,deletedAt) VALUES(?,?,?,?,0,?)",
  );
  for (let i = 101; i < 500; i++)
    insert.run(
      randomUUID(),
      "Removed " + i,
      "removed " + i,
      "#808080",
      new Date().toISOString(),
    );
  assert.throws(() => addTag(f, "Retained overflow"), /retained tag/);
});
test("library local API preserves origin/mutation guards and exports a binary download", async (t) => {
  const root = path.resolve("data/verification/library-api-" + randomUUID()),
    e = await createApp(root, { seed: false });
  t.after(async () => {
    await e.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = e.store.create("API source", [
      { path: "main.tex", data: Buffer.from("API source\n") },
    ]),
    headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  assert.equal(
    (
      await e.app.inject({
        method: "GET",
        url: "/api/library",
        headers: { host: "evil.invalid" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await e.app.inject({
        method: "POST",
        url: "/api/library/tags",
        headers: { host: "127.0.0.1:4317" },
        payload: {},
      })
    ).statusCode,
    403,
  );
  const preview = await e.app.inject({
    method: "POST",
    url: "/api/library/preview",
    headers,
    payload: request("export", [p.id]),
  });
  assert.equal(preview.statusCode, 200);
  const download = await e.app.inject({
    method: "POST",
    url: "/api/library/export",
    headers,
    payload: preview.json(),
  });
  assert.equal(download.statusCode, 200);
  assert.match(download.headers["content-type"]!, /application\/zip/);
  assert.equal((await readZip(download.rawPayload)).length, 1);
});

test("multiple tags apply atomically, mixed archive batches skip unchanged projects, and request key order is irrelevant", (t) => {
  const f = setup(t),
    x = addTag(f, "X"),
    y = addTag(f, "Y");
  const plan = f.library.preview({
    action: "tag-add",
    projects: [f.a.id, f.b.id],
    tags: [y.id, x.id],
  });
  const id = randomUUID(),
    req = { id, preview: plan };
  f.library.apply(req);
  assert.equal(
    f.library.apply({
      preview: {
        ...plan,
        targets: plan.targets.map((p) =>
          Object.fromEntries(Object.entries(p).reverse()),
        ),
      },
      id,
    }).replayed,
    true,
  );
  for (const p of f.library.state().projects)
    assert.deepEqual([...p.tags].sort(), [x.id, y.id].sort());
  apply(f, "archive", [f.a.id]);
  const before = f.library.state().projects.find((p) => p.id === f.a.id)!;
  const mixed = f.library.preview(request("archive", [f.a.id, f.b.id]));
  assert.equal(mixed.changes, 1);
  f.library.apply({ id: randomUUID(), preview: mixed });
  assert.deepEqual(
    f.library.state().projects.find((p) => p.id === f.a.id),
    before,
  );
  apply(f, "tag-remove", [f.a.id], x.id);
  assert.throws(
    () =>
      f.library.preview({
        action: "tag-add",
        projects: [f.a.id],
        tags: [x.id, x.id],
      }),
    /distinct tags/,
  );
});
test("source export limits are checked from SQL sizes/counts before loading source bytes", (t) => {
  const f = setup(t);
  f.store.db
    .prepare("UPDATE files SET content=zeroblob(?) WHERE project=? AND path=?")
    .run(100 * 1024 * 1024 + 1, f.a.id, "paper/main.tex");
  assert.throws(
    () => f.library.preview(request("export", [f.a.id])),
    /100 MiB/,
  );
  f.store.db
    .prepare("UPDATE files SET content=? WHERE project=? AND path=?")
    .run(Buffer.from("small"), f.a.id, "paper/main.tex");
  const insert = f.store.db.prepare(
    "INSERT INTO files(project,path,content,kind,revision,deleted) VALUES(?,?,?, ?,0,0)",
  );
  f.store.transaction(() => {
    for (let i = 0; i < 10001; i++)
      insert.run(f.a.id, `many/file-${i}.txt`, Buffer.alloc(0), "text");
  });
  assert.throws(() => f.library.preview(request("export", [f.a.id])), /10,000/);
});
test("restore materialization failure rolls back the entire batch and can safely retry", (t) => {
  const f = setup(t);
  apply(f, "trash", [f.a.id, f.b.id]);
  const preview = f.library.preview(request("restore", [f.a.id, f.b.id])),
    req = { id: randomUUID(), preview };
  const materialize = f.store.materialize.bind(f.store);
  f.store.materialize = (id: string) => {
    if (id === preview.targets[1].id)
      throw new Error("injected materialization failure");
    materialize(id);
  };
  assert.throws(() => f.library.apply(req), /injected/);
  assert.equal(f.store.list(true).length, 2);
  assert.ok(f.library.state().projects.every((p) => p.revision === 1));
  f.store.materialize = materialize;
  f.library.apply(req);
  assert.equal(f.store.list().length, 2);
  assert.equal(f.library.apply(req).replayed, true);
});
test("restoring through a symlinked managed directory cannot write outside the project tree", (t) => {
  const f = setup(t);
  apply(f, "trash", [f.a.id]);
  const folder = path.join(f.root, "projects", f.a.id, "files"),
    backup = folder + "-backup",
    outside = path.join(f.root, "outside");
  fs.mkdirSync(outside);
  fs.renameSync(folder, backup);
  fs.symlinkSync(outside, folder, "dir");
  const req = {
    id: randomUUID(),
    preview: f.library.preview(request("restore", [f.a.id])),
  };
  assert.throws(() => f.library.apply(req));
  assert.equal(f.store.project(f.a.id, true).deletedAt !== null, true);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(folder);
  fs.renameSync(backup, folder);
  f.library.apply(req);
  assert.equal(f.store.project(f.a.id).deletedAt, null);
});

test("prepared source links freeze exact bytes and require preparing again after restart", async (t) => {
  const f = setup(t),
    plan = f.library.preview(request("export", [f.a.id, f.b.id])),
    receipt = f.library.prepareDownload(plan),
    bytes = f.library.download(receipt.id),
    before = createHash("sha256").update(bytes).digest("hex");
  assert.equal(receipt.bytes, bytes.length);
  assert.equal(receipt.projects, 2);
  assert.match(
    receipt.url,
    new RegExp("/api/library/exports/" + receipt.id + "$"),
  );
  assert.equal((await readZip(bytes)).length, 2);
  const file = f.store.readText(f.a.id, "paper/main.tex");
  f.store.save(
    f.a.id,
    file.path,
    file.content + "% newer source\n",
    file.revision,
  );
  assert.equal(
    createHash("sha256").update(f.library.download(receipt.id)).digest("hex"),
    before,
  );
  assert.throws(() => f.library.prepareDownload(plan), /changed/);
  f.library.dispose();
  f.restart();
  assert.throws(
    () => f.library.download(receipt.id),
    /expired or Leaf restarted/,
  );
});
test("prepared downloads expire, evict older derived entries and dispose without touching source", (t) => {
  const f = setup(t);
  let now = 0;
  const cache = new Library(f.store, f.compiler, () => now);
  t.after(() => cache.dispose());
  const before = invariant(f.store, f.a.id),
    plan = cache.preview(request("export", [f.a.id]));
  const receipts = Array.from({ length: 5 }, () => cache.prepareDownload(plan));
  assert.throws(() => cache.download(receipts[0].id), /expired/);
  for (const r of receipts.slice(1)) assert.ok(cache.download(r.id).length);
  now = 15 * 60 * 1000 + 1;
  assert.throws(() => cache.download(receipts[4].id), /expired/);
  const fresh = cache.prepareDownload(plan);
  assert.ok(cache.download(fresh.id).length);
  cache.dispose();
  assert.throws(() => cache.download(fresh.id), /expired/);
  assert.equal(invariant(f.store, f.a.id), before);
});
test("prepared HTTP downloads return a real attachment and clear expiry errors without attachment headers", async (t) => {
  const root = path.resolve(
      "data/verification/library-download-api-" + randomUUID(),
    ),
    e = await createApp(root, { seed: false });
  t.after(async () => {
    await e.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = e.store.create("Prepared API source", [
      { path: "main.tex", data: Buffer.from("Exact prepared source\n") },
    ]),
    headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    plan = e.library.preview(request("export", [p.id]));
  const prepared = await e.app.inject({
    method: "POST",
    url: "/api/library/exports",
    headers,
    payload: plan,
  });
  assert.equal(prepared.statusCode, 200);
  const receipt = prepared.json();
  const download = await e.app.inject({
    method: "GET",
    url: receipt.url,
    headers,
  });
  assert.equal(download.statusCode, 200);
  assert.equal(download.headers["cache-control"], "no-store");
  assert.match(download.headers["content-disposition"]!, /attachment/);
  const outer = await readZip(download.rawPayload),
    inner = await readZip(outer[0].data);
  assert.equal(inner[0].data.toString(), "Exact prepared source\n");
  assert.equal(
    (
      await e.app.inject({
        method: "GET",
        url: receipt.url,
        headers: { ...headers, origin: "https://evil.invalid" },
      })
    ).statusCode,
    403,
  );
  e.library.dispose();
  const expired = await e.app.inject({
    method: "GET",
    url: receipt.url,
    headers,
  });
  assert.equal(expired.statusCode, 410);
  assert.match(expired.json().error, /Prepare ZIP again/);
  assert.equal(expired.headers["content-disposition"], undefined);
});
test("failed batch preflight identifies the busy project and confirms no target moved", (t) => {
  const f = setup(t),
    p = f.store.create("Named busy project", [
      { path: "main.tex", data: Buffer.from("source") },
    ]);
  const run = {
    id: randomUUID(),
    projectId: p.id,
    conversationId: "fixture",
    status: "typing",
    prompt: "fixture",
    mode: "manual",
    provider: "openai",
    model: "fixture",
  };
  f.store.saveRun(run as any);
  assert.throws(
    () => f.library.preview(request("trash", [f.a.id, p.id])),
    (error) => {
      assert.match((error as Error).message, /Named busy project/);
      assert.match((error as Error).message, /No projects were moved/);
      assert.match((error as Error).message, /refresh this preview/);
      return true;
    },
  );
  assert.equal(f.store.list().length, 3);
  assert.equal(f.store.list(true).length, 0);
  f.store.saveRun({ ...run, status: "stopped" } as any);
});
