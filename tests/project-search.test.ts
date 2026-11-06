import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectSearch } from "../server/project-search";
import { Store } from "../server/store";
import { createApp } from "../server/app";

function fixture(
  t: any,
  files = [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\r\nCafé cat Cat cats. 😀 cat\n\\input{sections/intro}\n",
      ),
    },
    {
      path: "sections/intro.tex",
      data: Buffer.from("A cat and a CAT.\nA café, 猫, and cat_1.\n"),
    },
    { path: "refs.bib", data: Buffer.from("@article{cat, title={A cat}}") },
    { path: "assets/image.bin", data: Buffer.from([0, 5, 255, 9]) },
  ],
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-search-"));
  const store = new Store(root),
    search = new ProjectSearch(store);
  t.after(async () => {
    await search.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic search", files);
  return { root, store, search, p };
}
const sources = (store: Store, id: string) =>
  store
    .exportFiles(id)
    .map((f) => ({ path: f.path, data: f.data.toString("base64") }));

test("project content search groups Unicode/CRLF matches by file with exact CodeMirror offsets", async (t) => {
  const { search, store, p } = fixture(t);
  const before = sources(store, p.id),
    checkpoints = store.checkpoints(p.id).length;
  const result = await search.search(p.id, { query: "cat" });
  assert.equal(result.total, 9);
  assert.deepEqual(
    result.files.map((f) => f.path),
    ["main.tex", "refs.bib", "sections/intro.tex"],
  );
  const main = result.files[0];
  const text = store.readText(p.id, main.path).content;
  assert.equal(main.matches[0].line, 2);
  assert.equal(main.matches[0].column, 6);
  for (const file of result.files)
    for (const match of file.matches)
      assert.equal(
        store
          .readText(p.id, file.path)
          .content.slice(match.from, match.to)
          .toLowerCase(),
        "cat",
      );
  assert.equal(
    text.slice(main.matches.at(-1)!.from, main.matches.at(-1)!.to),
    "cat",
  );
  assert.deepEqual(sources(store, p.id), before);
  assert.equal(store.checkpoints(p.id).length, checkpoints);
  assert.equal(store.project(p.id).generation, 0);
});

test("search supports case, Unicode word boundaries, glob inclusion/exclusion, and literal LaTeX", async (t) => {
  const { search, p } = fixture(t);
  assert.equal(
    (await search.search(p.id, { query: "cat", wholeWord: true })).total,
    7,
  );
  assert.equal(
    (
      await search.search(p.id, {
        query: "cat",
        caseSensitive: true,
        include: "**/*.tex",
        exclude: "sections/**",
      })
    ).total,
    3,
  );
  assert.deepEqual(
    (await search.search(p.id, { query: "Café", wholeWord: true })).files.map(
      (f) => f.path,
    ),
    ["main.tex", "sections/intro.tex"],
  );
  assert.equal(
    (
      await search.search(p.id, {
        query: "猫",
        wholeWord: true,
        include: "sections/?????.tex",
      })
    ).total,
    1,
  );
  assert.equal(
    (await search.search(p.id, { query: "\\input{sections/intro}" })).total,
    1,
  );
  assert.equal(
    (await search.search(p.id, { query: "cat", include: "*.bib, sections/**" }))
      .total,
    5,
  );
});

test("multiline regex and zero-width matches keep Unicode code points intact", async (t) => {
  const { search, store, p } = fixture(t, [
    { path: "main.tex", data: Buffer.from("a😀b\nsecond line") },
  ]);
  const result = await search.search(p.id, {
    query: "b\\nsecond",
    regex: true,
  });
  assert.equal(result.total, 1);
  assert.equal(result.files[0].matches[0].line, 1);
  const preview = await search.preview(p.id, {
    query: "(?=.)",
    regex: true,
    replacement: "_",
    include: "main.tex",
  });
  search.apply(p.id, preview.id, ["main.tex"]);
  assert.equal(
    store.readText(p.id, "main.tex").content,
    "_a_😀_b\n_s_e_c_o_n_d_ _l_i_n_e",
  );
  search.apply(p.id, preview.id, undefined, true);
  assert.equal(store.readText(p.id, "main.tex").content, "a😀b\nsecond line");
});

test("clipped match snippets never split a surrogate pair", async (t) => {
  const { search, p } = fixture(t, [
    {
      path: "main.tex",
      data: Buffer.from(
        "😀".repeat(120) + "x" + "😀".repeat(60) + "\na" + "😀".repeat(100),
      ),
    },
  ]);
  const long = await search.search(p.id, { query: "a😀+", regex: true });
  assert.equal(long.files[0].matches[0].clipped, true);
  const short = await search.search(p.id, { query: "x" });
  for (const match of [...long.files[0].matches, ...short.files[0].matches])
    for (const text of [match.prefix, match.text, match.suffix])
      assert.equal(Buffer.from(text).toString(), text);
});

test("invalid queries and invalid regex return actionable errors without mutation", async (t) => {
  const { search, store, p } = fixture(t);
  for (const body of [
    {},
    { query: "" },
    { query: "a".repeat(2001) },
    { query: "a", include: [] },
    { query: "a", exclude: ",".repeat(10) },
  ])
    assert.throws(() => search.options(body), /query|patterns/);
  await assert.rejects(
    search.search(p.id, { query: "[", regex: true }),
    /regular expression/i,
  );
  await assert.rejects(
    search.preview(p.id, { query: "cat", replacement: null }),
    /Replacement text/,
  );
  assert.equal(store.project(p.id).generation, 0);
});

test("deleted, binary and oversized files are excluded with explicit size warnings", async (t) => {
  const { search, store, p } = fixture(t);
  store.trash(p.id, "refs.bib");
  store.add(p.id, "big.tex", Buffer.from("cat" + "x".repeat(2 * 1024 * 1024)));
  const result = await search.search(p.id, { query: "cat" });
  assert.equal(result.total, 7);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /big.tex.*2 MB/);
  assert.ok(
    !result.files.some((f) => f.path.endsWith(".bin") || f.path === "refs.bib"),
  );
});

