import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Store } from "../server/store";
import { Compiler } from "../server/compiler";
import { Templates } from "../server/templates";
import { Comments } from "../server/comments";
import { Tracking } from "../server/tracking";
import { HistoryLabels } from "../server/history-labels";
import { createApp } from "../server/app";
import { readZip, writeZip } from "../server/files";
import { templateStarters } from "../server/template-starters";
import type { CompileJob } from "../shared/types";
function setup(t: any) {
  const root = path.resolve("data/verification/templates-test-" + randomUUID());
  let store = new Store(root),
    compiler = new Compiler(store),
    templates = new Templates(store, compiler);
  const p = store.create("Synthetic template source", [
    {
      path: "paper/main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}Original source.\\end{document}\n",
      ),
    },
    {
      path: "alternative.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}Alternative.\\end{document}\n",
      ),
    },
    { path: "assets/figure.bin", data: Buffer.from([0, 255, 7, 9]) },
    { path: "empty/nested", data: Buffer.alloc(0), directory: true },
    {
      path: "custom.sty",
      data: Buffer.from("\\newcommand{\\custom}[1]{#1}\r\n"),
    },
    { path: "legacy.tex", data: Buffer.from([0x25, 0xe9, 0x0a]) },
    { path: "build.sh", data: Buffer.from("#!/bin/sh\nexit 99\n") },
  ]);
  store.update(p.id, { root: "paper/main.tex", engine: "xelatex" });
  store.automaticCheckpoint(p.id);
  t.after(() => {
    for (const job of compiler.jobs.values())
      if (["running", "queued"].includes(job.status)) compiler.cancel(job.id);
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    p,
    root,
    get store() {
      return store;
    },
    get compiler() {
      return compiler;
    },
    get templates() {
      return templates;
    },
    restart() {
      store.close();
      store = new Store(root);
      compiler = new Compiler(store);
      templates = new Templates(store, compiler);
    },
  };
}
function request(s: ReturnType<typeof setup>, name = "Personal snapshot") {
  const v = s.templates.preview(s.p.id);
  return {
    id: randomUUID(),
    name,
    description: "Synthetic saved source.",
    expectedGeneration: v.generation,
    hash: v.hash,
  };
}
function save(s: ReturnType<typeof setup>, n?: string) {
  return s.templates.save(s.p.id, request(s, n)).template;
}
function use(s: ReturnType<typeof setup>, id: string, patch: any = {}) {
  const v = s.templates.get(id);
  return s.templates.create(id, {
    id: randomUUID(),
    name: "Independent project",
    hash: v.hash,
    expectedRevision: v.revision,
    root: v.root,
    engine: v.engine,
    ...patch,
  });
}
function evidence(s: ReturnType<typeof setup>) {
  return {
    project: s.store.project(s.p.id),
    files: s.store.exportFiles(s.p.id),
    history: s.store.db
      .prepare("SELECT * FROM checkpoints WHERE project=? ORDER BY rowid")
      .all(s.p.id),
    versions: s.store.db
      .prepare("SELECT * FROM versions WHERE project=? ORDER BY id")
      .all(s.p.id),
    comments: s.store.db
      .prepare("SELECT * FROM comment_threads WHERE project=? ORDER BY id")
      .all(s.p.id),
    tracking: s.store.db
      .prepare("SELECT * FROM tracking_files WHERE project=? ORDER BY path")
      .all(s.p.id),
    chats: s.store.db
      .prepare("SELECT * FROM conversations WHERE project=? ORDER BY rowid")
      .all(s.p.id),
  };
}
test("seven self-authored built-ins expose metadata/source and create independent projects with chosen entry/engine", (t) => {
  const s = setup(t),
    before = evidence(s),
    catalog = s.templates.list();
  assert.equal(catalog.filter((v) => v.builtin).length, 7);
  assert.ok(catalog.every((v) => !("entries" in v) && !("payload" in v)));
  for (const starter of templateStarters) {
    const detail = s.templates.get(starter.id),
      created = use(s, starter.id).project;
    assert.equal(created.root, starter.root);
    assert.equal(created.engine, starter.engine);
    const sorted = (v: any[]) =>
      v
        .map((f) => ({
          path: f.path,
          directory: !!f.directory,
          hex: f.data.toString("hex"),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
    assert.deepEqual(
      sorted(s.store.exportFiles(created.id)),
      sorted(starter.files),
    );
    assert.equal(s.store.checkpoints(created.id).length, 1);
    assert.deepEqual(s.store.checkpoints(created.id)[0].labels, []);
    assert.equal(s.templates.file(starter.id, starter.root).kind, "text");
    assert.equal(detail.hash.length, 64);
  }
  assert.deepEqual(evidence(s), before);
});
test("capture preview/save are source/history/chat/review neutral and preserve exact nested bytes/assets/empty folders", (t) => {
  const s = setup(t),
    comments = new Comments(s.store),
    tracking = new Tracking(s.store);
  comments.create(s.p.id, {
    id: randomUUID(),
    path: "paper/main.tex",
    revision: 0,
    from: 0,
    to: 14,
    body: "Private local discussion",
  });
  tracking.mode(s.p.id, { enabled: true, revision: 0 });
  s.store.save(
    s.p.id,
    "custom.sty",
    "\\newcommand{\\custom}[1]{\\textbf{#1}}\r\n",
    0,
  );
  s.store.createConversation(s.p.id, "Existing chat");
  s.store.automaticCheckpoint(s.p.id);
  const version = s.store.checkpoints(s.p.id)[0];
  new HistoryLabels(s.store).change(s.p.id, version.id, {
    id: randomUUID(),
    action: "add",
    name: "Source milestone",
    expectedRevision: 0,
  });
  const before = evidence(s),
    preview = s.templates.preview(s.p.id),
    saved = save(s);
  assert.equal(preview.entries.length, 7);
  assert.equal(saved.root, "paper/main.tex");
  assert.equal(saved.engine, "xelatex");
  assert.deepEqual(evidence(s), before);
  const copy = use(s, saved.id).project;
  assert.deepEqual(s.store.exportFiles(copy.id), before.files);
  assert.equal(copy.generation, 0);
  assert.equal(copy.root, "paper/main.tex");
  assert.equal(copy.engine, "xelatex");
  assert.equal(s.store.conversations(copy.id).length, 0);
  assert.equal(new Comments(s.store).list(copy.id, {}).total, 0);
  assert.equal(new Tracking(s.store).status(copy.id).enabled, false);
  assert.deepEqual(s.store.checkpoints(copy.id)[0].labels, []);
  assert.equal(
    s.store.fileList(copy.id).find((f) => f.path === "empty/nested")?.kind,
    "directory",
  );
  assert.deepEqual(evidence(s), before);
});
test("personal snapshots remain usable after original edits, source Trash and backend restart", (t) => {
  const s = setup(t),
    saved = save(s),
    original = s.templates.export(saved.id);
  s.store.save(s.p.id, "paper/main.tex", "Later source.", 0);
  s.store.trashProject(s.p.id);
  s.restart();
  assert.deepEqual(s.templates.export(saved.id), original);
  assert.deepEqual(s.store.exportFiles(use(s, saved.id).project.id), original);
  assert.equal(s.templates.get(saved.id).hash, saved.hash);
});
test("save and project creation retry exactly once after restart, later metadata and project Trash", (t) => {
  const s = setup(t),
    r = request(s),
    saved = s.templates.save(s.p.id, r),
    v = saved.template,
    create = {
      id: randomUUID(),
      name: "Created once",
      hash: v.hash,
      expectedRevision: v.revision,
      root: v.root,
      engine: v.engine,
    },
    p = s.templates.create(v.id, create).project;
  s.templates.change(v.id, {
    id: randomUUID(),
    action: "rename",
    expectedRevision: 0,
    name: "Renamed later",
    description: "Later description",
  });
  s.store.trashProject(p.id);
  s.store.trashProject(s.p.id);
  s.restart();
  assert.equal(s.templates.save(s.p.id, r).replayed, true);
  assert.equal(s.templates.save(s.p.id, r).template.name, "Renamed later");
  const replay = s.templates.create(v.id, create);
  assert.equal(replay.replayed, true);
  assert.equal(replay.project.id, p.id);
  assert.ok(replay.project.deletedAt);
  assert.equal(s.store.list(true).length, 2);
  assert.equal(s.templates.list().filter((t) => !t.builtin).length, 1);
  assert.throws(
    () => s.templates.save(s.p.id, { ...r, name: "Changed retry" }),
    /action ID/,
  );
  assert.throws(
    () => s.templates.create(v.id, { ...create, root: "alternative.tex" }),
    /action ID/,
  );
});
test("stale source generations/digests and active AI reject capture without partial rows/blobs", (t) => {
  const s = setup(t),
    r = request(s);
  s.store.save(s.p.id, "custom.sty", "Changed", 0);
  const count = (
    s.store.db.prepare("SELECT count(*) n FROM templates").get() as any
  ).n;
  assert.throws(() => s.templates.save(s.p.id, r), /changed after/);
  assert.equal(
    (s.store.db.prepare("SELECT count(*) n FROM templates").get() as any).n,
    count,
  );
  const fresh = request(s);
  s.store.projectLocks.set(s.p.id, "synthetic-run");
  assert.ok(s.templates.preview(s.p.id));
  assert.throws(() => s.templates.save(s.p.id, fresh), /active AI/);
  s.store.projectLocks.clear();
  s.store.saveRun({
    id: randomUUID(),
    projectId: s.p.id,
    status: "generating",
  } as any);
  assert.throws(() => s.templates.save(s.p.id, fresh), /active AI/);
});
test("metadata rename/Trash/restore is revision bound, recoverable and replay-safe after later changes", (t) => {
  const s = setup(t),
    v = save(s),
    before = evidence(s),
    trash = { id: randomUUID(), action: "trash", expectedRevision: 0 };
  let next = s.templates.change(v.id, trash).template;
  assert.ok(next.deletedAt);
  assert.equal(s.templates.list(true).length, 1);
  assert.throws(() => use(s, v.id), /Trash/);
  assert.throws(() => s.templates.export(v.id), /Trash/);
  next = s.templates.change(v.id, {
    id: randomUUID(),
    action: "rename",
    expectedRevision: next.revision,
    name: "Removed but renamed",
    description: "Kept",
  }).template;
  assert.ok(next.deletedAt);
  assert.equal(s.templates.change(v.id, trash).replayed, true);
  next = s.templates.change(v.id, {
    id: randomUUID(),
    action: "restore",
    expectedRevision: next.revision,
  }).template;
  assert.equal(next.deletedAt, null);
  assert.equal(next.name, "Removed but renamed");
  assert.equal(s.templates.change(v.id, trash).template.deletedAt, null);
  assert.throws(
    () =>
      s.templates.change(v.id, {
        id: randomUUID(),
        action: "rename",
        expectedRevision: 0,
        name: "Stale",
      }),
    /another view/,
  );
  assert.deepEqual(evidence(s), before);
  assert.throws(
    () =>
      s.templates.change("builtin-article", {
        id: randomUUID(),
        action: "trash",
        expectedRevision: 1,
      }),
    /read-only/,
  );
});
test("canonical personal name collisions and restore conflicts retain the removed snapshot", (t) => {
  const s = setup(t),
    v = save(s, "Café Draft");
  assert.throws(() => save(s, "  CAFE\u0301 Draft  "), /already uses/);
  let old = s.templates.change(v.id, {
    id: randomUUID(),
    action: "trash",
    expectedRevision: 0,
  }).template;
  save(s, "Café Draft");
  assert.throws(
    () =>
      s.templates.change(v.id, {
        id: randomUUID(),
        action: "restore",
        expectedRevision: old.revision,
      }),
    /already uses/,
  );
  old = s.templates.change(v.id, {
    id: randomUUID(),
    action: "rename",
    expectedRevision: old.revision,
    name: "Recovered draft",
  }).template;
  assert.equal(
    s.templates.change(v.id, {
      id: randomUUID(),
      action: "restore",
      expectedRevision: old.revision,
    }).template.deletedAt,
    null,
  );
});
test("new project rejects changed template revision/hash, invalid entries and unknown engines", (t) => {
  const s = setup(t),
    v = save(s),
    count = s.store.list().length;
  s.templates.change(v.id, {
    id: randomUUID(),
    action: "rename",
    expectedRevision: 0,
    name: "New name",
  });
  assert.throws(
    () =>
      s.templates.create(v.id, {
        id: randomUUID(),
        name: "Outdated",
        hash: v.hash,
        expectedRevision: 0,
        root: v.root,
        engine: v.engine,
      }),
    /template changed/,
  );
  for (const patch of [
    { hash: "wrong" },
    { root: "../escape.tex" },
    { root: "assets/figure.bin" },
    { root: "" },
    { engine: "shell" },
  ])
    assert.throws(() => use(s, v.id, patch), /template changed|path|Choose/);
  assert.equal(s.store.list().length, count);
  const chosen = use(s, v.id, {
    root: "alternative.tex",
    engine: "lualatex",
  }).project;
  assert.equal(chosen.root, "alternative.tex");
  assert.equal(chosen.engine, "lualatex");
  assert.equal(s.store.project(s.p.id).root, "paper/main.tex");
});
test("source-only kits with no TeX file create safely with an explicitly absent entry", (t) => {
  const s = setup(t),
    p = s.store.create("Source kit", [
      {
        path: "library.sty",
        data: Buffer.from("\\newcommand{\\itemname}{Example}\n"),
      },
    ]);
  const preview = s.templates.preview(p.id),
    v = s.templates.save(p.id, {
      id: randomUUID(),
      name: "Source kit",
      description: "",
      expectedGeneration: preview.generation,
      hash: preview.hash,
    }).template;
  assert.deepEqual(v.roots, []);
  const created = use(s, v.id, { root: "" }).project;
  assert.equal(created.root, "");
  assert.deepEqual(s.store.exportFiles(created.id), s.store.exportFiles(p.id));
  const empty = s.store.create("Empty");
  assert.throws(() => s.templates.preview(empty.id), /active file/);
});
test("source preview is bounded, preserves non-UTF-8 bytes and ZIP exports round-trip exactly", async (t) => {
  const s = setup(t);
  s.store.add(s.p.id, "large.txt", Buffer.alloc(512 * 1024 + 1, 65));
  s.store.automaticCheckpoint(s.p.id);
  const v = save(s);
  assert.match(s.templates.file(v.id, "large.txt").reason!, /512 KiB/);
  assert.match(s.templates.file(v.id, "legacy.tex").reason!, /non-UTF-8/);
  assert.match(
    s.templates.file(v.id, "assets/figure.bin").reason!,
    /Binary asset/,
  );
  assert.match(s.templates.file(v.id, "empty/nested").reason!, /folder/i);
  assert.throws(() => s.templates.file(v.id, "../secret"), /path/);
  assert.throws(() => s.templates.file(v.id, "missing.tex"), /not found/);
  const zipped = await readZip(writeZip(s.templates.export(v.id)));
  assert.deepEqual(
    zipped.find((f) => f.path === "legacy.tex")!.data,
    Buffer.from([0x25, 0xe9, 0x0a]),
  );
  assert.equal(zipped.find((f) => f.path === "empty/nested")!.directory, true);
});
test("malformed names/descriptions/IDs and normalization expansion are rejected before template writes", (t) => {
  const s = setup(t),
    r = request(s);
  for (const patch of [
    { name: "" },
    { name: "x".repeat(121) },
    { name: "bad\nname" },
    { name: "\ud800" },
    { name: "\u0344".repeat(120) },
    { description: "x".repeat(2001) },
    { description: "bad\u0000value" },
    { id: "bad" },
    { expectedGeneration: 1.5 },
  ])
    assert.throws(() => s.templates.save(s.p.id, { ...r, ...patch }));
  assert.equal(s.templates.list().filter((t) => !t.builtin).length, 0);
});
test("capture and clone failures roll back metadata, blobs, journal and managed directories", (t) => {
  const s = setup(t),
    before = evidence(s);
  s.store.db.exec(
    "CREATE TRIGGER fail_template_journal BEFORE INSERT ON template_ops BEGIN SELECT RAISE(ABORT,'synthetic journal failure'); END;",
  );
  assert.throws(() => save(s), /synthetic journal/);
  assert.equal(s.templates.list().filter((t) => !t.builtin).length, 0);
  assert.deepEqual(evidence(s), before);
  const dirs = fs.readdirSync(path.join(s.root, "projects"));
  assert.throws(() => use(s, "builtin-article"), /synthetic journal/);
  assert.deepEqual(fs.readdirSync(path.join(s.root, "projects")), dirs);
  assert.equal(s.store.list().length, 1);
  assert.equal(
    (s.store.db.prepare("SELECT count(*) n FROM template_ops").get() as any).n,
    0,
  );
});
test("corrupt immutable manifests and missing/changed source blobs reject use instead of overwriting a project", (t) => {
  const s = setup(t),
    v = save(s),
    entry = v.entries.find((f) => f.path === "custom.sty")!,
    before = s.store.list().length;
  s.store.db
    .prepare("UPDATE history_blobs SET content=? WHERE hash=?")
    .run(Buffer.from("Corrupt"), entry.hash);
  assert.throws(() => use(s, v.id), /blob/);
  assert.throws(() => s.templates.file(v.id, "custom.sty"), /blob/);
  assert.equal(s.store.list().length, before);
  const payload = JSON.parse(
    (
      s.store.db
        .prepare("SELECT payload FROM templates WHERE id=?")
        .get(v.id) as any
    ).payload,
  );
  payload.files[0].path = "../escape.tex";
  const raw = JSON.stringify(payload);
  s.store.db
    .prepare("UPDATE templates SET payload=?,hash=? WHERE id=?")
    .run(raw, createHash("sha256").update(raw).digest("hex"), v.id);
  assert.throws(() => s.templates.get(v.id), /path/);
});
test("template caps reject oversized snapshots and retain recoverable metadata at library bounds", (t) => {
  const s = setup(t),
    v = save(s),
    row = s.store.db
      .prepare("SELECT * FROM templates WHERE id=?")
      .get(v.id) as any;
  for (let i = 1; i < 100; i++)
    s.store.db
      .prepare("INSERT INTO templates VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        "Template " + i,
        "template " + i,
        "",
        row.payload,
        row.hash,
        0,
        row.created,
        row.updated,
        null,
      );
  assert.throws(() => save(s, "Over capacity"), /100 active/);
  s.store.db.prepare("UPDATE templates SET deletedAt=?").run(row.created);
  for (let i = 100; i < 500; i++)
    s.store.db
      .prepare("INSERT INTO templates VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        "Removed " + i,
        "removed " + i,
        "",
        row.payload,
        row.hash,
        0,
        row.created,
        row.updated,
        row.created,
      );
  assert.throws(() => save(s, "Retention capacity"), /500 retained/);
  assert.equal(
    s.templates.change(v.id, {
      id: randomUUID(),
      action: "restore",
      expectedRevision: 0,
    }).template.deletedAt,
    null,
  );
  s.store.db
    .prepare(
      "INSERT INTO files(project,path,revision,kind,content,deleted) VALUES(?,'huge.bin',0,'binary',zeroblob(?),0)",
    )
    .run(s.p.id, 100 * 1024 * 1024 + 1);
  assert.throws(() => s.templates.preview(s.p.id), /100 MiB/);
});
test("entry-count limit is checked before reading source blobs", (t) => {
  const s = setup(t);
  const insert = s.store.db.prepare(
    "INSERT INTO files(project,path,revision,kind,content,deleted) VALUES(?,?,0,'text',x'25',0)",
  );
  s.store.transaction(() => {
    for (let i = 0; i < 5000; i++) insert.run(s.p.id, "extra/" + i + ".tex");
  });
  assert.throws(() => s.templates.preview(s.p.id), /5,000 entries/);
});
test("template preview compilation uses a frozen preview scope, has bounded concurrency, and never changes projects", (t) => {
  const s = setup(t),
    v = save(s),
    before = evidence(s),
    calls: any[] = [];
  s.compiler.startSnapshot = (settings, files, clean, preview) => {
    calls.push({ settings, files, clean, preview });
    const job = {
      id: randomUUID(),
      projectId: settings.projectId,
      generation: settings.generation,
      root: settings.root,
      engine: settings.engine,
      preview,
      status: "running",
      diagnostics: [],
      log: "",
      pdf: false,
      started: new Date().toISOString(),
    } as CompileJob;
    s.compiler.jobs.set(job.id, job);
    return job;
  };
  const args = {
    hash: v.hash,
    expectedRevision: v.revision,
    root: v.root,
    engine: v.engine,
  };
  s.store.projectLocks.set(s.p.id, "active-source-run");
  const j = s.templates.compile(v.id, args);
  assert.equal(j.preview, true);
  assert.equal(j.projectId, "template:" + v.id);
  assert.deepEqual(calls[0].files, s.store.exportFiles(s.p.id));
  assert.equal(s.compiler.list(s.p.id).length, 0);
  assert.equal(s.compiler.latestPdf(s.p.id), null);
  assert.deepEqual(evidence(s), before);
  const other = s.templates.get("builtin-article");
  s.templates.compile(other.id, {
    hash: other.hash,
    expectedRevision: 1,
    root: other.root,
    engine: other.engine,
  });
  assert.throws(
    () =>
      s.templates.compile("builtin-report", {
        hash: s.templates.get("builtin-report").hash,
        expectedRevision: 1,
        root: "report.tex",
        engine: "pdflatex",
      }),
    /Two template previews/,
  );
  assert.throws(
    () => s.templates.compile("builtin-blank", {}),
    /blank starter/,
  );
  s.store.projectLocks.clear();
  for (const job of s.compiler.jobs.values()) job.status = "cancelled";
});
test("frozen compiler validates entry paths and snapshot layout before any process starts", (t) => {
  const s = setup(t),
    source = {
      projectId: "template:synthetic",
      generation: 0,
      root: "../escape.tex",
      engine: "pdflatex" as const,
    };
  assert.throws(() => s.compiler.startSnapshot(source, []), /path/);
  assert.throws(
    () =>
      s.compiler.startSnapshot({ ...source, root: "main.tex" }, [
        { path: "../escape.tex", data: Buffer.from("x") },
      ]),
    /path/,
  );
  assert.throws(
    () =>
      s.compiler.startSnapshot({ ...source, root: "main.tex" }, [
        { path: "other.tex", data: Buffer.from("x") },
      ]),
    /main .tex/,
  );
  assert.equal(s.compiler.processes.size, 0);
});
test("template APIs enforce local origins, expose metadata only, and preserve scoped source through save/create/export", async (t) => {
  const root = path.resolve("data/verification/templates-api-" + randomUUID()),
    env = await createApp(root, { seed: false, dist: "/nonexistent" });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const { app, store } = env,
    p = store.create("API source", [
      {
        path: "main.tex",
        data: Buffer.from(
          "\\documentclass{article}\n\\begin{document}Synthetic.\\end{document}",
        ),
      },
    ]),
    headers = { host: "127.0.0.1:4317", "x-prism-request": "1" },
    url = `/api/projects/${p.id}/templates`,
    preview = env.templates.preview(p.id),
    payload = {
      id: randomUUID(),
      name: "API snapshot",
      description: "Private local template",
      expectedGeneration: preview.generation,
      hash: preview.hash,
    };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { ...headers, origin: "https://untrusted.example" },
        payload,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { host: "127.0.0.1:4317" },
        payload,
      })
    ).statusCode,
    403,
  );
  const saved = await app.inject({ method: "POST", url, headers, payload });
  assert.equal(saved.statusCode, 200);
  assert.equal(
    (await app.inject({ method: "POST", url, headers, payload })).json()
      .replayed,
    true,
  );
  const v = saved.json().template,
    listed = await app.inject({
      method: "GET",
      url: "/api/templates",
      headers,
    });
  assert.equal(listed.statusCode, 200);
  assert.ok(
    listed.json().every((v: any) => !("payload" in v) && !("entries" in v)),
  );
  const source = await app.inject({
    method: "GET",
    url: `/api/templates/${v.id}/file?path=main.tex`,
    headers,
  });
  assert.match(source.json().content, /Synthetic/);
  const exported = await app.inject({
    method: "GET",
    url: `/api/templates/${v.id}/export`,
    headers,
  });
  assert.equal(exported.statusCode, 200);
  assert.equal((await readZip(exported.rawPayload))[0].path, "main.tex");
  const created = await app.inject({
    method: "POST",
    url: `/api/templates/${v.id}/projects`,
    headers,
    payload: {
      id: randomUUID(),
      name: "New from template",
      hash: v.hash,
      expectedRevision: v.revision,
      root: v.root,
      engine: v.engine,
    },
  });
  assert.equal(created.statusCode, 200);
  assert.notEqual(created.json().project.id, p.id);
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/templates/missing",
        headers,
      })
    ).statusCode,
    404,
  );
});
test("partial metadata renames preserve the description and replay without overwriting later detail edits", (t) => {
  const s = setup(t),
    v = save(s),
    rename = {
      id: randomUUID(),
      action: "rename",
      name: "Renamed only",
      expectedRevision: 0,
    };
  const renamed = s.templates.change(v.id, rename).template;
  assert.equal(renamed.description, v.description);
  s.templates.change(v.id, {
    id: randomUUID(),
    action: "rename",
    name: "Later name",
    description: "Later description",
    expectedRevision: renamed.revision,
  });
  assert.equal(
    s.templates.change(v.id, rename).template.description,
    "Later description",
  );
});
test("interrupted preview metadata is recovered on restart without starting another compilation", (t) => {
  const s = setup(t),
    id = randomUUID(),
    dir = path.join(s.root, "builds", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "job.json"),
    JSON.stringify({
      id,
      projectId: "template:builtin-article",
      generation: 1,
      root: "main.tex",
      engine: "pdflatex",
      preview: true,
      status: "running",
      log: "Synthetic interrupted preview.",
      pdf: false,
      diagnostics: [],
      started: new Date().toISOString(),
    }),
  );
  s.restart();
  assert.equal(s.compiler.jobs.get(id)?.status, "failed");
  assert.match(s.compiler.jobs.get(id)!.log, /interrupted by server restart/);
  assert.equal(s.compiler.processes.size, 0);
  assert.equal(s.compiler.list("template:builtin-article").length, 0);
});
