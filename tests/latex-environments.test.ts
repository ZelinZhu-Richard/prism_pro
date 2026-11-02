import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, EditorSelection, Transaction } from "@codemirror/state";
import { history, undo, redo, undoDepth } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import {
  scanEnvironments,
  environmentAt,
  environmentBreak,
  environmentOpaque,
  ENVIRONMENT_CHARACTERS,
} from "../shared/latex-environments";
import {
  latexEnvironments,
  environmentIndex,
  closeEnvironmentTransaction,
  goToMatchingEnvironment,
} from "../src/latex-environments";
import { latexCompletions } from "../src/latex-completion";
import { CompletionContext } from "@codemirror/autocomplete";
import {
  editorPreferences,
  editorPreferencesPatch,
} from "../shared/editor-preferences";
const begin = (n: string) => "\\begin{" + n + "}",
  end = (n: string) => "\\end{" + n + "}";
test("environment scan matches nested same/different names and retains exact Unicode offsets", () => {
  const source =
      "新 👩🏽‍💻 é\n" +
      begin("itemize") +
      "\n" +
      begin("itemize") +
      "\n" +
      begin("equation*") +
      "x" +
      end("equation*") +
      "\n" +
      end("itemize") +
      "\n" +
      end("itemize"),
    index = scanEnvironments(source);
  assert.equal(index.tokens.length, 6);
  assert.deepEqual(
    index.tokens.map((t) => t.mate),
    [5, 4, 3, 2, 1, 0],
  );
  assert.equal(
    source.slice(index.tokens[2].from, index.tokens[2].to),
    begin("equation*"),
  );
  assert.equal(environmentAt(index, index.tokens[0].from + 4)?.mate, 5);
  assert.equal(environmentAt(index, index.tokens[0].to)?.mate, 5);
  assert.equal(environmentAt(index, 0), undefined);
});
test("comments, escaped commands, inline/raw literals and macro definitions never create false environment pairs", () => {
  const source = String.raw`% \begin{hidden}
\\begin{linebreak} \\\begin{real}\end{real}
\verb|\begin{hidden}| \verb*+\end{hidden}+
\newcommand{\demo}[1][x]{\begin{hidden}#1\end{hidden}}
\def\primitive#1{\begin{hidden}#1}
\newenvironment{custombox}[1]{\begin{quote}#1}{\end{quote}}
\NewDocumentEnvironment{customstar}{m}{\begin{center}}{\end{center}}
\begin{verbatim}
% literal \begin{hidden}
\end{verbatim}
\begin{minted}{tex}
\begin{hidden}
\end{minted}
\begin{custombox}text\end{custombox}`;
  const index = scanEnvironments(source);
  assert.deepEqual(
    index.tokens.map((t) => t.name),
    [
      "real",
      "real",
      "verbatim",
      "verbatim",
      "minted",
      "minted",
      "custombox",
      "custombox",
    ],
  );
  assert.deepEqual(index.declared, ["custombox", "customstar"]);
  assert.ok(index.tokens.every((t) => t.mate !== undefined));
  assert.equal(environmentOpaque(index, source.indexOf("literal")), true);
  assert.deepEqual(
    scanEnvironments("\\newcommand{\\bad}{" + begin("hidden")).tokens,
    [],
  );
});
test("mismatched environments do not cross-pair; scans bound source, token and nesting work", () => {
  const index = scanEnvironments(begin("a") + begin("b") + end("a") + end("b"));
  assert.deepEqual(
    index.tokens.map((t) => t.mate),
    [undefined, 3, undefined, 1],
  );
  assert.equal(
    scanEnvironments("x".repeat(ENVIRONMENT_CHARACTERS + 1)).limited,
    true,
  );
  assert.equal(scanEnvironments(begin("x").repeat(258)).limited, true);
  assert.equal(
    scanEnvironments((begin("x") + end("x")).repeat(10001)).limited,
    true,
  );
  const bad = scanEnvironments(begin("verbatim") + "\n" + begin("hidden"));
  assert.equal(bad.tokens.length, 1);
  assert.equal(bad.tokens[0].mate, undefined);
});
test("Enter closes standalone unmatched begin lines with current indentation and complete optional/required arguments", () => {
  for (const [source, unit] of [
    ["  " + begin("itemize"), "  "],
    ["\t" + begin("tabular") + "[t]{ll}", "\t"],
    [begin("verbatim"), "  "],
    [begin("custom") + "[{a[b]c}]{x}", "    "],
  ]) {
    const edit = environmentBreak(source, source.length, unit);
    assert.ok(edit, source);
    assert.ok(edit.text.endsWith(end(scanEnvironments(source).tokens[0].name)));
    assert.equal(
      (source + edit.text).slice(0, edit.cursor).split("\n").at(-1),
      (source.match(/^\s*/)?.[0] ?? "") + unit,
    );
  }
});
test("Enter leaves existing ends, inline prose, comments, definitions, literal bodies and incomplete arguments alone", () => {
  const cases = [
    begin("itemize") + "\n" + end("itemize"),
    "Text " + begin("itemize"),
    "% " + begin("itemize"),
    begin("verbatim") + "\n" + begin("hidden"),
    "\\newcommand{\\a}{\n" + begin("hidden"),
    begin("tabular") + "{unclosed",
    begin("tabular") + "[unclosed{nested}",
    begin("tabular") + "%comment",
    begin("x") + " prose",
  ];
  for (const source of cases) {
    const position = source.includes("\n" + end("itemize"))
      ? begin("itemize").length
      : source.length;
    assert.equal(environmentBreak(source, position, "  "), null, source);
  }
});
function state(doc: string, positions = [doc.length], readonly = false) {
  return EditorState.create({
    doc,
    selection: EditorSelection.create(
      positions.map((p) => EditorSelection.cursor(p)),
    ),
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      EditorState.readOnly.of(readonly),
      indentUnit.of("  "),
      history(),
      latexEnvironments(),
    ],
  });
}
test("closing is one isolated transaction with exact Undo/Redo; source snapshots and programmatic edits do not close", () => {
  let s = state(begin("itemize"));
  const before = s.doc.toString();
  const tr = closeEnvironmentTransaction(s)!;
  assert.ok(tr);
  s = tr.state;
  assert.equal(s.doc.toString(), before + "\n  \n" + end("itemize"));
  assert.equal(s.selection.main.head, before.length + 3);
  assert.equal(undoDepth(s), 1);
  const target = {
    get state() {
      return s;
    },
    dispatch(t: any) {
      s = t.state ?? s.update(t).state;
    },
  };
  assert.equal(undo(target), true);
  assert.equal(s.doc.toString(), before);
  assert.equal(s.selection.main.head, before.length);
  assert.equal(redo(target), true);
  assert.equal(s.doc.toString(), before + "\n  \n" + end("itemize"));
  const plain = state("").update({
    changes: { from: 0, insert: begin("figure") + "\n" },
    annotations: Transaction.userEvent.of("input.type.ai"),
  }).state;
  assert.equal(plain.doc.toString(), begin("figure") + "\n");
});
test("multiple compatible cursors close independently; selections, mixed locations and read-only remain safe", () => {
  const doc = begin("itemize") + "\n\n" + begin("quote"),
    positions = [begin("itemize").length, doc.length],
    s = state(doc, positions),
    tr = closeEnvironmentTransaction(s)!;
  assert.ok(tr);
  assert.equal(tr.state.selection.ranges.length, 2);
  assert.equal(
    tr.state.doc.toString(),
    begin("itemize") +
      "\n  \n" +
      end("itemize") +
      "\n\n" +
      begin("quote") +
      "\n  \n" +
      end("quote"),
  );
  assert.equal(closeEnvironmentTransaction(state(doc, positions, true)), null);
  assert.equal(
    closeEnvironmentTransaction(state(doc, [positions[0], positions[0] + 1])),
    null,
  );
  const selected = state(begin("quote")).update({
    selection: { anchor: 0, head: 2 },
  }).state;
  assert.equal(closeEnvironmentTransaction(selected), null);
});
test("matching navigation changes only selection and works with read-only source; index invalidates after edits", () => {
  let s = state(begin("quote") + "text" + end("quote"), [2], true);
  const original = s.doc.toString(),
    before = s.field(environmentIndex);
  let focused = false;
  const view = {
    get state() {
      return s;
    },
    dispatch(t: any) {
      s = s.update(t).state;
    },
    focus() {
      focused = true;
    },
  };
  assert.equal(goToMatchingEnvironment(view as any), true);
  assert.equal(s.selection.main.head, original.indexOf(end("quote")));
  assert.equal(s.doc.toString(), original);
  assert.equal(focused, true);
  assert.equal(s.field(environmentIndex), before);
  const changed = s.update({
    changes: {
      from: original.length - end("quote").length,
      to: original.length,
      insert: "",
    },
  }).state;
  assert.notEqual(changed.field(environmentIndex), before);
  assert.equal(changed.field(environmentIndex).tokens[0].mate, undefined);
});
function completion(doc: string, pos = doc.length) {
  return latexCompletions(
    new CompletionContext(EditorState.create({ doc }), pos, true),
  );
}
test("environment completion offers common/custom names and only currently open ends without duplicating suffix/braces", () => {
  assert.equal(
    completion("\\begin{ite}", 10)?.options.some((o) => o.label === "ite"),
    false,
  );
  assert.ok(
    completion("\\begin{ite")?.options.some((o) => o.label === "itemize"),
  );
  assert.ok(
    completion("\\newenvironment{mybox}{}{}\n\\begin{my")?.options.some(
      (o) => o.label === "mybox",
    ),
  );
  const doc = begin("document") + begin("quote") + end("quote") + "\\end{";
  assert.deepEqual(
    completion(doc)?.options.map((o) => o.label),
    ["document"],
  );
  const middle = "\\begin{itemize}";
  const c = completion(middle, middle.indexOf("itemize") + 2)!;
  assert.equal(c.from, middle.indexOf("itemize"));
  assert.equal(c.to, middle.indexOf("}"));
  assert.equal(completion("% \\begin{ite"), null);
  assert.equal(completion("\\\\begin{ite"), null);
  assert.equal(completion(begin("verbatim") + "\n\\begin{ite"), null);
});
test("environment closing preference defaults for legacy settings, validates booleans and preserves explicit off", () => {
  assert.equal(editorPreferences({}).closeEnvironments, true);
  assert.equal(
    editorPreferences({ closeEnvironments: false }).closeEnvironments,
    false,
  );
  assert.deepEqual(editorPreferencesPatch({ closeEnvironments: false }), {
    closeEnvironments: false,
  });
  assert.throws(() => editorPreferencesPatch({ closeEnvironments: "false" }));
});