test("non-UTF-8 source is reported and preserved without lossy search or replacement", async (t) => {
  const legacy = Buffer.concat([
    Buffer.from("cat caf"),
    Buffer.from([0xe9]),
    Buffer.from("\n"),
  ]);
  const { search, store, p } = fixture(t, [
    { path: "legacy.tex", data: legacy },
    { path: "main.tex", data: Buffer.from("cat") },
  ]);
  const result = await search.search(p.id, { query: "cat" });
  assert.equal(result.total, 1);
  assert.deepEqual(
    result.files.map((f) => f.path),
    ["main.tex"],
  );
  assert.match(result.warnings[0], /legacy.tex.*not valid UTF-8/);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  assert.equal(preview.warnings.length, 1);
  search.apply(p.id, preview.id, ["main.tex"]);
  assert.deepEqual(store.file(p.id, "legacy.tex").content, legacy);
  search.apply(p.id, preview.id, undefined, true);
  assert.deepEqual(store.file(p.id, "legacy.tex").content, legacy);
});

test("bounded search results do not silently truncate a replacement preview", async (t) => {
  const { search, store, p } = fixture(t, [
    { path: "main.tex", data: Buffer.from("a ".repeat(5001)) },
  ]);
  const found = await search.search(p.id, { query: "a" });
  assert.equal(found.total, 1000);
  assert.equal(found.truncated, true);
  await assert.rejects(
    search.preview(p.id, { query: "a", replacement: "b" }),
    /5,000/,
  );
  assert.equal(store.project(p.id).generation, 0);
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) n FROM replacements").get() as any).n,
    0,
  );
});

test("literal replacement preserves LaTeX backslashes, dollars and exact untouched bytes", async (t) => {
  const { search, store, p } = fixture(t);
  const before = sources(store, p.id),
    checkpoints = store.checkpoints(p.id).length;
  const replacement = "\\newcommand{\\foo}{$1 \\$ & $$}";
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement,
    caseSensitive: true,
  });
  assert.equal(preview.status, "pending");
  assert.equal(store.project(p.id).generation, 0);
  assert.equal(store.checkpoints(p.id).length, checkpoints);
  assert.deepEqual(sources(store, p.id), before);
  assert.ok(!JSON.stringify(preview).includes("\\\\documentclass"));
  const expected = store
    .readText(p.id, "main.tex")
    .content.split("cat")
    .join(replacement);
  const changed = search.apply(p.id, preview.id, ["main.tex"]);
  assert.equal(changed.status, "applied");
  assert.deepEqual(changed.selectedPaths, ["main.tex"]);
  assert.equal(store.readText(p.id, "main.tex").content, expected);
  assert.deepEqual(
    sources(store, p.id).filter((f) => f.path !== "main.tex"),
    before.filter((f) => f.path !== "main.tex"),
  );
  assert.equal(store.checkpoints(p.id).length, checkpoints + 2);
  search.apply(p.id, preview.id, undefined, true);
  assert.deepEqual(sources(store, p.id), before);
});

