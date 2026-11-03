import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Store } from "../server/store";
import { SourceRecovery } from "../server/source-recovery";
import { SourceNavigation } from "../server/source-navigation";
import { createApp } from "../server/app";
import {
  sourceOccurrences,
  sourceSymbolAt,
  validSourceSymbol,
  SOURCE_OCCURRENCES,
  type SourceSymbol,
  type SourceNavigationRequest,
} from "../shared/source-navigation";
const source = String.raw`% Synthetic source only
\newcommand{\Value}[1]{#1}
\makeatletter\def\foo@bar#1{#1}\makeatother
\newenvironment{localbox}{}{}
\NewDocumentEnvironment{starbox}{m}{}{}
新 👩🏽‍💻 é \label{sec:one}
\Value{Exact arguments} \foo@bar{x}
\begin{localbox}See \cref{sec:one, sec:two}.\end{localbox}
\citep[\emph{see}][p. 4]{alpha, beta}
\bibitem[Author{\emph{X}}(2026)]{inline} An inline entry.
\entry{generated}{article}{}`;
const bib = String.raw`% @book{hidden,title={Hidden}}
@string{prefix="Local"}
@article{ alpha,
 title={Nested {title} @book{fake,title={Fake}}}, author={A. Writer}}
@book( beta, title="A quoted } title")
@comment{Nested @book{fake2,title={Fake}}}`;
function fixture(t: any) {
  const root = fs.mkdtempSync(
      path.resolve("data/verification/source-navigation-test-"),
    ),
    store = new Store(root),
    project = store.create("Synthetic source navigation", [
      { path: "main.tex", data: Buffer.from(source) },
      {
        path: "styles/local.sty",
        data: Buffer.from("\\newcommand{\\Value}[1]{#1}\n\\Value{x}\n"),
      },
      {
        path: "sections/method.tex",
        data: Buffer.from(
          "\\label{sec:two}\n\\Value{method}\n\\ref{sec:one}\\cite{alpha}\n",
        ),
      },
      { path: "refs.bib", data: Buffer.from(bib) },
      { path: "legacy.tex", data: Buffer.from([255, 254, 10]) },
      { path: "asset.bin", data: Buffer.from([0, 1, 2]) },
    ]),
    service = new SourceNavigation(store);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const snapshot = () =>
    JSON.stringify({
      project: store.project(project.id),
      files: store.exportFiles(project.id),
      history: store.checkpoints(project.id),
      versions: store.db.prepare("SELECT * FROM versions").all(),
      receipts: store.db.prepare("SELECT * FROM file_disk_state").all(),
    });
  return {
    root,
    store,
    project,
    service,
    snapshot,
    find: (
      kind: SourceSymbol["kind"],
      name: string,
      mode: SourceNavigationRequest["mode"] = "definitions",
      current?: SourceNavigationRequest["current"],
    ) => service.find(project.id, { kind, name, mode, current }),
  };
}
test("literal navigation retains exact Unicode command/environment/key spans and declaration/reference roles", () => {
  const result = sourceOccurrences({ path: "main.tex", content: source });
  assert.equal(result.limited, false);
  for (const location of result.occurrences) {
    assert.equal(
      source.slice(location.from, location.to),
      location.kind === "command" ? "\\" + location.name : location.name,
    );
    assert.equal(
      location.line,
      source.slice(0, location.from).split("\n").length,
    );
    assert.equal(
      location.column,
      location.from - source.lastIndexOf("\n", location.from - 1),
    );
    assert(location.preview.length <= 200);
  }
  const matches = (kind: string, name: string, role: string) =>
    result.occurrences.filter(
      (o) => o.kind === kind && o.name === name && o.role === role,
    );
  assert.equal(matches("command", "foo@bar", "definition").length, 1);
  assert.equal(matches("command", "foo@bar", "reference").length, 1);
  assert.equal(matches("environment", "localbox", "definition").length, 1);
  assert.equal(matches("environment", "localbox", "reference").length, 2);
  assert.equal(matches("environment", "starbox", "definition").length, 1);
  assert.equal(matches("label", "sec:one", "definition").length, 1);
  assert.equal(matches("label", "sec:two", "reference").length, 1);
  for (const name of ["alpha", "beta"])
    assert.equal(matches("citation", name, "reference").length, 1);
  for (const name of ["inline", "generated"])
    assert.equal(matches("citation", name, "definition").length, 1);
});
test("comments, escaped controls, inline/raw content and nested macro bodies are excluded rather than interpreted", () => {
  const content = String.raw`% \Value \label{fake}
\\Value \\\Value{real}
\verb|\Value \ref{fake}| \verb*+\Value+
\newcommand{\Outer}{\Value \label{fake}\newcommand{\Nested}{x}}
\begin{verbatim}\Value\label{fake}\end{verbatim}
\begin{minted}{tex}\Value\cite{fake}\end{minted}
\expandafter\def\csname dynamic\endcsname{x}
\ref{real}\nocite{*}`;
  const result = sourceOccurrences({ path: "main.tex", content });
  assert.equal(
    result.occurrences.filter((o) => o.kind === "command" && o.name === "Value")
      .length,
    1,
  );
  const withComments = "\\begin% {not-the-name}\n{localbox}x\\end{localbox}";
  for (const o of sourceOccurrences({
    path: "comments.tex",
    content: withComments,
  }).occurrences.filter((o) => o.kind === "environment"))
    assert.equal(withComments.slice(o.from, o.to), "localbox");
  const longLine = "α👩🏽‍💻".repeat(100) + "\\Value{x}" + "👩🏽‍💻".repeat(100),
    long = sourceOccurrences({ path: "long.tex", content: longLine })
      .occurrences[0];
  assert(long.preview.includes("\\Value{x}"));
  assert.equal(Buffer.from(long.preview).toString(), long.preview);
  assert(long.preview.length <= 200);
  assert.deepEqual(
    result.occurrences
      .filter((o) => o.role === "definition")
      .map((o) => o.name),
    ["Outer"],
  );
  assert(
    !result.occurrences.some((o) => ["fake", "Nested", "*"].includes(o.name)),
  );
  assert(
    result.occurrences.some((o) => o.kind === "label" && o.name === "real"),
  );
});
test("BibTeX navigation uses parser record boundaries and exact trimmed key spans without nested fake records", () => {
  const result = sourceOccurrences({ path: "refs.bib", content: bib });
  assert.deepEqual(
    result.occurrences.map((o) => o.name),
    ["alpha", "beta"],
  );
  for (const o of result.occurrences) {
    assert.equal(bib.slice(o.from, o.to), o.name);
    assert.equal(o.line, bib.slice(0, o.from).split("\n").length);
    assert.equal(o.role, "definition");
  }
});
test("caret navigation prefers literal keys/environments and handles declaration names, boundaries and unsupported text", () => {
  for (const [needle, kind, name] of [
    ["\\foo@bar{x}", "command", "foo@bar"],
    ["sec:one}", "label", "sec:one"],
    ["alpha, beta", "citation", "alpha"],
    ["localbox}See", "environment", "localbox"],
    ["\\Value}[1]", "command", "Value"],
  ] as const)
    assert.deepEqual(
      sourceSymbolAt(
        { path: "main.tex", content: source },
        source.indexOf(needle) + 2,
      ),
      { kind, name },
    );
  assert.equal(
    sourceSymbolAt(
      { path: "main.tex", content: source },
      source.indexOf("Exact arguments") + 3,
    ),
    undefined,
  );
  assert.equal(
    sourceSymbolAt({ path: "main.tex", content: source }, -1),
    undefined,
  );
  assert.deepEqual(
    sourceSymbolAt(
      { path: "refs.bib", content: bib },
      bib.indexOf("alpha") + 5,
    ),
    { kind: "citation", name: "alpha" },
  );
});
test("literal-name validation and source/occurrence limits are explicit", () => {
  for (const symbol of [
    { kind: "command", name: "foo@bar" },
    { kind: "environment", name: "align*" },
    { kind: "citation", name: "新:2026" },
  ])
    assert(validSourceSymbol(symbol as SourceSymbol));
  for (const symbol of [
    { kind: "command", name: "dynamic-name" },
    { kind: "environment", name: "bad/name" },
    { kind: "citation", name: "*" },
    { kind: "label", name: "bad name" },
    { kind: "unknown", name: "a" },
  ])
    assert(!validSourceSymbol(symbol as SourceSymbol));
  const big = sourceOccurrences({
    path: "main.tex",
    content: "x".repeat(1024 * 1024 + 1),
  });
  assert(big.limited);
  assert.deepEqual(big.occurrences, []);
  const many = sourceOccurrences({
    path: "main.tex",
    content: "\\Value ".repeat(SOURCE_OCCURRENCES + 1),
  });
  assert(many.limited);
  assert.equal(many.occurrences.length, SOURCE_OCCURRENCES);
});
test("project navigation retains duplicate definitions, cross-file usages and hashes without touching disk/source/history", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  const defs = f.find("command", "Value");
  assert.equal(defs.total, 2);
  const refs = f.find("command", "Value", "references");
  assert.equal(refs.total, 3);
  assert.equal(f.find("label", "sec:one", "references").total, 2);
  assert.equal(f.find("citation", "alpha").locations[0].path, "refs.bib");
  assert.equal(f.find("citation", "alpha", "references").total, 2);
  assert.equal(f.find("environment", "localbox", "references").total, 2);
  assert(defs.warnings.some((w) => w.includes("legacy.tex")));
  for (const l of [...defs.locations, ...refs.locations]) {
    const text = f.store.readText(f.project.id, l.path).content;
    assert.equal(l.hash, createHash("sha256").update(text).digest("hex"));
    assert.equal(text.slice(l.from, l.to), "\\Value");
  }
  assert.equal(f.snapshot(), before);
});
test("unsaved overlay replaces only that file, keeps saved/physical versions unchanged and flags older buffer revisions", (t) => {
  const f = fixture(t),
    before = f.snapshot(),
    overlay = {
      path: "main.tex",
      revision: 0,
      content: source.replaceAll("Value", "DraftValue"),
    };
  const current = f.find("command", "DraftValue", "definitions", overlay);
  assert.equal(current.total, 1);
  assert.equal(current.locations[0].unsaved, true);
  assert.equal(f.find("command", "Value", "definitions", overlay).total, 1);
  assert.equal(f.snapshot(), before);
  assert.equal(
    fs.readFileSync(
      path.join(f.store.projectDir(f.project.id), "main.tex"),
      "utf8",
    ),
    source,
  );
  f.store.save(f.project.id, "main.tex", source + "\nSaved elsewhere", 0);
  const stale = f.find("command", "DraftValue", "definitions", overlay);
  assert(stale.warnings.some((w) => w.includes("different revisions")));
  assert.equal(stale.locations[0].revision, 0);
});
test("cache follows saved generations, Trash/restore and deliberate disk adoption without automatically importing external bytes", (t) => {
  const f = fixture(t);
  assert.equal(f.find("command", "Value").total, 2);
  const name = "styles/local.sty",
    file = path.join(f.store.projectDir(f.project.id), name);
  fs.writeFileSync(file, "\\newcommand{\\ExternalValue}{x}\n");
  assert.equal(f.find("command", "ExternalValue").total, 0);
  const recovery = new SourceRecovery(f.store),
    review = recovery.review(f.project.id, name);
  recovery.resolve(f.project.id, {
    path: name,
    token: review.token,
    action: "disk",
  });
  assert.equal(f.find("command", "ExternalValue").total, 1);
  f.store.trash(f.project.id, name);
  assert.equal(f.find("command", "ExternalValue").total, 0);
  f.store.trash(f.project.id, name, true);
  assert.equal(f.find("command", "ExternalValue").total, 1);
});
test("an intervening saved generation rejects a mixed index and the next request rebuilds it", (t) => {
  const f = fixture(t),
    original = f.store.file.bind(f.store);
  let changed = false;
  f.store.file = (id, name, ...rest) => {
    const row = original(id, name, ...rest);
    if (!changed && name === "main.tex") {
      changed = true;
      f.store.save(
        f.project.id,
        "sections/method.tex",
        "\\newcommand{\\LaterValue}{x}\n",
        0,
      );
    }
    return row;
  };
  assert.throws(
    () => f.find("command", "Value"),
    /project changed during navigation/,
  );
  f.store.file = original;
  assert.equal(f.find("command", "LaterValue").total, 1);
});
test("invalid and oversized overlays never change source, history or receipts", (t) => {
  const f = fixture(t),
    before = f.snapshot(),
    base = { kind: "command", name: "Value", mode: "definitions" };
  for (const current of [
    { path: "../escape.tex", revision: 0, content: "x" },
    { path: "asset.bin", revision: 0, content: "x" },
    { path: "main.tex", revision: -1, content: "x" },
    { path: "main.tex", revision: 0, content: "x".repeat(2 * 1024 * 1024 + 1) },
    { path: "main.tex", revision: 0, content: "\ud800" },
  ])
    assert.throws(() =>
      f.service.find(f.project.id, {
        ...base,
        current,
      } as SourceNavigationRequest),
    );
  assert.throws(() =>
    f.service.find(f.project.id, { ...base, mode: "apply" } as any),
  );
  assert.equal(f.snapshot(), before);
});
test("matching output and cached project occurrence work are bounded with truthful warnings", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 3; i++)
    f.store.add(
      f.project.id,
      `many${i}.tex`,
      Buffer.from("\\Repeated ".repeat(17500)),
    );
  const result = f.find("command", "Repeated", "references");
  assert.equal(result.locations.length, 2000);
  assert(result.total <= 50000);
  assert(result.total > 2000);
  assert(result.warnings.some((w) => w.includes("50,000")));
  assert(result.warnings.some((w) => w.includes("2,000")));
});
test("source-location API is project/origin scoped, read-only under agent ownership and rejects unmanaged overlays", async (t) => {
  const root = fs.mkdtempSync(
      path.resolve("data/verification/source-navigation-api-"),
    ),
    f = await createApp(root, { seed: false });
  t.after(async () => {
    await f.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const a = f.store.create("A", [
      { path: "main.tex", data: Buffer.from(source) },
    ]),
    b = f.store.create("B"),
    headers = { host: "127.0.0.1:5173", "x-prism-request": "1" },
    payload = { kind: "command", name: "Value", mode: "definitions" };
  f.store.projectLocks.set(a.id, "read-only-agent");
  const before = JSON.stringify(f.store.checkpoints(a.id));
  const request = (project: string, extraHeaders = {}) =>
    f.app.inject({
      method: "POST",
      url: `/api/projects/${project}/source-locations`,
      headers: { ...headers, ...extraHeaders },
      payload,
    });
  const response = await request(a.id);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().total, 1);
  assert.equal((await request(b.id)).json().total, 0);
  assert.equal(
    (await request(a.id, { origin: "https://other.invalid" })).statusCode,
    403,
  );
  assert.equal((await request("missing")).statusCode, 404);
  assert.equal(JSON.stringify(f.store.checkpoints(a.id)), before);
  assert.deepEqual(f.store.runs(a.id), []);
  f.store.projectLocks.clear();
});
