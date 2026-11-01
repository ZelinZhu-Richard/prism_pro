import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { planReferenceUpdates } from "../server/latex-references";
import { Store } from "../server/store";
import { FileMoves } from "../server/file-moves";
import { createApp } from "../server/app";
const plan = (
  content: string,
  files: string[],
  moves = [{ from: "parts", to: "archive/parts" }],
  name = "main.tex",
) =>
  planReferenceUpdates(
    "fixture",
    1,
    moves,
    [{ path: name, revision: 0, content }],
    [name, ...files],
  );

test("literal inputs preserve comments, Unicode, spacing, optional extensions and CRLF bytes", () => {
  const before =
    "% \\input{parts/café}\r\n\\input { ./parts/café }\r\n\\include{parts/café.tex}\r\n\\input parts/café.tex\r\n";
  const result = plan(before, ["parts/café.tex"]);
  assert.equal(
    result.changes[0].after,
    "% \\input{parts/café}\r\n\\input { ./archive/parts/café }\r\n\\include{archive/parts/café.tex}\r\n\\input archive/parts/café.tex\r\n",
  );
  assert.equal(result.review.files[0].changes, 3);
  assert.equal(before.includes("archive"), false);
});
test("literal graphics search paths move together without rewriting valid image basenames", () => {
  const before = String.raw`\graphicspath{{parts/}{unrelated/}}
\includegraphics[width=.3\linewidth]{sample}
\includegraphics{parts/sample.png}`;
  const result = plan(before, ["parts/sample.png"]);
  assert.equal(
    result.changes[0].after,
    String.raw`\graphicspath{{archive/parts/}{unrelated/}}
\includegraphics[width=.3\linewidth]{sample}
\includegraphics{archive/parts/sample.png}`,
  );
});
test("an individually moved figure uses an explicit literal path and keeps quoted spaces and extension style", () => {
  const content = String.raw`\graphicspath{{parts/}}
\includegraphics[width={.3\linewidth}]{"parts/plot one.png"}
\includegraphics{plot one}`;
  const result = plan(
    content,
    ["parts/plot one.png"],
    [{ from: "parts/plot one.png", to: "archive/plot two.png" }],
  );
  assert.equal(
    result.changes[0].after,
    String.raw`\graphicspath{{parts/}}
\includegraphics[width={.3\linewidth}]{"archive/plot two.png"}
\includegraphics{archive/plot two}`,
  );
});
test("bibliography lists, biblatex resources and local package/class references preserve syntax", () => {
  const content = String.raw`\bibliography{parts/refs, unrelated}
\addbibresource[location=local]{parts/refs.bib}
\usepackage[option]{parts/custom,graphicx}
\documentclass{parts/article}
\bibliographystyle{parts/style}`;
  const result = plan(content, [
    "parts/refs.bib",
    "parts/custom.sty",
    "parts/article.cls",
    "parts/style.bst",
  ]);
  assert.equal(
    result.changes[0].after,
    content.replaceAll("parts/", "archive/parts/"),
  );
  assert.equal(result.changes[0].changes, 5);
});
test("macro bodies, inline/verbatim examples, comments and dynamic references are not rewritten", () => {
  const before = String.raw`\newcommand{\example}[1]{\input{parts/a}}
\renewcommand{\example}[1]{\input{parts/a}}
\renewenvironment{example}{\input{parts/a}}{\input{parts/a}}
\NewDocumentCommand{\exampletwo}{m}{\includegraphics{parts/a}}
\def\examplethree#1{\input{parts/a}}
\verb|\input{parts/a}|
\string\input{parts/a}
\detokenize{\input{parts/a}}
\mintinline{tex}|\input{parts/a}|
\begin{verbatim}
\input{parts/a}
\end{verbatim}
% \input{parts/a}
\\input{parts/a}
\input{\directory/a}
\input{parts/a}`;
  const result = plan(before, ["parts/a.tex"]);
  assert.equal(
    result.changes[0].after,
    before.slice(0, before.lastIndexOf("parts/a")) +
      "archive/parts/a" +
      before.slice(before.lastIndexOf("parts/a") + 7),
  );
  assert.equal(result.changes[0].changes, 1);
  assert.ok(
    result.review.warnings.some((w) =>
      w.message.includes("command definitions"),
    ),
  );
  assert.ok(result.review.warnings.some((w) => w.message.includes("Dynamic")));
});
test("ambiguous graphics, dynamic search paths and import-relative source stay explicit manual work", () => {
  const ambiguous = plan(String.raw`\includegraphics{parts/image}`, [
    "parts/image.png",
    "parts/image.pdf",
  ]);
  assert.equal(ambiguous.changes.length, 0);
  assert.match(ambiguous.review.warnings[0].message, /Ambiguous/);
  const dynamic = plan(
    String.raw`\graphicspath{{\figures/}}\includegraphics{parts/image.png}`,
    ["parts/image.png"],
  );
  assert.equal(dynamic.changes.length, 0);
  assert.ok(dynamic.review.warnings.length);
  const imported = planReferenceUpdates(
    "p",
    1,
    [{ from: "parts", to: "archive/parts" }],
    [
      {
        path: "main.tex",
        revision: 0,
        content: String.raw`\import{nested/}{paper.tex}`,
      },
      {
        path: "nested/paper.tex",
        revision: 0,
        content: String.raw`\input{parts/a}`,
      },
    ],
    ["main.tex", "nested/paper.tex", "parts/a.tex"],
  );
  assert.equal(imported.changes.length, 0);
  assert.ok(
    imported.review.warnings.some((w) => w.path === "nested/paper.tex"),
  );
});
test("reference tokens bind project, generation, mappings and exact source; long invalid groups remain bounded", () => {
  const base = plan(String.raw`\input{parts/a}`, ["parts/a.tex"]);
  assert.equal(
    base.review.token,
    plan(String.raw`\input{parts/a}`, ["parts/a.tex"]).review.token,
  );
  assert.notEqual(
    base.review.token,
    plan(String.raw`\input{parts/a} `, ["parts/a.tex"]).review.token,
  );
  const literal = plan(
    String.raw`\input{../outside}\input{https://example.invalid/a}\input{parts-other/a}`,
    ["parts/a.tex", "parts-other/a.tex"],
  );
  assert.equal(literal.changes.length, 0);
  const complex = plan("\\input{".repeat(10000), ["parts/a.tex"]);
  assert.match(complex.review.unavailable!, /complex/);
  assert.equal(
    plan(String.raw`\constructor{parts/a}\toString{parts/a}`, ["parts/a.tex"])
      .changes.length,
    0,
  );
  assert.match(
    plan(
      String.raw`\graphicspath{{parts/}}\includegraphics{sample}`,
      ["parts/sample.png"],
      [{ from: "parts", to: "archive#bad/parts" }],
    ).review.unavailable!,
    /escaping/,
  );
  const comma = plan(
    String.raw`\bibliography{parts/refs}`,
    ["parts/refs.bib"],
    [{ from: "parts/refs.bib", to: "archive/ref,notes.bib" }],
  );
  assert.equal(comma.changes.length, 0);
  assert.match(comma.review.warnings[0].message, /comma/);
  assert.equal(
    plan(String.raw`\IfFileExists{parts/a}{\input{parts/a}}{}`, ["parts/a.tex"])
      .changes[0].changes,
    2,
  );
  const limited = planReferenceUpdates(
    "p",
    1,
    [{ from: "parts", to: "archive/parts" }],
    [{ path: "main.tex", revision: 0, content: String.raw`\input{parts/a}` }],
    ["main.tex", "parts/a.tex"],
    { diffMaxEditLength: 0 },
  );
  assert.match(limited.review.unavailable!, /computation limit/);
  assert.match(
    plan(
      "\\graphicspath{" +
        Array.from({ length: 257 }, (_, i) => `{dir${i}/}`).join("") +
        "}",
      ["parts/a.tex"],
    ).review.unavailable!,
    /Too many graphics/,
  );
});
function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-reference-move-")),
    store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = store.create("Reference edits · synthetic", [
    {
      path: "main.tex",
      data: Buffer.from(
        "\\documentclass{article}\n\\begin{document}\n\\input{parts/a}\n\\end{document}\n",
      ),
    },
    {
      path: "parts/a.tex",
      data: Buffer.from("A café example.\\input{parts/b}\n"),
    },
    { path: "parts/b.tex", data: Buffer.from("Exact nested bytes.\n") },
    { path: "notes.txt", data: Buffer.from("Unrelated\n") },
    { path: "archive", directory: true, data: Buffer.alloc(0) },
  ]);
  const moves = new FileMoves(store);
  const request = () => {
    const preview = moves.preview(project.id, {
      paths: ["parts"],
      destination: "archive",
    });
    return {
      paths: ["parts"],
      destination: "archive",
      generation: preview.generation,
      requestId: randomUUID(),
      updateReferences: true,
      referenceToken: preview.references!.token,
    };
  };
  return { root, store, project, moves, request };
}
test("review is read-only; one transaction edits moved and unmoved references, and Undo recovers exact bytes", (t) => {
  const { store, project, moves, request } = fixture(t),
    before = store.exportFiles(project.id),
    history = store.checkpoints(project.id);
  const input = request();
  assert.deepEqual(store.exportFiles(project.id), before);
  assert.deepEqual(store.checkpoints(project.id), history);
  const result = moves.apply(project.id, input);
  assert.deepEqual(result.changedFiles, ["main.tex", "archive/parts/a.tex"]);
  assert.match(
    store.readText(project.id, "main.tex").content,
    /input\{archive\/parts\/a\}/,
  );
  assert.match(
    store.readText(project.id, "archive/parts/a.tex").content,
    /input\{archive\/parts\/b\}/,
  );
  for (const name of result.changedFiles!)
    assert.equal(
      fs.readFileSync(path.join(store.projectDir(project.id), name), "utf8"),
      store.readText(project.id, name).content,
    );
  assert.equal(moves.apply(project.id, input).replayed, true);
  moves.undo(project.id, result.operationId);
  assert.deepEqual(store.exportFiles(project.id), before);
});
test("declining reference edits only moves paths; missing tokens and stale review reject before mutation", (t) => {
  const { store, project, moves, request } = fixture(t),
    before = store.exportFiles(project.id),
    input = request();
  assert.throws(
    () => moves.apply(project.id, { ...input, referenceToken: undefined }),
    /proposal changed/,
  );
  assert.deepEqual(store.exportFiles(project.id), before);
  const note = store.readText(project.id, "notes.txt");
  store.save(project.id, note.path, "Later", note.revision);
  assert.throws(() => moves.apply(project.id, input), /project changed/);
  const result = moves.apply(project.id, {
    ...request(),
    updateReferences: false,
  });
  assert.equal(
    store.readText(project.id, "main.tex").content,
    before.find((f) => f.path === "main.tex")!.data.toString(),
  );
  moves.undo(project.id, result.operationId);
});
test("a later edit to an unmoved reference file rejects the entire location/source Undo", (t) => {
  const { store, project, moves, request } = fixture(t),
    result = moves.apply(project.id, request());
  const current = store.readText(project.id, "main.tex");
  store.save(
    project.id,
    current.path,
    current.content + "% Later\n",
    current.revision,
  );
  const before = store.exportFiles(project.id);
  assert.equal(moves.list(project.id)[0].undoable, false);
  assert.throws(
    () => moves.undo(project.id, result.operationId),
    /reference file changed/,
  );
  assert.deepEqual(store.exportFiles(project.id), before);
});
test("sequential source-aware move/rename Undo restores trusted earlier revisions and unrelated edits", (t) => {
  const { store, project, moves, request } = fixture(t),
    before = store.exportFiles(project.id),
    first = moves.apply(project.id, request());
  const preview = moves.previewRename(
    project.id,
    "archive/parts/a.tex",
    "archive/parts/renamed.tex",
  );
  const second = moves.renameResult(
    project.id,
    "archive/parts/a.tex",
    "archive/parts/renamed.tex",
    {
      generation: preview.generation,
      requestId: randomUUID(),
      updateReferences: true,
      referenceToken: preview.references!.token,
    },
  );
  moves.undo(project.id, second.operationId);
  assert.equal(
    moves.list(project.id).find((m) => m.id === first.operationId)?.undoable,
    true,
  );
  const note = store.readText(project.id, "notes.txt");
  store.save(project.id, note.path, "Later unrelated", note.revision);
  moves.undo(project.id, first.operationId);
  for (const f of before.filter((f) => f.path !== "notes.txt"))
    assert.deepEqual(store.file(project.id, f.path).content, f.data);
  assert.equal(
    store.readText(project.id, "notes.txt").content,
    "Later unrelated",
  );
});
test("a stage swap failure rolls back reference bytes and path metadata together", (t) => {
  const { store, project, moves, request } = fixture(t),
    before = store.exportFiles(project.id),
    rename = fs.renameSync;
  fs.renameSync = ((from, to) => {
    if (
      String(from).includes("/file-stage-") &&
      String(to) === store.projectDir(project.id)
    )
      throw new Error("Injected reference swap failure");
    return rename(from, to);
  }) as typeof rename;
  try {
    assert.throws(() => moves.apply(project.id, request()), /Injected/);
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(store.exportFiles(project.id), before);
  for (const f of before.filter((f) => !f.directory))
    assert.deepEqual(
      fs.readFileSync(path.join(store.projectDir(project.id), f.path)),
      f.data,
    );
  assert.deepEqual(moves.list(project.id), []);
});
test("external edits to a reference file outside the moved folder cannot be overwritten", (t) => {
  const { store, project, moves, request } = fixture(t);
  fs.writeFileSync(
    path.join(store.projectDir(project.id), "main.tex"),
    "Keep external bytes.",
  );
  assert.throws(
    () => moves.apply(project.id, request()),
    /reference file changed on disk/,
  );
  assert.equal(
    fs.readFileSync(
      path.join(store.projectDir(project.id), "main.tex"),
      "utf8",
    ),
    "Keep external bytes.",
  );
  assert.ok(store.file(project.id, "parts/a.tex"));
});
test("reference proposals and exact Undo survive real backend restart through the APIs", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-reference-api-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let server = await createApp(root, { seed: false });
  const p = server.store.create("API references", [
    { path: "main.tex", data: Buffer.from("\\input{a}") },
    { path: "a.tex", data: Buffer.from("Exact") },
    { path: "dest", directory: true, data: Buffer.alloc(0) },
  ]);
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const preview = await server.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/file-moves/rename/preview`,
    headers,
    payload: { from: "a.tex", to: "dest/new.tex" },
  });
  assert.equal(preview.statusCode, 200);
  const payload = {
    from: "a.tex",
    to: "dest/new.tex",
    requestId: randomUUID(),
    generation: p.generation,
    updateReferences: true,
    referenceToken: preview.json().references.token,
  };
  const result = await server.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/file-moves/rename`,
    headers,
    payload,
  });
  assert.equal(result.statusCode, 200);
  await server.app.close();
  server = await createApp(root, { seed: false });
  t.after(() => server.app.close());
  const replay = await server.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/file-moves/rename`,
    headers,
    payload,
  });
  assert.equal(replay.json().replayed, true);
  assert.equal(
    server.store.readText(p.id, "main.tex").content,
    "\\input{dest/new}",
  );
  const undo = await server.app.inject({
    method: "POST",
    url: `/api/projects/${p.id}/file-moves/${payload.requestId}/undo`,
    headers,
    payload: {},
  });
  assert.equal(undo.statusCode, 200);
  assert.equal(server.store.readText(p.id, "main.tex").content, "\\input{a}");
});
test("old move-only request signatures retain retry and Undo compatibility after upgrade", (t) => {
  const { store, project, moves, request } = fixture(t),
    input = { ...request(), updateReferences: false },
    result = moves.apply(project.id, input);
  const row = store.db
      .prepare("SELECT payload FROM file_moves WHERE id=?")
      .get(result.operationId) as any,
    payload = JSON.parse(row.payload),
    old = JSON.parse(payload.request);
  delete old.updateReferences;
  delete old.referenceToken;
  payload.request = JSON.stringify(old);
  delete payload.references;
  store.db
    .prepare("UPDATE file_moves SET payload=? WHERE id=?")
    .run(JSON.stringify(payload), result.operationId);
  assert.equal(moves.apply(project.id, input).replayed, true);
  moves.undo(project.id, result.operationId);
  assert.ok(store.file(project.id, "parts/a.tex"));
});
for (const phase of ["before-new-tree", "after-new-tree", "after-commit"])
  test(`source and paths recover together after interruption ${phase}`, (t) => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prism-reference-crash-"),
    );
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "tests/fixtures/file-reference-crash.ts",
        root,
        phase,
      ],
      { encoding: "utf8" },
    );
    assert.equal(child.status, 91, child.stderr);
    const { id } = JSON.parse(
        fs.readFileSync(path.join(root, "fixture.json"), "utf8"),
      ),
      store = new Store(root);
    t.after(() => store.close());
    const base = phase === "after-commit" ? "archive/parts" : "parts";
    assert.equal(
      store.readText(id, "main.tex").content,
      `\\documentclass{article}\n\\input{${base}/a}\n`,
    );
    assert.equal(
      store.readText(id, base + "/a.tex").content,
      "Exact section bytes.\n",
    );
    assert.equal(
      fs.readFileSync(path.join(store.projectDir(id), "main.tex"), "utf8"),
      store.readText(id, "main.tex").content,
    );
    if (phase === "after-commit") {
      const moves = new FileMoves(store);
      moves.undo(id, moves.list(id)[0].id);
      assert.match(store.readText(id, "main.tex").content, /input\{parts\/a\}/);
    }
  });