test("capture expansion is explicit and supports numbered/named groups and literal dollar signs", async (t) => {
  const { search, p } = fixture(t, [
    { path: "main.tex", data: Buffer.from("cat dog") },
  ]);
  const preview = await search.preview(p.id, {
    query: "(?<animal>cat) (dog)",
    regex: true,
    expand: true,
    replacement: "${animal} $<animal> $2 $1 $& $$ $99 $10",
  });
  assert.equal(
    search.file(p.id, preview.id, "main.tex").after,
    "${animal} cat dog cat cat dog $ $99 cat0",
  );
  const literal = await search.preview(p.id, {
    query: "(cat)",
    regex: true,
    replacement: "$1 $& $$",
  });
  assert.equal(search.file(p.id, literal.id, "main.tex").after, "$1 $& $$ dog");
});

test("no-op replacements produce no changed files and do not touch history", async (t) => {
  const { search, store, p } = fixture(t);
  const preview = await search.preview(p.id, {
    query: "cat",
    caseSensitive: true,
    replacement: "cat",
  });
  assert.equal(preview.total, 0);
  assert.deepEqual(preview.files, []);
  assert.equal(store.project(p.id).generation, 0);
  assert.equal(store.checkpoints(p.id).length, 1);
});

test("multi-file Apply and Undo are atomic, revision-checked and idempotent", async (t) => {
  const { search, store, p } = fixture(t);
  const before = sources(store, p.id);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "kitten",
  });
  const paths = preview.files.map((f) => f.path);
  search.apply(p.id, preview.id, paths);
  const applied = sources(store, p.id),
    generation = store.project(p.id).generation;
  search.apply(p.id, preview.id, paths);
  assert.equal(store.project(p.id).generation, generation);
  assert.deepEqual(sources(store, p.id), applied);
  const undone = search.apply(p.id, preview.id, undefined, true);
  assert.equal(undone.status, "undone");
  assert.deepEqual(sources(store, p.id), before);
  search.apply(p.id, preview.id, undefined, true);
  assert.deepEqual(sources(store, p.id), before);
  assert.throws(
    () => search.apply(p.id, preview.id, paths),
    /no longer available/,
  );
});

test("stale revisions, renamed/deleted files, and newer changes cancel the entire operation", async (t) => {
  const { search, store, p } = fixture(t);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  store.save(p.id, "sections/intro.tex", "Newer source", 0);
  const before = sources(store, p.id),
    checkpoints = store.checkpoints(p.id).length;
  assert.throws(
    () => search.apply(p.id, preview.id, ["main.tex", "sections/intro.tex"]),
    /changed/,
  );
  assert.deepEqual(sources(store, p.id), before);
  assert.equal(store.checkpoints(p.id).length, checkpoints);
  assert.equal(search.get(p.id, preview.id).status, "pending");
  search.apply(p.id, preview.id, ["main.tex"]);
  store.save(p.id, "main.tex", "Newer edited source", 1);
  assert.throws(
    () => search.apply(p.id, preview.id, undefined, true),
    /Undo was cancelled/,
  );
  assert.equal(store.readText(p.id, "main.tex").content, "Newer edited source");
  const deleted = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
    include: "*.bib",
  });
  store.trash(p.id, "refs.bib");
  assert.throws(
    () => search.apply(p.id, deleted.id, ["refs.bib"]),
    /not found/i,
  );
  const renamed = await search.preview(p.id, {
    query: "Newer",
    replacement: "Latest",
  });
  store.rename(p.id, "main.tex", "renamed.tex");
  assert.throws(
    () => search.apply(p.id, renamed.id, ["main.tex"]),
    /not found/i,
  );
});

