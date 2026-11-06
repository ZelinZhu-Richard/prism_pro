import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import {
  parseBibtex,
  indexSources,
  maskTexComments,
  searchCitations,
  texSymbols,
} from "../shared/project-intelligence";
import { latexCompletions, citationInsertion } from "../src/latex-completion";
import { Intelligence } from "../server/intelligence";
import { Store } from "../server/store";
import { parseWordCount } from "../server/word-count";
import { createApp } from "../server/app";
const bibliography = String.raw`% @article{ignored,title={Comment}}
@string{venue = "Journal of " # "Examples"}
@article{smith2026,
 title = {A {Nested} Scientific Study}, author = {Jane Smith and John Doe}, year = 2026, journal = venue
}
@book(other, title="A quoted } title",author={García, Ana},date={2025-01})
@article(parentheses,title={A ( title},author={B. Writer},year={2024})
@comment{Ignored {nested @book{fake,title={No}}}}
@preamble{"ignored"}
@xdata{metadata,title={Not independently citable}}
`;
test("BibTeX scanner handles nested braces, quotes, parentheses, comments, strings and concatenated values", () => {
  const entries = parseBibtex({ path: "refs.bib", content: bibliography });
  assert.deepEqual(
    entries.map((e) => e.key),
    ["smith2026", "other", "parentheses"],
  );
  assert.equal(entries[0].title, "A Nested Scientific Study");
  assert.equal(entries[0].journal, "Journal of Examples");
  assert.equal(entries[1].title, "A quoted title");
  assert.equal(entries[1].year, "2025-01");
  assert.equal(entries[2].title, "A ( title");
  assert.equal(entries[0].line, 3);
});
test("comment and verbatim masking preserves line positions and excludes false labels and bibliography entries", () => {
  const source = String.raw`Literal \% then % hidden \label{hidden}
\\% hidden after two slashes \label{hidden2}
\label{sec:real}
\begin{verbatim}
\label{fake} \bibitem{fake}
\end{verbatim}
\bibitem[Example(2026)]{manual-key} A. Example. An existing reference.
\entry{biblatex-key}{article}{}`;
  const symbols = texSymbols({ path: "main.tex", content: source });
  assert.deepEqual(
    symbols.labels.map((l) => l.key),
    ["sec:real"],
  );
  assert.equal(symbols.labels[0].line, 3);
  assert.deepEqual(
    symbols.citations.map((c) => c.key),
    ["manual-key", "biblatex-key"],
  );
  assert.equal(maskTexComments(source).length, source.length);
});
test("project index prefers .bib metadata, warns on duplicate keys/labels and searches all bibliography fields", () => {
  const index = indexSources(
    [
      { path: "refs.bib", content: bibliography },
      { path: "other.bib", content: "@article{smith2026,title={Duplicate}}" },
      { path: "main.bbl", content: "\\bibitem{smith2026} generated" },
      { path: "main.tex", content: "\\label{eq:one}\n\\label{eq:one}" },
    ],
    7,
  );
  assert.equal(index.generation, 7);
  assert.equal(index.citations.length, 3);
  assert.ok(index.citations.find((e) => e.key === "smith2026")?.author);
  assert.equal(index.warnings.length, 2);
  assert.equal(
    searchCitations(index.citations, "scientific 2026")[0].key,
    "smith2026",
  );
  assert.equal(
    searchCitations(index.citations, "Examples Smith")[0].key,
    "smith2026",
  );
});
const index = indexSources([
  { path: "refs.bib", content: bibliography },
  {
    path: "section.tex",
    content: "\\label{sec:introduction}\n\\label{eq:energy}",
  },
]);
function complete(doc: string, readOnly = false) {
  const state = EditorState.create({
    doc,
    extensions: [EditorState.readOnly.of(readOnly)],
  });
  return latexCompletions(
    new CompletionContext(state, doc.length, true),
    index,
  );
}
test("citation completions search titles/authors, preserve comma-separated keys and support optional arguments", () => {
  const doc = "\\citep[see][p. 4]{other, scientific";
  const result = complete(doc)!;
  assert.equal(result.options[0].label, "smith2026");
  assert.equal(doc.slice(0, result.from), "\\citep[see][p. 4]{other, ");
  assert.equal(complete("\\textcite{Jane")?.options[0].label, "smith2026");
  assert.equal(complete("\\Cite{2026")?.options[0].label, "smith2026");
});
test("label and command completions respect active text, comments, verbatim and read-only locks", () => {
  assert.ok(
    complete("\\eqref{energy")?.options.some((o) => o.label === "eq:energy"),
  );
  assert.ok(
    complete("\\label{local:new}\n\\cref{new")?.options.some(
      (o) => o.label === "local:new",
    ),
  );
  assert.ok(complete("\\sec")?.options.some((o) => o.label === "\\section"));
  assert.equal(complete("% \\cite{Smith"), null);
  assert.equal(complete("\\begin{verbatim}\n\\cite{Smith"), null);
  assert.equal(complete("\\cite{Smith", true), null);
});
test("reference insertion preserves source outside captured ranges and replaces only the current citation key", () => {
  assert.deepEqual(citationInsertion("A passage.", 2, 9, "smith2026"), {
    from: 2,
    to: 9,
    text: "\\cite{smith2026}",
  });
  const doc = "Before \\citep{other, Smth} after";
  const at = doc.indexOf("Smth") + 2;
  const change = citationInsertion(doc, at, at, "smith2026");
  assert.ok(change);
  assert.equal(
    doc.slice(0, change.from) + change.text + doc.slice(change.to),
    "Before \\citep{other, smith2026} after",
  );
});
test("cached project intelligence refreshes after edits, deletion and restoration without indexing assets", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-index-"));
  const store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic", [
    { path: "refs.bib", data: Buffer.from(bibliography) },
    { path: "figure.bin", data: Buffer.from([0, 255]) },
  ]);
  const service = new Intelligence(store);
  assert.equal(service.get(p.id).citations.length, 3);
  assert.equal(service.get(p.id), service.get(p.id));
  store.save(p.id, "refs.bib", "@article{changed,title={New}}", 0);
  assert.equal(service.get(p.id).citations[0].key, "changed");
  store.trash(p.id, "refs.bib");
  assert.equal(service.get(p.id).citations.length, 0);
  store.trash(p.id, "refs.bib", true);
  assert.equal(service.get(p.id).citations.length, 1);
});
test("TeXcount report parser returns category and section counts and surfaces missing-input warnings", () => {
  const report =
    "!!! File missing not found !!!\nWords in text: 7\nWords in headers: 4\nWords outside text (captions, etc.): 3\nNumber of headers: 2\nNumber of floats/tables/figures: 1\nNumber of math inlines: 1\nNumber of math displayed: 2\n  3+2+0 (1/0/1/0) Section: Introduction\n";
  const count = parseWordCount(report, 3, "main.tex");
  assert.equal(count.text, 7);
  assert.equal(count.captions, 3);
  assert.equal(count.sections[0].title, "Section: Introduction");
  assert.equal(count.warnings.length, 1);
  assert.throws(
    () => parseWordCount("No valid counts", 0, "main.tex"),
    /complete count/,
  );
});
test("reference index API remains project-scoped and rejects foreign origins", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-index-api-"));
  const { app, store } = await createApp(root, {
    seed: false,
    dist: "/nonexistent",
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const a = store.create("A", [
      { path: "a.bib", data: Buffer.from(bibliography) },
    ]),
    b = store.create("B");
  const response = await app.inject({
    url: `/api/projects/${a.id}/intelligence`,
    headers: { host: "127.0.0.1:4317" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().citations.length, 3);
  const other = await app.inject({
    url: `/api/projects/${b.id}/intelligence`,
    headers: { host: "127.0.0.1:4317" },
  });
  assert.equal(other.json().citations.length, 0);
  assert.equal(
    (
      await app.inject({
        url: `/api/projects/${a.id}/intelligence`,
        headers: { host: "127.0.0.1:4317", origin: "https://example.invalid" },
      })
    ).statusCode,
    403,
  );
});

test("completion replaces the remainder of a key and preserves existing command arguments", () => {
  const doc = "\\cite{Smth}";
  const state = EditorState.create({ doc });
  const at = doc.indexOf("Smth") + 2;
  const result = latexCompletions(
    new CompletionContext(state, at, true),
    index,
  )!;
  assert.equal(doc.slice(result.from, result.to), "Smth");
  const existing = "\\secton{Keep this title}";
  const command = latexCompletions(
    new CompletionContext(EditorState.create({ doc: existing }), 4, true),
    index,
  )!;
  const option = command.options.find((o) => o.label === "\\section")!;
  assert.equal(option.apply, "\\section");
  assert.equal(
    existing.slice(0, command.from) +
      option.apply +
      existing.slice(command.to!),
    "\\section{Keep this title}",
  );
});
test("link completions describe their package and preserve existing link arguments", () => {
  assert.equal(
    complete("\\hre")?.options.find((o) => o.label === "\\href")?.detail,
    "Link (hyperref)",
  );
  assert.equal(
    complete("\\ur")?.options.find((o) => o.label === "\\url")?.detail,
    "URL (url or hyperref)",
  );
  const doc = String.raw`\hre{https://example.com}{Existing link}`;
  const result = latexCompletions(
    new CompletionContext(EditorState.create({ doc }), 4, true),
    index,
  )!;
  assert.equal(
    result.options.find((o) => o.label === "\\href")?.apply,
    "\\href",
  );
  assert.equal(doc.slice(result.to), "{https://example.com}{Existing link}");
});
test("formatted bibliography text remains searchable and crossing a citation boundary is rejected", () => {
  const entry = parseBibtex({
    path: "refs.bib",
    content: String.raw`@article{one,title={A \textit{clear} \LaTeX{} example},author={Garc\'ia, Ana}}`,
  })[0];
  assert.equal(entry.title, "A clear LaTeX example");
  assert.equal(searchCitations([entry], "Garcia clear").length, 1);
  const doc = "Before \\cite{key} after";
  assert.equal(
    citationInsertion(doc, doc.indexOf("key"), doc.indexOf(" after"), "one"),
    null,
  );
});

test("biblatex output exposes searchable fields and incomplete BibTeX files have diagnostics", () => {
  const result = indexSources([
    {
      path: "paper.bbl",
      content: String.raw`\entry{key}{article}{}\name{author}{1}{}{{\namepartfamily{Smith}\namepartgiven{Jane}}}\field{title}{A {Nested} Result}\field{year}{2026}\field{journaltitle}{Example Journal}\endentry`,
    },
    {
      path: "broken.bib",
      content: "@article{unfinished,title={Still editing}",
    },
  ]);
  const entry = result.citations.find((e) => e.key === "key")!;
  assert.equal(entry.title, "A Nested Result");
  assert.equal(entry.author, "Smith Jane");
  assert.equal(entry.year, "2026");
  assert.equal(
    searchCitations(result.citations, "Smith Journal")[0].key,
    "key",
  );
  assert.match(result.warnings.join(" "), /Incomplete BibTeX/);
});
