import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import { sourceEditTransaction } from "../src/editor-transactions";
import {
  parseTable,
  tableResult,
  editTableCell,
  tableRow,
  tableColumn,
  tableColumnStyle,
  mergeTableCells,
  unmergeTableCell,
  tableBorders,
  tableCaption,
  editTableCaption,
  tableSelection,
} from "../src/table-source";
const source = String.raw`\begin{table}[htbp]
% Keep this comment and custom caption option.
\centering
\caption[Short]{A \textbf{nested} caption}\label{tab:original}
\begin{tabular}{|lr|}
\hline
\textbf{Method} & Score \\[2pt]
\hline
A \& B & $x$ \\
\hline
\end{tabular}
\end{table}`;
test("table drafts preserve every byte until an explicit operation, including CRLF, declarations and comments", () => {
  for (const s of [source, source.replaceAll("\n", "\r\n")]) {
    const t = parseTable(s);
    assert.equal(t.source, s);
    assert.equal(t.rows.length, 2);
    assert.equal(t.columns.length, 2);
    assert.equal(t.rows[1].cells[0].text, String.raw`A \& B`);
    assert.equal(s.slice(t.rows[0].to, t.rows[0].end), String.raw`\\[2pt]`);
    const c = t.rows[1].cells[0],
      edited = editTableCell(t, 1, 0, "Café α");
    assert.equal(
      edited,
      s.slice(0, c.contentFrom) + "Café α" + s.slice(c.contentTo),
    );
    assert.equal(tableCaption(t)?.text, String.raw`A \textbf{nested} caption`);
  }
});
test("literal cells handle nested formatting, escaped separators, comments, math and empty final cells", () => {
  const s = String.raw`\begin{tabular}{lc}
\textbf{A {B} \& C} & $x_{a\&b}$ \\ % row comment
% another comment
one % cell comment
 & \\
\end{tabular}`;
  const t = parseTable(s);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].cells[0].text, String.raw`\textbf{A {B} \& C}`);
  const edit = editTableCell(t, 1, 0, "new % still a comment");
  assert.equal(parseTable(edit).rows.length, 2);
  assert.match(edit, /new % still a comment\n/);
  assert.throws(() => editTableCell(t, 0, 0, "A & B"), /balanced|cell cannot/);
  assert.throws(() => editTableCell(t, 0, 0, "{unbalanced"), /balanced/);
});
test("row controls retain existing source, final-row terminators and recoverable bounds", () => {
  let t = parseTable(source),
    next = tableRow(t, 0, "before");
  assert.equal(parseTable(next).rows.length, 3);
  assert.ok(next.includes(source.slice(t.rows[0].from, t.rows[0].end)));
  next = tableRow(parseTable(next), 0, "delete");
  assert.deepEqual(
    parseTable(next).rows.map((r) => r.cells.map((c) => c.text)),
    t.rows.map((r) => r.cells.map((c) => c.text)),
  );
  const unterminated = String.raw`\begin{tabular}{lc}A&B\end{tabular}`;
  next = tableRow(parseTable(unterminated), 0, "after");
  assert.equal(parseTable(next).rows.length, 2);
  assert.throws(
    () => tableRow(parseTable(unterminated), 0, "delete"),
    /at least one/,
  );
  next = tableRow(t, 1, "after");
  assert.equal(parseTable(next).rows.length, 3);
});
test("column controls preserve caption, custom declarations and row spacing", () => {
  for (const action of ["before", "after"] as const)
    for (const index of [0, 1]) {
      const next = tableColumn(parseTable(source), index, action),
        t = parseTable(next);
      assert.equal(t.columns.length, 3);
      assert.equal(t.rows[0].cells.length, 3);
      assert.ok(next.includes(String.raw`\\[2pt]`));
      assert.ok(next.includes(String.raw`\caption[Short]`));
      const removed = tableColumn(
        t,
        action === "before" ? index : index + 1,
        "delete",
      );
      assert.deepEqual(
        parseTable(removed).rows.map((r) => r.cells.map((c) => c.text)),
        parseTable(source).rows.map((r) => r.cells.map((c) => c.text)),
      );
    }
  const custom = String.raw`\begin{tabular}{|>{\bfseries}l<{\strut}p{3cm}|}A&B\\\end{tabular}`;
  const t = parseTable(custom),
    next = tableColumnStyle(t, 1, "m", String.raw`.25\linewidth`);
  assert.ok(next.includes(String.raw`>{\bfseries}l<{\strut}m{.25\linewidth}`));
  assert.throws(() => tableColumnStyle(t, 1, "p", "}c{"), /balanced/);
  assert.throws(() => tableColumnStyle(t, 1, "p", "3cm%"), /balanced/);
});
test("horizontal merging and unmerging retain content and exact merged-cell edit offsets", () => {
  const merged = mergeTableCells(parseTable(source), 1, 0, 1),
    t = parseTable(merged);
  assert.equal(t.rows[1].cells.length, 1);
  assert.equal(t.rows[1].cells[0].span, 2);
  assert.equal(t.rows[1].cells[0].text, String.raw`A \& B $x$`);
  const changed = editTableCell(t, 1, 0, String.raw`\textit{Both}`);
  assert.ok(changed.includes(String.raw`\multicolumn{2}{|l|}{\textit{Both}}`));
  const split = parseTable(unmergeTableCell(parseTable(changed), 1, 0));
  assert.equal(split.rows[1].cells.length, 2);
  assert.equal(split.rows[1].cells[0].text, String.raw`\textit{Both}`);
  assert.throws(() => tableColumn(t, 0, "delete"), /Unmerge/);
  assert.throws(() => tableBorders(t, "grid"), /Unmerge/);
});
test("selection follows logical columns across merge, unmerge and draft history without highlighting the following cell", () => {
  const initial = parseTable(
      String.raw`\begin{tabular}{lcr}A&B&C\\D&E&F\\\end{tabular}`,
    ),
    merged = parseTable(mergeTableCells(initial, 0, 0, 1)),
    unmerged = parseTable(unmergeTableCell(merged, 0, 0));
  for (const t of [merged, unmerged, merged, initial]) {
    assert.deepEqual(tableSelection(t, 0, 0), { row: 0, first: 0, last: 0 });
  }
  assert.deepEqual(tableSelection(merged, 0, 1), { row: 0, first: 0, last: 0 });
  assert.deepEqual(tableSelection(merged, 0, 2), { row: 0, first: 1, last: 1 });
  assert.deepEqual(tableSelection(initial, 100, 100), {
    row: 1,
    first: 2,
    last: 2,
  });
});
test("border presets preserve comments and custom declarations; partial-width rules block destructive operations", () => {
  const commented = String.raw`\begin{tabular}{|l % Preserve | inside this comment.
  |r|}A&B\\\end{tabular}`;
  for (const style of ["none", "grid", "booktabs"] as const)
    assert.ok(
      tableBorders(parseTable(commented), style).includes(
        "% Preserve | inside this comment.",
      ),
    );
  for (const kind of ["none", "grid", "booktabs"] as const) {
    const next = tableBorders(parseTable(source), kind),
      t = parseTable(next);
    assert.equal(t.rows.length, 2);
    assert.ok(next.includes("% Keep this comment"));
    assert.ok(next.includes(String.raw`\label{tab:original}`));
    if (kind === "none") assert.equal(t.rules.length, 0);
    if (kind === "grid") {
      assert.equal(t.rules.filter((r) => r.name === "hline").length, 3);
      assert.equal(next.slice(t.specFrom, t.specTo), "|l|r|");
    }
    if (kind === "booktabs")
      assert.deepEqual(
        t.rules.map((r) => r.name),
        ["toprule", "midrule", "bottomrule"],
      );
  }
  const partial = parseTable(
    String.raw`\begin{tabular}{lc}\cline{1-2}A&B\\\end{tabular}`,
  );
  assert.equal(partial.structural, false);
  assert.throws(() => tableColumn(partial, 0, "delete"), /Partial-width/);
  assert.throws(() => tableBorders(partial, "none"), /Partial-width/);
  assert.ok(
    editTableCell(partial, 0, 0, "C").includes(String.raw`\cline{1-2}`),
  );
});
test("caption edits preserve short captions, labels and surrounding source; nested/custom captions remain source-only", () => {
  const t = parseTable(source),
    c = tableCaption(t)!;
  assert.equal(
    editTableCaption(t, "New caption"),
    source.slice(0, c.textFrom) + "New caption" + source.slice(c.textTo),
  );
  assert.equal(
    tableCaption(
      parseTable(
        source
          .replace(String.raw`\centering`, String.raw`\begin{center}`)
          .replace(
            String.raw`\end{table}`,
            String.raw`\end{center}\end{table}`,
          ),
      ),
    ),
    null,
  );
  assert.throws(() => editTableCaption(t, "A}B{"), /balanced/);
});
test("unsupported and malicious-looking custom structure stays opaque without running TeX", () => {
  for (const s of [
    String.raw`\begin{tabular}{*{2}{c}}A&B\\\end{tabular}`,
    String.raw`\begin{tabularx}{\linewidth}{XX}A&B\\\end{tabularx}`,
    String.raw`\begin{tabular}{lc}\multirow{2}{*}{A}&B\\\end{tabular}`,
    String.raw`\begin{tabular}{lc}\verb|a&b|&B\\\end{tabular}`,
    String.raw`\begin{tabular}{lc}\begin{tabular}{c}A\end{tabular}&B\\\end{tabular}`,
    String.raw`\begin{tabular}{Q}A\\\end{tabular}`,
  ]) {
    const result = tableResult(s);
    assert.equal(result.table, null);
    assert.match(result.error, /source/i);
  }
  assert.throws(() => parseTable("x".repeat(100001)), /too large/);
});
test("table Apply is one isolated source transaction and exact Undo/Redo preserves selection", () => {
  const doc = "Before\n" + source + "\nAfter",
    from = 7,
    to = from + source.length;
  let state = EditorState.create({
    doc,
    selection: { anchor: from + 10, head: from + 20 },
    extensions: history(),
  });
  const initial = state.selection.main.toJSON(),
    next = tableColumn(parseTable(source), 0, "after");
  state = state.update(
    sourceEditTransaction({
      from,
      to,
      text: next,
      selection: { anchor: from + next.length, head: from + next.length },
    }),
  ).state;
  const dispatch = (tr: any) => {
    state = tr.state;
  };
  assert.equal(undo({ state, dispatch }), true);
  assert.equal(state.doc.toString(), doc);
  assert.deepEqual(state.selection.main.toJSON(), initial);
  assert.equal(redo({ state, dispatch }), true);
  assert.equal(state.doc.toString(), "Before\n" + next + "\nAfter");
});
