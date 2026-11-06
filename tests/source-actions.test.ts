import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type Transaction } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import {
  blockInsertion,
  escapeLatexText,
  figureSource,
  formatSource,
  inMathMode,
  tableSource,
  type SourceEdit,
  type TableOptions,
} from "../src/source-actions";
import { mathSymbols, searchSymbols, symbolSource } from "../src/math-symbols";
import {
  readOnlyTransactions,
  sourceEditTransaction,
} from "../src/editor-transactions";
const apply = (doc: string, edit: SourceEdit) =>
  doc.slice(0, edit.from) + edit.text + doc.slice(edit.to);
test("formatting preserves Unicode source outside the selection and selects the exact wrapped content", () => {
  const doc = "Before é 👩🏽‍🔬 after",
    from = 7,
    to = doc.indexOf(" after");
  const edit = formatSource(doc, from, to, "bold");
  assert.equal(apply(doc, edit), "Before \\textbf{é 👩🏽‍🔬} after");
  assert.equal(
    apply(doc, edit).slice(edit.selection!.anchor, edit.selection!.head),
    "é 👩🏽‍🔬",
  );
  assert.equal(formatSource("", 0, 0, "italic").text, "\\textit{text}");
  assert.throws(() => formatSource(doc, -1, 2, "bold"), /selection/);
});
test("style toggles unwrap matching whole or inner selections without stripping partial nested groups", () => {
  const doc = String.raw`A \textbf{old \emph{important}} end`;
  const start = doc.indexOf("\\textbf"),
    end = doc.indexOf(" end");
  assert.equal(
    apply(doc, formatSource(doc, start, end, "bold")),
    String.raw`A old \emph{important} end`,
  );
  assert.equal(
    apply(doc, formatSource(doc, start + 8, end - 1, "bold")),
    String.raw`A old \emph{important} end`,
  );
  const partial = String.raw`\textbf{first} \textbf{second}`;
  assert.equal(
    formatSource(partial, 0, partial.length, "bold").text,
    `\\textbf{${partial}}`,
  );
});
test("heading changes operate on complete lines and preserve existing nested source commands", () => {
  const doc = "Before\n\\section{A \\emph{title}}\nAfter";
  assert.equal(
    apply(doc, formatSource(doc, 12, 12, "subsection")),
    "Before\n\\subsection{A \\emph{title}}\nAfter",
  );
  const blank = formatSource("\nNext", 0, 0, "section");
  assert.equal(apply("\nNext", blank), "\\section{Heading}\nNext");
  assert.equal(blank.selection!.head - blank.selection!.anchor, 7);
  const starred = String.raw`\section*{Long \emph{title}} % retained`;
  assert.equal(
    apply(starred, formatSource(starred, 10, 10, "subsection")),
    String.raw`\subsection*{Long \emph{title}} % retained`,
  );
  const short = String.raw`\section[Short]{Long \emph{title}}`;
  assert.equal(
    apply(short, formatSource(short, 10, 10, "subsection")),
    String.raw`\subsection[Short]{Long \emph{title}}`,
  );
  const comment = "% a note with a } brace";
  assert.equal(
    apply(comment, formatSource(comment, 0, comment.length, "section")),
    comment,
  );
});
test("list and comment ranges exclude the next line when selection ends at its start", () => {
  const doc = "First\nSecond\nUntouched",
    end = doc.indexOf("Untouched");
  const edit = formatSource(doc, 0, end, "itemize");
  assert.equal(
    apply(doc, edit),
    "\\begin{itemize}\n  \\item First\n  \\item Second\n\\end{itemize}\nUntouched",
  );
  assert.equal(
    apply(
      apply(doc, edit),
      formatSource(apply(doc, edit), 0, edit.text.length, "itemize"),
    ),
    doc,
  );
  const comments = formatSource(doc, 0, end, "comment"),
    commented = apply(doc, comments);
  assert.equal(commented, "% First\n% Second\nUntouched");
  assert.equal(
    apply(
      commented,
      formatSource(commented, 0, comments.text.length, "comment"),
    ),
    doc,
  );
});
test("source tool transactions form one Undo event and restore the original selection, then Redo exactly", () => {
  let state = EditorState.create({
    doc: "Start selected end",
    selection: { anchor: 6, head: 14 },
    extensions: [history(), readOnlyTransactions],
  });
  const original = state.doc.toString(),
    edit = formatSource(original, 6, 14, "bold");
  state = state.update(sourceEditTransaction(edit)).state;
  const formatted = state.doc.toString();
  const target = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
  };
  assert.equal(undo(target), true);
  assert.equal(state.doc.toString(), original);
  assert.equal(state.selection.main.from, 6);
  assert.equal(state.selection.main.to, 14);
  assert.equal(redo(target), true);
  assert.equal(state.doc.toString(), formatted);
  state = state.update({
    changes: { from: state.doc.length, insert: " later" },
    userEvent: "input.type",
  }).state;
  assert.equal(undo(target), true);
  assert.equal(state.doc.toString(), formatted);
  assert.equal(undo(target), true);
  assert.equal(state.doc.toString(), original);
});
test("source tools cannot mutate a read-only AI target even through a direct transaction", () => {
  const state = EditorState.create({
    doc: "Locked",
    extensions: [EditorState.readOnly.of(true), readOnlyTransactions],
  });
  assert.equal(
    state
      .update(sourceEditTransaction(formatSource("Locked", 0, 6, "bold")))
      .state.doc.toString(),
    "Locked",
  );
});
test("block insertion keeps surrounding source intact and gives floats their own lines", () => {
  const edit = blockInsertion(
    "Before SELECT after",
    7,
    13,
    "\\begin{table}\n\\end{table}",
  );
  assert.equal(
    apply("Before SELECT after", edit),
    "Before \n\\begin{table}\n\\end{table}\n after",
  );
  assert.equal(blockInsertion("Before\nAfter", 7, 7, "BLOCK").text, "BLOCK\n");
});
test("math templates produce compilable starter rows and select the first placeholder", () => {
  const source = "Before.\n\nAfter.";
  const pos = source.indexOf("\n") + 1;
  const matrix = formatSource(source, pos, pos, "matrix");
  assert.equal(
    matrix.text,
    String.raw`\[
\begin{pmatrix}
  a & b \\
  c & d
\end{pmatrix}
\]`,
  );
  const text = apply(source, matrix);
  assert.equal(
    text.slice(matrix.selection!.anchor, matrix.selection!.head),
    "a",
  );
  assert.equal(text, "Before.\n" + matrix.text + "\nAfter.");
  assert.equal(
    formatSource("", 0, 0, "aligned").text,
    String.raw`\[
\begin{aligned}
  x &= y + z \\
  w &= y - z
\end{aligned}
\]`,
  );
});
test("a math template preserves selected source inside existing math without nesting delimiters", () => {
  const source = String.raw`Before. \(\alpha^2 + \beta^2\) After.`;
  const from = source.indexOf("\\alpha"),
    to = source.indexOf("\\)");
  const edit = formatSource(source, from, to, "aligned");
  assert.equal(
    edit.text,
    String.raw`\begin{aligned}
  \alpha^2 + \beta^2
\end{aligned}`,
  );
  const text = apply(source, edit);
  assert.equal(
    text.slice(edit.selection!.anchor, edit.selection!.head),
    source.slice(from, to),
  );
  assert.throws(
    () => formatSource(source, from, to + 2, "matrix"),
    /within its delimiters/,
  );
  assert.throws(
    () => formatSource(source, from - 2, to + 2, "matrix"),
    /within its delimiters/,
  );
});
const options: TableOptions = {
  cells: [
    ["Method", "A & B"],
    ["Baseline", "50%"],
  ],
  alignments: ["l", "r"],
  header: true,
  raw: false,
  rules: "minimal",
  caption: "A $ result",
  label: "tab:results",
  placement: "htbp",
  captionAbove: true,
};
test("table generation escapes plain cells and captions, emits complete rows and keeps labels after captions", () => {
  const source = tableSource(options);
  assert.ok(source.includes("\\textbf{Method} & \\textbf{A \\& B} \\\\\n"));
  assert.ok(source.includes("Baseline & 50\\% \\\\\n"));
  assert.ok(source.includes("\\begin{tabular}{lr}"));
  assert.ok(
    source.indexOf("\\caption{A \\$ result}") <
      source.indexOf("\\label{tab:results}"),
  );
  assert.equal((source.match(/\\hline/g) ?? []).length, 3);
});
test("table source mode, alignment, grid and caption position retain chosen semantics and reject invalid dimensions", () => {
  const source = tableSource({
    ...options,
    cells: [["$x$", "\\alpha"]],
    raw: true,
    rules: "grid",
    captionAbove: false,
  });
  assert.ok(source.includes("\\begin{tabular}{|l|r|}"));
  assert.ok(source.includes("\\textbf{$x$}"));
  assert.ok(source.indexOf("\\caption") > source.indexOf("\\end{tabular}"));
  assert.throws(
    () => tableSource({ ...options, cells: [["uneven"]] }),
    /cells/,
  );
  assert.throws(
    () => tableSource({ ...options, label: "bad}\\input{file" }),
    /label/,
  );
  assert.throws(() => tableSource({ ...options, caption: "" }), /caption/);
});
test("figure generation handles nested asset paths with spaces, width, plain captions and reference labels", () => {
  const source = figureSource({
    path: "figures/plot one.png",
    width: 0.8,
    caption: "A & B (50%)",
    label: "fig:one",
    placement: "t",
  });
  assert.ok(
    source.includes(
      "\\includegraphics[width=0.8\\linewidth]{\\detokenize{figures/plot one.png}}",
    ),
  );
  assert.ok(source.includes("\\caption{A \\& B (50\\%)}\n\\label{fig:one}"));
  for (const path of [
    "../outside.png",
    "/outside.png",
    "unsafe%.png",
    "unsafe}.png",
    "figure.svg",
  ])
    assert.throws(
      () =>
        figureSource({
          path,
          width: 0.8,
          caption: "",
          label: "",
          placement: "htbp",
        }),
      /Choose/,
    );
  assert.throws(
    () =>
      figureSource({
        path: "plot.pdf",
        width: 2,
        caption: "",
        label: "",
        placement: "htbp",
      }),
    /width/,
  );
});
test("math-context detection recognizes standard delimiters and environments while ignoring escaped dollars and commented or verbatim math", () => {
  for (const source of [
    "$x",
    "$$x",
    String.raw`\(x`,
    String.raw`\[x`,
    String.raw`\begin{equation*}x`,
    String.raw`\begin{align}x`,
  ])
    assert.equal(inMathMode(source, source.length), true, source);
  for (const source of [
    String.raw`\$5`,
    "$x$ text",
    String.raw`\(x\) text`,
    "% $x",
    "\\begin{verbatim}\n$x\n\\end{verbatim}",
    String.raw`\begin{equation}x\end{equation}`,
  ])
    assert.equal(inMathMode(source, source.length), false, source);
});
test("symbol search covers commands, aliases and categories, preserving control-word boundaries", () => {
  assert.ok(searchSymbols("less equal").some((s) => s.command === "\\leq"));
  assert.equal(searchSymbols("\\alpha", "Greek")[0].command, "\\alpha");
  assert.equal(searchSymbols("alpha", "Arrows").length, 0);
  const alpha = mathSymbols.find((s) => s.command === "\\alpha")!;
  assert.equal(symbolSource(alpha, true), "\\(\\alpha\\)");
  assert.equal(symbolSource(alpha, false, "x"), "\\alpha{}");
  assert.equal(symbolSource(alpha, false, "+"), "\\alpha");
  assert.equal(
    new Set(mathSymbols.map((s) => s.command)).size,
    mathSymbols.length,
  );
});
test("plain text escaping is one-pass so inserted escape commands are not escaped again", () => {
  assert.equal(
    escapeLatexText(String.raw`a\b {c} # & % _ $ ^ ~`),
    String.raw`a\textbackslash{}b \{c\} \# \& \% \_ \$ \textasciicircum{} \textasciitilde{}`,
  );
});
