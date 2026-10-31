import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app";
import { Compartment, EditorState, type Transaction } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import {
  visualProjection,
  visualInput,
  visualSelectionBalanced,
  visualCaret,
  visualEnter,
} from "../src/visual-source";
import { visualEditor, safeMathHtml, tableCells } from "../src/visual-editor";
import {
  readOnlyTransactions,
  sourceEditTransaction,
  internalEdit,
} from "../src/editor-transactions";
const full = String.raw`% \begin{document} in a comment
\documentclass{article}
\newcommand{\custom}[2][default]{#1 and #2}
\begin{document}
\section*[Short]{A \emph{nested} heading} % exact comment
Normal \textbf{bold \textit{and italic}} with \custom[option]{argument}.
\begin{itemize}
  \item First item
  \item Second item
\end{itemize}
$E=mc^2$ and \(\alpha\).
\end{document}
% \end{document} in a comment
`;
test("visual projection keeps exact source coordinates, preamble, custom arguments, comments, nested styles and math", () => {
  const p = visualProjection(full);
  assert.equal(
    full.slice(0, p.body.from),
    full.slice(0, full.indexOf("\\begin{document}\n") + 17),
  );
  assert.equal(full.slice(p.body.to).startsWith("\\end{document}\n%"), true);
  assert.equal(
    p.groups.find((g) => g.style === "heading-1")?.innerFrom,
    full.indexOf("A \\emph"),
  );
  const custom = p.atoms.find((a) => a.label === "\\custom")!;
  assert.equal(
    full.slice(custom.from, custom.to),
    String.raw`\custom[option]{argument}`,
  );
  assert.deepEqual(
    p.atoms.filter((a) => a.kind === "math").map((a) => a.value),
    ["E=mc^2", "\\alpha"],
  );
  assert.equal(p.lines.filter((l) => l.style === "list-item").length, 2);
});
test("visual-mode reconfiguration changes no bytes or history and preserves Undo across modes", () => {
  const mode = new Compartment();
  let state = EditorState.create({
    doc: full,
    extensions: [history(), readOnlyTransactions, mode.of([])],
  });
  const target = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
  };
  state = state.update({
    changes: { from: full.indexOf("Normal"), insert: "More " },
    userEvent: "input.type",
  }).state;
  const changed = state.doc.toString();
  for (let i = 0; i < 6; i++)
    state = state.update({
      effects: mode.reconfigure(
        i % 2 ? [] : visualEditor({ projectId: "synthetic", onSource() {} }),
      ),
    }).state;
  assert.equal(state.doc.toString(), changed);
  assert.equal(undo(target), true);
  assert.equal(state.doc.toString(), full);
  assert.equal(redo(target), true);
  assert.equal(state.doc.toString(), changed);
});
test("visual typing escapes literal LaTeX characters and preserves Unicode, with exact single Undo recovery", () => {
  let state = EditorState.create({
    doc: full,
    selection: { anchor: full.indexOf("Normal") },
    extensions: [
      history(),
      readOnlyTransactions,
      visualEditor({ projectId: "synthetic", onSource() {} }),
    ],
  });
  const from = state.selection.main.head,
    input = "50% & $ _ # { } \\ ~ ^ é 👩🏽‍🔬 中文 ";
  state = state.update({
    changes: { from, insert: input },
    userEvent: "input.type",
  }).state;
  const content = state.doc.toString();
  assert.ok(
    content.includes(
      String.raw`50\% \& \$ \_ \# \{ \} \textbackslash{} \textasciitilde{} \textasciicircum{} é 👩🏽‍🔬 中文 `,
    ),
  );
  assert.ok(content.endsWith(full.slice(from)));
  const target = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
  };
  assert.equal(undo(target), true);
  assert.equal(state.doc.toString(), full);
  assert.equal(state.selection.main.head, from);
});
test("deleting across part of a style retains balanced commands; deleting a whole group removes it", () => {
  const doc = String.raw`Before \textbf{bold words} after`,
    p = visualProjection(doc);
  const from = doc.indexOf("Before"),
    to = doc.indexOf("words");
  const result = EditorState.create({ doc })
    .update(visualInput(doc, p, [{ from, to, text: "New " }]))
    .state.doc.toString();
  assert.equal(result, String.raw`New \textbf{words} after`);
  const group = p.groups[0];
  assert.equal(
    EditorState.create({ doc })
      .update(
        visualInput(doc, p, [{ from: group.from, to: group.to, text: "" }]),
      )
      .state.doc.toString(),
    "Before  after",
  );
  assert.equal(
    visualSelectionBalanced(p, doc.indexOf("words"), group.to),
    false,
  );
});
test("replacing the visible body preserves all document setup and footer bytes while removing selected structures", () => {
  const p = visualProjection(full),
    state = EditorState.create({ doc: full }).update(
      visualInput(full, p, [
        { from: p.body.from, to: p.body.to, text: "A fresh body.\n" },
      ]),
    ).state;
  assert.equal(
    state.doc.toString(),
    full.slice(0, p.body.from) + "A fresh body.\n" + full.slice(p.body.to),
  );
});
test("source fragment edits bypass literal escaping and remain blocked under AI read-only locks", () => {
  const source = String.raw`A \custom{original} B`,
    p = visualProjection(source),
    atom = p.atoms[0];
  let state = EditorState.create({
    doc: source,
    extensions: [
      readOnlyTransactions,
      visualEditor({ projectId: "synthetic", onSource() {} }),
    ],
  });
  const edit = sourceEditTransaction({
    from: atom.from,
    to: atom.to,
    text: String.raw`\custom[new]{replacement}`,
  });
  assert.equal(
    state.update(edit).state.doc.toString(),
    String.raw`A \custom[new]{replacement} B`,
  );
  state = EditorState.create({
    doc: source,
    extensions: [
      EditorState.readOnly.of(true),
      readOnlyTransactions,
      visualEditor({ projectId: "synthetic", onSource() {} }),
    ],
  });
  for (const event of ["input.type", "input.paste", "delete.backward"])
    assert.equal(
      state
        .update({
          changes: { from: 0, to: 1, insert: "changed" },
          userEvent: event,
        })
        .state.doc.toString(),
      source,
    );
  assert.equal(state.update(edit).state.doc.toString(), source);
  const ai = String.raw`\textbf{AI text} and \(\alpha\)`;
  assert.equal(
    state
      .update({
        changes: { from: 0, to: source.length, insert: ai },
        userEvent: "input.type.ai",
        annotations: internalEdit.of(true),
      })
      .state.doc.toString(),
    ai,
  );
});
test("partial selection of a custom atom removes the complete command rather than leaving malformed arguments", () => {
  const doc = String.raw`A \custom[option]{argument} B`,
    p = visualProjection(doc),
    from = doc.indexOf("option"),
    to = doc.indexOf("argument") + 3;
  assert.equal(
    EditorState.create({ doc })
      .update(visualInput(doc, p, [{ from, to, text: "replacement" }]))
      .state.doc.toString(),
    "A replacement B",
  );
  const atom = p.atoms[0];
  assert.equal(
    EditorState.create({ doc })
      .update(
        visualInput(doc, p, [
          { from: atom.from + 4, to: atom.from + 4, text: "new" },
        ]),
      )
      .state.doc.toString(),
    String.raw`A \custom[option]{argument}new B`,
  );
  const names = visualProjection(
    String.raw`\constructor{x} \toString{y} \hasOwnProperty{z}`,
  );
  assert.equal(names.atoms.length, 3);
  assert.equal(names.groups.length, 0);
});
test("visual caret leaves opaque source fragments and remains inside the document body", () => {
  const p = visualProjection(full),
    atom = p.atoms.find((a) => a.label === "\\custom")!;
  assert.equal(visualCaret(p, atom.from + 3), atom.to);
  assert.equal(visualCaret(p, 0), p.body.from + "\\section*[Short]{".length);
  assert.equal(visualCaret(p, full.length), p.body.to);
});
test("Enter splits headings and list items without unbalancing nested formatting and replaces selected text", () => {
  const source = String.raw`\section[Short]{First \textbf{bold words} last}`;
  const at = source.indexOf("words"),
    edit = visualEnter(source, visualProjection(source), at, at)!;
  const state = EditorState.create({ doc: source }).update(
    sourceEditTransaction(edit),
  ).state;
  assert.equal(
    state.doc.toString(),
    String.raw`\section[Short]{First \textbf{bold }}` +
      "\n\n" +
      String.raw`\textbf{words} last`,
  );
  const plain = String.raw`\section{First selected last}`,
    from = plain.indexOf("selected");
  const replacement = visualEnter(
    plain,
    visualProjection(plain),
    from,
    from + 8,
  )!;
  assert.equal(
    EditorState.create({ doc: plain })
      .update(sourceEditTransaction(replacement))
      .state.doc.toString(),
    "\\section{First }\n\n last",
  );
  const list = "\\begin{itemize}\n  \\item First second\n\\end{itemize}",
    caret = list.indexOf("second");
  const next = visualEnter(list, visualProjection(list), caret, caret)!;
  assert.equal(
    EditorState.create({ doc: list })
      .update(sourceEditTransaction(next))
      .state.doc.toString(),
    "\\begin{itemize}\n  \\item First \n  \\item second\n\\end{itemize}",
  );
});
test("malformed, verbatim and deeply nested input remain inspectable without parser failures", () => {
  for (const doc of [
    "\\textbf{unfinished",
    "\\begin{custom}\nUnfinished",
    "\\begin{verbatim}\n% { \\textbf{x}\n\\end{verbatim}",
    "\\textbf{".repeat(100) + "X" + "}".repeat(100),
  ]) {
    const p = visualProjection(doc);
    assert.ok(
      p.atoms.every((a) => a.from >= 0 && a.to <= doc.length && a.from < a.to),
    );
    assert.ok(p.protected.every((a) => a.from >= 0 && a.to <= doc.length));
  }
});
test("figure paths with spaces and table-cell source offsets are retained for isolated source editing", () => {
  const doc = String.raw`\begin{figure}\includegraphics[width=.5\linewidth]{\detokenize{figures/plot one.png}}\caption{Example}\end{figure}`;
  assert.equal(visualProjection(doc).atoms[0].asset, "figures/plot one.png");
  const table = String.raw`\begin{table}
\begin{tabular}{lr}
\hline
\textbf{Method} & Score \\
\hline
A \& B & $x$ \\
\hline
\end{tabular}
\end{table}`;
  const cells = tableCells(table);
  assert.equal(cells.length, 2);
  assert.equal(cells[0].length, 2);
  assert.equal(
    table.slice(cells[1][0].from, cells[1][0].to),
    String.raw`A \& B`,
  );
  assert.equal(cells[0][0].text, "Method");
});
test("math previews have MathML, reject active HTML/URLs, bound macro expansion and isolate definitions", () => {
  assert.match(safeMathHtml("E=mc^2"), /<math/);
  assert.doesNotMatch(
    safeMathHtml(String.raw`\href{javascript:alert(1)}{click}`),
    /<a\b|href=/,
  );
  assert.doesNotMatch(
    safeMathHtml(
      String.raw`\htmlStyle{background:url(https://example.test)}{x}`,
    ),
    /style="background|<img\b|<iframe\b/,
  );
  assert.throws(() => safeMathHtml(String.raw`\def\x{\x}\x`));
  safeMathHtml(String.raw`\gdef\customunique{x}\customunique`);
  assert.throws(() => safeMathHtml(String.raw`\customunique`));
});

test("editor-view preference survives restart and changes no project source or history", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-visual-pref-"));
  let current = await createApp(root, { seed: false, dist: "/nonexistent" });
  try {
    const project = current.store.create("Synthetic", [
      { path: "main.tex", data: Buffer.from(full) },
    ]);
    const before = current.store.project(project.id),
      count = current.store.checkpoints(project.id).length;
    const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
    const put = await current.app.inject({
      method: "PUT",
      url: "/api/settings/preferences",
      headers,
      payload: { editorView: "visual" },
    });
    assert.equal(put.statusCode, 200);
    await current.app.close();
    current = await createApp(root, { seed: false, dist: "/nonexistent" });
    const settings = await current.app.inject({
      method: "GET",
      url: "/api/settings",
      headers,
    });
    assert.equal(settings.json().preferences.editorView, "visual");
    await current.app.inject({
      method: "PUT",
      url: "/api/settings/preferences",
      headers,
      payload: { editorView: "invalid" },
    });
    assert.equal(current.store.setting("preferences", {}).editorView, "visual");
    assert.deepEqual(current.store.project(project.id), before);
    assert.equal(current.store.checkpoints(project.id).length, count);
    assert.equal(current.store.readText(project.id, "main.tex").content, full);
  } finally {
    await current.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