test("an outside edit blocks reviewed Apply and Undo while keeping every other file exact", async (t) => {
  const { search, store, p } = fixture(t);
  const names = ["main.tex", "sections/intro.tex"];
  const target = path.join(store.projectDir(p.id), names[1]);
  const other = path.join(store.projectDir(p.id), names[0]);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  const original = fs.readFileSync(target, "utf8");
  function rejectExternalChange(
    expected: string,
    replacement: string,
    undo: boolean,
  ) {
    const outside = expected.replace(undo ? "dog" : "cat", replacement);
    assert.notEqual(outside, expected);
    assert.equal(Buffer.byteLength(outside), Buffer.byteLength(expected));
    const canonical = sources(store, p.id);
    const generation = store.project(p.id).generation;
    const history = store.checkpoints(p.id);
    const otherBytes = fs.readFileSync(other);
    fs.writeFileSync(target, outside);
    assert.throws(
      () => search.apply(p.id, preview.id, undo ? undefined : names, undo),
      /Disk files were preserved/,
    );
    assert.equal(fs.readFileSync(target, "utf8"), outside);
    assert.deepEqual(fs.readFileSync(other), otherBytes);
    assert.deepEqual(sources(store, p.id), canonical);
    assert.equal(store.project(p.id).generation, generation);
    assert.deepEqual(store.checkpoints(p.id), history);
    assert.equal(
      search.get(p.id, preview.id).status,
      undo ? "applied" : "pending",
    );
  }
  rejectExternalChange(original, "fox", false);
  fs.writeFileSync(target, original);
  search.apply(p.id, preview.id, names);
  rejectExternalChange(fs.readFileSync(target, "utf8"), "fox", true);
});

test("unrelated edits do not block a revision-valid selected file", async (t) => {
  const { search, store, p } = fixture(t);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  store.save(p.id, "refs.bib", "Keep newer bibliography", 0);
  search.apply(p.id, preview.id, ["main.tex", "sections/intro.tex"]);
  assert.equal(
    store.readText(p.id, "refs.bib").content,
    "Keep newer bibliography",
  );
  search.apply(p.id, preview.id, undefined, true);
  assert.equal(
    store.readText(p.id, "refs.bib").content,
    "Keep newer bibliography",
  );
});

test("a conflict in the last selected file prevents every part of multi-file Undo", async (t) => {
  const { search, store, p } = fixture(t);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  const paths = preview.files.map((f) => f.path);
  search.apply(p.id, preview.id, paths);
  const last = paths.at(-1)!,
    file = store.readText(p.id, last);
  store.save(p.id, last, file.content + "Newer work", file.revision);
  const before = sources(store, p.id),
    checkpoints = store.checkpoints(p.id).length;
  assert.throws(
    () => search.apply(p.id, preview.id, undefined, true),
    /Undo was cancelled/,
  );
  assert.deepEqual(sources(store, p.id), before);
  assert.equal(store.checkpoints(p.id).length, checkpoints);
  assert.equal(search.get(p.id, preview.id).status, "applied");
});

test("search worker concurrency and shutdown are bounded and recoverable", async (t) => {
  const { search, p } = fixture(t);
  const one = search.search(p.id, { query: "cat" });
  const two = search.search(p.id, { query: "café" });
  await assert.rejects(
    search.search(p.id, { query: "猫" }),
    /Two project searches/,
  );
  const results = await Promise.all([one, two]);
  assert.equal(results[0].total, 9);
  assert.equal(results[1].total, 2);
  const pending = search.search(p.id, { query: "cat" });
  const stopped = assert.rejects(pending, /interrupted|shutting down/);
  await search.close();
  await stopped;
  await assert.rejects(search.search(p.id, { query: "cat" }), /shutting down/);
});

