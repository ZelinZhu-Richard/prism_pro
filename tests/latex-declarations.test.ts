import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { sourceDeclarations } from "../shared/latex-declarations";
import { indexSources } from "../shared/project-intelligence";
import { latexCompletions } from "../src/latex-completion";
import { Intelligence } from "../server/intelligence";
import { Store } from "../server/store";
import { SourceRecovery } from "../server/source-recovery";
test("literal command declarations retain source locations while comments, raw/inline text and nested definition bodies remain opaque", () => {
  const source = {
    path: "styles/Café.sty",
    content: String.raw`% Unicode 新 👩🏽‍💻 é
\newcommand*{\LocalName}[1][default]{Text #1}
\renewcommand % comment between head and target
 {\OtherName}{Text}
\NewDocumentCommand{\ModernName}{m O{default}}{#1 #2}
\def\PrimitiveName#1{#1}
% \newcommand{\Hidden}{Text}
\\newcommand{\Escaped}{Text}
\verb|\newcommand{\Inline}{Text}|
\begin{verbatim}\newcommand{\Raw}{Text}\end{verbatim}
\newcommand{\Outer}{\newcommand{\Nested}{Text}}
\gdef\GlobalName{Text}
\def{\Invalid}{Text}
`,
  };
  const d = sourceDeclarations(source);
  assert.deepEqual(
    d.commands.map((c) => c.name),
    [
      "LocalName",
      "OtherName",
      "ModernName",
      "PrimitiveName",
      "Outer",
      "GlobalName",
    ],
  );
  assert.equal(d.commands[0].line, 2);
  assert.equal(d.commands[1].line, 3);
  assert.equal(d.commands[0].path, source.path);
  assert.equal(
    source.content.slice(d.commands[0].from, d.commands[0].to),
    "\\LocalName",
  );
  assert.equal(d.limited, false);
});
test("package declarations use visible literal source and preserve local nested package names without executing or following anything", () => {
  const d = sourceDeclarations({
    path: "styles/local.sty",
    content: String.raw`\RequirePackage[unicode]{amsmath, graphicx}
% \usepackage{hidden}
\newcommand{\LoadLater}{\usepackage{not-an-active-load}}
\verb|\usepackage{inline}|
\begin{filecontents}{fake.sty}\usepackage{raw}\end{filecontents}
\\usepackage{escaped}
\usepackage{styles/extra,../escape,./dot,.hidden,safe-name}
`,
  });
  assert.deepEqual(
    d.packages.map((p) => p.name),
    [
      "styles/local",
      "amsmath",
      "graphicx",
      "styles/extra",
      ".hidden",
      "safe-name",
    ],
  );
  assert(d.packages[0].local);
  assert.equal(d.packages[1].local, false);
  assert.equal(d.packages[1].line, 1);
});
test("declaration work is bounded and does not expand macros or malformed primitive targets", () => {
  assert.deepEqual(
    sourceDeclarations({
      path: "large.tex",
      content: "x".repeat(1024 * 1024 + 1),
    }).commands,
    [],
  );
  const d = sourceDeclarations({
    path: "many.tex",
    content: Array.from(
      { length: 2001 },
      (_, i) =>
        "\\newcommand{\\Name" + String.fromCharCode(65 + (i % 26)) + "}{Text}",
    ).join("\n"),
  });
  assert.equal(d.commands.length, 2000);
  assert(d.limited);
  assert.deepEqual(
    sourceDeclarations({
      path: "dynamic.tex",
      content: String.raw`\def*\bad{X}\def{\bad}{X}\expandafter\newcommand\csname dynamic\endcsname{X}`,
    }).commands,
    [],
  );
});
const index = indexSources([
  {
    path: "styles/local.sty",
    content: String.raw`\newcommand{\ProjectValue}[1]{#1}\newcommand{\section}[1]{#1}\RequirePackage{graphicx}`,
  },
  { path: "defs.tex", content: String.raw`\newcommand{\Duplicate}{One}` },
  { path: "other.cls", content: String.raw`\newcommand{\Duplicate}{Two}` },
  {
    path: "main.tex",
    content: String.raw`\newcommand{\Removed}{Old}\usepackage{geometry}`,
  },
]);
function complete(text: string, at = text.length, readOnly = false) {
  return latexCompletions(
    new CompletionContext(
      EditorState.create({
        doc: text,
        extensions: [EditorState.readOnly.of(readOnly)],
      }),
      at,
      true,
    ),
    index,
    "main.tex",
  );
}
test("custom completion uses unsaved current declarations, replaces only a command name and preserves suffixes/arguments", () => {
  const text = String.raw`\newcommand{\FreshValue}{Text}
\ProjecValue{Keep {these} arguments}`;
  const at = text.indexOf("ProjecValue") + 4,
    result = complete(text, at)!;
  const option = result.options.find((o) => o.label === "\\ProjectValue")!;
  assert.equal(option.apply, "\\ProjectValue");
  assert.equal(
    text.slice(0, result.from) + option.apply + text.slice(result.to!),
    String.raw`\newcommand{\FreshValue}{Text}
\ProjectValue{Keep {these} arguments}`,
  );
  assert(
    complete(String.raw`\newcommand{\FreshValue}{Text}
\Fresh`)?.options.some((o) => o.label === "\\FreshValue"),
  );
  assert(!complete("\\Rem")?.options.some((o) => o.label === "\\Removed"));
  const declaration = String.raw`\newcommand{\PartialName}{Text}`;
  assert(
    !complete(
      declaration,
      declaration.indexOf("PartialName") + 4,
    )?.options.some((o) => o.label === "\\PartialName"),
  );
  const builtin = complete("\\sec")!.options.find(
    (o) => o.label === "\\section",
  )!;
  assert.equal(builtin.apply, "\\section");
  assert.equal(
    complete("\\Duplicate")?.options.filter((o) => o.label === "\\Duplicate")
      .length,
    1,
  );
  assert.match(
    complete("\\Duplicate")!.options.find((o) => o.label === "\\Duplicate")!
      .info as string,
    /defs.tex:1\nother.cls:1/,
  );
});
test("package completion offers project packages and used names with explicit provenance, replacing only the current comma-separated name", () => {
  const text = String.raw`\usepackage{amsmath, styles/loacl}`;
  const at = text.indexOf("loacl") + 2,
    result = complete(text, at)!;
  const option = result.options.find((o) => o.label === "styles/local")!;
  assert(!result.options.some((o) => o.label === "styles/loacl"));
  assert.equal(
    text.slice(0, result.from) + option.label + text.slice(result.to!),
    String.raw`\usepackage{amsmath, styles/local}`,
  );
  assert.equal(option.detail, "Project package");
  assert.match(
    complete("\\RequirePackage[opt]{gra")!.options.find(
      (o) => o.label === "graphicx",
    )!.detail!,
    /installation not checked/,
  );
  assert.equal(complete("% \\usepackage{styles"), null);
  assert.equal(complete("\\begin{verbatim}\\usepackage{styles"), null);
  assert.equal(complete("\\begin{luacode}\\Project"), null);
  assert.equal(complete("\\verb|\\Project"), null);
  assert.equal(complete("\\Project", undefined, true), null);
});
test("saved declaration indices include sty/cls files, stay independent from external edits until guarded adoption, and invalidate on save/Trash/restore", (t) => {
  const root = fs.mkdtempSync(
      path.resolve("data/verification/latex-declarations-"),
    ),
    store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic project declarations", [
      {
        path: "styles/local.sty",
        data: Buffer.from("\\newcommand{\\Original}{Text}"),
      },
      {
        path: "custom.cls",
        data: Buffer.from("\\newcommand{\\ClassValue}{Text}"),
      },
      { path: "asset.bin", data: Buffer.from([0, 255]) },
    ]),
    service = new Intelligence(store);
  assert.deepEqual(
    service.get(p.id).commands?.map((c) => c.name),
    ["ClassValue", "Original"],
  );
  const cached = service.get(p.id);
  fs.writeFileSync(
    path.join(store.projectDir(p.id), "styles/local.sty"),
    "\\newcommand{\\External}{Text}",
  );
  assert.equal(service.get(p.id), cached);
  const recovery = new SourceRecovery(store),
    review = recovery.review(p.id, "styles/local.sty");
  recovery.resolve(p.id, {
    path: "styles/local.sty",
    token: review.token,
    action: "disk",
  });
  assert(service.get(p.id).commands?.some((c) => c.name === "External"));
  assert(!service.get(p.id).commands?.some((c) => c.name === "Original"));
  store.trash(p.id, "styles/local.sty");
  assert(!service.get(p.id).packages?.some((p) => p.name === "styles/local"));
  store.trash(p.id, "styles/local.sty", true);
  assert(service.get(p.id).packages?.some((p) => p.name === "styles/local"));
});
test("custom @ names consume the full existing suffix and remain completable after @ without altering arguments", () => {
  const builtin = latexCompletions(
    new CompletionContext(
      EditorState.create({ doc: "\\secton{Keep}" }),
      4,
      true,
    ),
  );
  assert.equal(builtin?.filter, false);
  assert.equal(builtin?.validFor, undefined);
  assert(builtin?.options.some((o) => o.label === "\\section"));
  const commands = indexSources([
    { path: "internal.sty", content: String.raw`\newcommand{\foo@bar}[1]{#1}` },
  ]);
  for (const [text, pos] of [
    [String.raw`\foo@bar{Keep {these} arguments}`, 2],
    [String.raw`\foo@bar{Keep {these} arguments}`, 6],
  ] as const) {
    const result = latexCompletions(
        new CompletionContext(EditorState.create({ doc: text }), pos, true),
        commands,
        "main.tex",
      )!,
      option = result.options.find((o) => o.label === "\\foo@bar")!;
    assert(option);
    assert.equal(result.filter, false);
    assert.equal(text.slice(result.from, result.to), "\\foo@bar");
    assert.equal(
      text.slice(0, result.from) + option.apply + text.slice(result.to!),
      text,
    );
  }
  const partial = String.raw`\foo@ba`;
  assert(
    latexCompletions(
      new CompletionContext(
        EditorState.create({ doc: partial }),
        partial.length,
        true,
      ),
      commands,
      "main.tex",
    )?.options.some((o) => o.label === "\\foo@bar"),
  );
});