test("invalid file selection and injected mid-write failures roll back files, metadata and checkpoints", async (t) => {
  const { search, store, p } = fixture(t);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  for (const paths of [
    null,
    [],
    ["main.tex", "main.tex"],
    [1],
    ["../outside.tex"],
    ["assets/image.bin"],
  ])
    assert.throws(
      () => search.apply(p.id, preview.id, paths),
      /distinct|previewed/,
    );
  const before = sources(store, p.id),
    count = store.checkpoints(p.id).length;
  const original = store.insert;
  let calls = 0;
  store.insert = function (...args) {
    if (++calls === 2) throw new Error("Injected write failure");
    return original.apply(this, args);
  };
  try {
    assert.throws(
      () => search.apply(p.id, preview.id, ["main.tex", "sections/intro.tex"]),
      /Injected/,
    );
  } finally {
    store.insert = original;
  }
  assert.deepEqual(sources(store, p.id), before);
  assert.equal(store.project(p.id).generation, 0);
  assert.equal(store.checkpoints(p.id).length, count);
  assert.equal(search.get(p.id, preview.id).status, "pending");
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) n FROM versions").get() as any).n,
    0,
  );
  search.apply(p.id, preview.id, ["main.tex", "sections/intro.tex"]);
});

test("search detects a changing source snapshot and regex timeouts keep the server responsive", async (t) => {
  const { search, store, p } = fixture(t);
  const pending = search.search(p.id, { query: "cat" });
  store.save(p.id, "main.tex", "New source", 0);
  await assert.rejects(pending, /project changed/);
  const limited = new ProjectSearch(store, 150);
  t.after(() => limited.close());
  store.add(p.id, "pathological.tex", Buffer.from("a".repeat(20000) + "!"));
  await assert.rejects(
    limited.search(p.id, {
      query: "(a+)+$",
      regex: true,
      include: "pathological.tex",
    }),
    /Search exceeded/,
  );
  assert.equal(
    (await search.search(p.id, { query: "New source", include: "main.tex" }))
      .total,
    1,
  );
});

test("replacement rejects UTF-8 output overflow and search requires narrowing oversized scopes", async (t) => {
  const { search, store, p } = fixture(t, [
    { path: "main.tex", data: Buffer.from("a".repeat(10)) },
  ]);
  await assert.rejects(
    search.preview(p.id, { query: "a", replacement: "😀".repeat(100000) }),
    /2 MB/,
  );
  for (let i = 0; i < 17; i++)
    store.add(p.id, `large${i}.tex`, Buffer.alloc(2 * 1024 * 1024, 120));
  await assert.rejects(search.search(p.id, { query: "a" }), /32 MB/);
  assert.equal(
    (await search.search(p.id, { query: "a", include: "main.tex" })).total,
    10,
  );
  assert.equal(store.readText(p.id, "main.tex").revision, 0);
});

test("AI locks and active draft states allow reads but reject Apply and Undo", async (t) => {
  const { search, store, p } = fixture(t);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  store.projectLocks.set(p.id, "synthetic-run");
  assert.equal((await search.search(p.id, { query: "cat" })).total, 9);
  assert.throws(() => search.apply(p.id, preview.id, ["main.tex"]), /reserved/);
  store.projectLocks.clear();
  store.locks.set(`${p.id}/sections/intro.tex`, "synthetic-run");
  assert.throws(() => search.apply(p.id, preview.id, ["main.tex"]), /reserved/);
  store.locks.clear();
  store.saveRun({
    id: "synthetic-run",
    projectId: p.id,
    status: "preview",
  } as any);
  assert.throws(
    () => search.apply(p.id, preview.id, ["main.tex"]),
    /active AI/,
  );
  store.saveRun({
    id: "synthetic-run",
    projectId: p.id,
    status: "completed",
  } as any);
  search.apply(p.id, preview.id, ["main.tex"]);
  store.projectLocks.set(p.id, "synthetic-run");
  assert.throws(
    () => search.apply(p.id, preview.id, undefined, true),
    /reserved/,
  );
});

test("replacement records and exact Undo survive an application restart", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-search-restart-"));
  let store = new Store(root),
    search = new ProjectSearch(store);
  t.after(async () => {
    await search.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic", [
    { path: "main.tex", data: Buffer.from("猫 cat 😀\r\n") },
  ]);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  search.apply(p.id, preview.id, ["main.tex"]);
  await search.close();
  store.close();
  store = new Store(root);
  search = new ProjectSearch(store);
  assert.equal(search.list(p.id)[0].status, "applied");
  search.apply(p.id, preview.id, undefined, true);
  assert.equal(store.readText(p.id, "main.tex").content, "猫 cat 😀\r\n");
  assert.equal(
    fs.readFileSync(path.join(store.projectDir(p.id), "main.tex"), "utf8"),
    "猫 cat 😀\r\n",
  );
});

test("project confinement rejects cross-project previews, trashed projects and filesystem symlinks", async (t) => {
  const { search, store, p, root } = fixture(t);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  const other = store.create("Other", [
    { path: "main.tex", data: Buffer.from("Private synthetic source") },
  ]);
  assert.throws(() => search.get(other.id, preview.id), /not found/);
  assert.throws(() => search.file(p.id, preview.id, "../outside"), /paths/);
  const outside = path.join(root, "outside.tex");
  fs.writeFileSync(outside, "Untouched synthetic source");
  const target = path.join(store.projectDir(p.id), "main.tex");
  fs.unlinkSync(target);
  fs.symlinkSync(outside, target);
  assert.throws(() => search.apply(p.id, preview.id, ["main.tex"]), /Symlinks/);
  assert.equal(fs.readFileSync(outside, "utf8"), "Untouched synthetic source");
  fs.unlinkSync(target);
  // Missing external files no longer authorize unconditional materialization.
  assert.throws(() => store.materializeFile(p.id, "main.tex"), /preserved/);
  fs.writeFileSync(target, store.file(p.id, "main.tex").content);
  store.trashProject(p.id);
  await assert.rejects(search.search(p.id, { query: "cat" }), /Trash/);
  assert.throws(() => search.get(p.id, preview.id), /Trash/);
});

test("old pending previews expire without deleting applied replacement history", async (t) => {
  const { search, store, p } = fixture(t);
  const preview = await search.preview(p.id, {
    query: "cat",
    replacement: "dog",
  });
  const row = store.db
    .prepare("SELECT payload FROM replacements WHERE id=?")
    .get(preview.id) as any;
  const payload = JSON.parse(row.payload);
  payload.created = "2000-01-01T00:00:00.000Z";
  store.db
    .prepare("UPDATE replacements SET payload=? WHERE id=?")
    .run(JSON.stringify(payload), preview.id);
  assert.throws(() => search.get(p.id, preview.id), /expired/);
  assert.equal(store.project(p.id).generation, 0);
});

test("local search APIs expose revision-bound previews, downloads, atomic Apply/Undo and origin protection", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-search-api-"));
  const { app, store } = await createApp(root, { seed: false });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic", [
    { path: "main.tex", data: Buffer.from("cat cat") },
    { path: "nested/note.tex", data: Buffer.from("cat") },
  ]);
  const base = `/api/projects/${p.id}`,
    headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const result = await app.inject({
    method: "POST",
    url: `${base}/search`,
    headers,
    payload: { query: "cat" },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().total, 3);
  const preview = (
    await app.inject({
      method: "POST",
      url: `${base}/replacements/preview`,
      headers,
      payload: { query: "cat", replacement: "dog" },
    })
  ).json();
  const download = await app.inject({
    method: "GET",
    url: `${base}/replacements/${preview.id}/download?path=main.tex&version=after`,
    headers,
  });
  assert.equal(download.body, "dog dog");
  assert.match(download.headers["content-disposition"]!, /attachment/);
  const applied = await app.inject({
    method: "POST",
    url: `${base}/replacements/${preview.id}/apply`,
    headers,
    payload: { paths: ["main.tex", "nested/note.tex"] },
  });
  assert.equal(applied.statusCode, 200);
  assert.equal(applied.json().status, "applied");
  const undone = await app.inject({
    method: "POST",
    url: `${base}/replacements/${preview.id}/undo`,
    headers,
    payload: {},
  });
  assert.equal(undone.statusCode, 200);
  assert.equal(store.readText(p.id, "main.tex").content, "cat cat");
  const denied = await app.inject({
    method: "POST",
    url: `${base}/search`,
    headers: { ...headers, origin: "https://example.com" },
    payload: { query: "cat" },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${base}/search`,
        headers: { host: "127.0.0.1:4317" },
        payload: { query: "cat" },
      })
    ).statusCode,
    403,
  );
});
