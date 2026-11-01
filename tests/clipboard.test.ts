import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import { ClipboardFragments } from "../server/clipboard";
import { htmlToLatex } from "../src/rich-clipboard";
import { clipboardId } from "../src/clipboard-formats";
import {
  clipboardHasSetup,
  visualCopiedSource,
  clipboardPresentation,
  visualPasteTransaction,
} from "../src/visual-clipboard";
import { readOnlyTransactions } from "../src/editor-transactions";
import { parseTable, tableColumnStyle } from "../src/table-source";
import { createApp } from "../server/app";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prepareClipboard } from "../src/prepare-clipboard";
import type { ClipboardPacket } from "../src/editor-clipboard";
const id = (n = 0) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("ordinary paste preserves trusted source directly, previews code-to-Visual/expired copies, and prefers editable HTML over bitmap fallbacks", async () => {
  const packet: ClipboardPacket = {
    source: "",
    from: 0,
    to: 0,
    visual: true,
    html: "",
    plain: "A & B",
    rawLatex: "",
    id: null,
  };
  assert.equal((await prepareClipboard(packet)).latex, String.raw`A \& B`);
  const owned = { ...packet, id: id(), rawLatex: "untrusted alternate" },
    latex = String.raw`\custom{exact}`;
  const direct = await prepareClipboard(owned, async () => ({
    latex,
    mode: "visual",
  }));
  assert.equal(direct.review, false);
  assert.equal(direct.latex, latex);
  assert.equal(
    (await prepareClipboard(owned, async () => ({ latex, mode: "code" })))
      .review,
    true,
  );
  const expired = await prepareClipboard(owned, async () => {
    throw new Error("Expired");
  });
  assert.equal(expired.review, true);
  assert.equal(expired.latex, "");
  assert.equal(expired.packet.lookupError, "Expired");
  const combined = await prepareClipboard({
    ...packet,
    html: "<table><tr><td>A</td></tr></table>",
    image: {} as File,
  });
  assert.equal(combined.review, false);
  assert.match(combined.latex, /\\begin\{tabular\}/);
  assert.equal(
    (await prepareClipboard({ ...packet, image: {} as File })).review,
    true,
  );
  assert.equal(
    (
      await prepareClipboard({
        ...packet,
        html: '<img src="https://invalid.test/image">',
      })
    ).review,
    true,
  );
});
test("Prism copy records are exact, immutable, bounded, expire and never survive restart", () => {
  let now = 0;
  const cache = new ClipboardFragments(() => now),
    latex = String.raw`\custom{Café α} % preserve`;
  cache.set({ id: id(), latex, mode: "visual" });
  assert.deepEqual(cache.get(id()), { latex, mode: "visual" });
  assert.throws(
    () => cache.set({ id: id(), latex: "changed", mode: "code" }),
    /already registered/,
  );
  assert.throws(
    () => cache.set({ id: "../source", latex, mode: "visual" }),
    /256 KB/,
  );
  assert.throws(
    () => cache.set({ id: id(2), latex: "😀".repeat(70000), mode: "code" }),
    /256 KB/,
  );
  for (let i = 1; i <= 65; i++)
    cache.set({ id: id(i), latex: "x", mode: "code" });
  assert.throws(() => cache.get(id()), /expired/);
  assert.throws(() => new ClipboardFragments().get(id(65)), /expired/);
  now = ClipboardFragments.ttl;
  assert.throws(() => cache.get(id(65)), /expired/);
});
test("local clipboard APIs enforce origin/header confinement, keep copies out of project history/exports and clear on restart", async (t) => {
  const root = path.resolve("data/verification/clipboard-api-" + randomUUID());
  let env = await createApp(root, { seed: false });
  t.after(() => env.app.close());
  const p = env.store.create("Synthetic clipboard API", [
      { path: "main.tex", data: Buffer.from("Original source.") },
    ]),
    versions = env.store.checkpoints(p.id).length,
    headers = {
      host: "127.0.0.1:5173",
      origin: "http://127.0.0.1:5173",
      "x-prism-request": "1",
    },
    payload = { id: id(), latex: "PRIVATE COPY ONLY", mode: "visual" };
  assert.equal(
    (
      await env.app.inject({
        method: "POST",
        url: "/api/clipboard/fragments",
        headers: { ...headers, origin: "https://untrusted.invalid" },
        payload,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await env.app.inject({
        method: "POST",
        url: "/api/clipboard/fragments",
        headers: { host: headers.host },
        payload,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await env.app.inject({
        method: "POST",
        url: "/api/clipboard/fragments",
        headers,
        payload,
      })
    ).statusCode,
    200,
  );
  const response = await env.app.inject({
    url: "/api/clipboard/fragments/" + id(),
    headers,
  });
  assert.deepEqual(response.json(), {
    latex: payload.latex,
    mode: payload.mode,
  });
  assert.equal(env.store.checkpoints(p.id).length, versions);
  assert.deepEqual(
    env.store
      .exportFiles(p.id)
      .map((f) => ({ path: f.path, text: f.data.toString() })),
    [{ path: "main.tex", text: "Original source." }],
  );
  await env.app.close();
  env = await createApp(root, { seed: false });
  assert.equal(
    (await env.app.inject({ url: "/api/clipboard/fragments/" + id(), headers }))
      .statusCode,
    404,
  );
});
test("clipboard metadata distinguishes editable HTML from single-image fallbacks without fetching images", () => {
  const one = htmlToLatex(
    '<img src="https://untrusted.invalid/image" alt="Figure">',
  );
  assert.equal(one.images, 1);
  assert.equal(one.hasText, false);
  const combined = htmlToLatex(
    '<p>Editable text</p><img src="https://untrusted.invalid/image" alt="Figure">',
  );
  assert.equal(combined.hasText, true);
  assert.equal(combined.images, 1);
  const table = htmlToLatex("<table><tr><td></td></tr></table>");
  assert.equal(table.tables, 1);
  assert.equal(table.hasText, false);
});
test("Visual copies never expose or cut protected document setup, and opaque markup stays escaped in previews", () => {
  const s = String.raw`\documentclass{article}
\begin{document}
Text \custom{<img src="bad" onerror="x">}.
\end{document}`;
  const early = visualCopiedSource(s, 0, 3),
    late = visualCopiedSource(s, s.length - 2, s.length);
  assert.equal(early.latex, "");
  assert.equal(early.from, early.to);
  assert.equal(late.latex, "");
  assert.equal(late.from, late.to);
  const p = clipboardPresentation(
    String.raw`\custom{<img src="bad" onerror="x">}`,
  );
  assert.doesNotMatch(p.html, /<img|<script/);
  assert.match(p.html, /&lt;img/);
});
test("only an opaque copy identity is recovered from HTML; source-looking attributes are never trusted", () => {
  assert.equal(clipboardId(`<div data-prism-clip="${id()}">x</div>`), id());
  assert.equal(
    clipboardId('<div data-prism-latex="\\input{private}">x</div>'),
    null,
  );
  assert.equal(clipboardId("", id(2)), id(2));
  assert.equal(clipboardId("", "../../foo"), null);
});
test("formatted HTML becomes escaped LaTeX for nested styles, headings, lists, symbols and links", () => {
  const r = htmlToLatex(
    '<h2>Heading &amp; scope</h2><p><strong>Bold <em>inner</em></strong>, <u>under</u>, <code>a_b</code>, $50 &amp; 10%.</p><ol><li>One<ul><li>Nested</li></ul></li><li>Two</li></ol><p><a href="https://example.org/a?x=1&amp;y=2#part">Link</a></p>',
  );
  assert.match(r.latex, /\\subsection\{Heading \\& scope\}/);
  assert.ok(r.latex.includes(String.raw`\textbf{Bold \textit{inner}}`));
  assert.ok(r.latex.includes(String.raw`\texttt{a\_b}`));
  assert.ok(r.latex.includes(String.raw`\$50 \& 10\%.`));
  assert.match(r.latex, /\\begin\{enumerate\}/);
  assert.match(r.latex, /\\begin\{itemize\}/);
  assert.deepEqual(r.packages, ["hyperref"]);
  assert.match(r.latex, /y=2\\#part/);
  assert.equal(r.block, true);
});
test("clipboard parsing never fetches or executes active/hidden content and cannot smuggle TeX through markup", (t) => {
  const request = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected request");
  });
  const r = htmlToLatex(
    '<script>execute()</script><style>secret()</style><iframe src="https://bad.invalid"></iframe><p hidden>secret</p><p style="display:none">hidden</p><p onclick="x()">\\input{secret} &amp; safe<img src="https://bad.invalid/x" alt="diagram"><a href="javascript:evil()"> bad link</a></p>',
  );
  assert.doesNotMatch(r.latex, /execute|secret\(\)|hidden|javascript:/);
  assert.ok(r.latex.includes(String.raw`\textbackslash{}input\{secret\}`));
  assert.doesNotMatch(r.plain, /execute|secret\(\)|hidden/);
  assert.match(r.plain, /diagram/);
  assert.equal(request.mock.callCount(), 0);
  assert.match(r.warnings.join(" "), /Images.*not fetched/);
  assert.match(r.warnings.join(" "), /links.*text/);
  assert.match(r.warnings.join(" "), /formatting is not preserved/);
});
test("code blocks preserve spaces/tabs/newlines while literal environment endings stay escaped", () => {
  const r = htmlToLatex(
    "<pre>\tif a_b:\n  \\end{verbatim}\n &lt;script&gt;</pre>",
  );
  assert.ok(r.latex.includes(String.raw`\textbackslash{}end\{verbatim\}`));
  assert.ok(r.latex.includes(String.raw`\ \ \ \ if`));
  assert.doesNotMatch(r.latex, /\\begin\{verbatim\}/);
});
test("HTML tables preserve headings, horizontal spans, captions and widths in editable literal tabular source", () => {
  const r = htmlToLatex(
      '<table><caption>Trial &amp; result</caption><tr><th colspan="2">Both</th><th>Score</th></tr><tr><td style="width:30%;text-align:left">A</td><td><em>B</em></td><td>12</td></tr></table>',
    ),
    t = parseTable(r.latex);
  assert.equal(r.tables, 1);
  assert.equal(t.rows.length, 2);
  assert.equal(t.columns.length, 3);
  assert.equal(t.rows[0].cells[0].span, 2);
  assert.equal(t.rows[1].cells[1].text, String.raw`\textit{B}`);
  assert.match(r.latex, /p\{0\.300\\linewidth\}/);
  assert.match(r.latex, /\\caption\{Trial \\& result\}/);
});
test("table borders and vertical spans have explicit source/package support without overlapping cells", () => {
  const r = htmlToLatex(
    '<table border="1"><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>',
  );
  assert.ok(r.latex.includes(String.raw`\multirow{2}{*}{A}`));
  assert.deepEqual(r.packages, ["multirow"]);
  assert.match(r.latex, /\\hline/);
  assert.throws(
    () => htmlToLatex('<table><tr><td rowspan="3">A</td></tr></table>'),
    /spans/,
  );
  assert.throws(
    () =>
      htmlToLatex(
        "<table><tr><td><table><tr><td>X</td></tr></table></td></tr></table>",
      ),
    /Nested/,
  );
});
test("clipboard bounds reject oversized, deep, sprawling or malformed tables before source changes", () => {
  assert.throws(() => htmlToLatex("x".repeat(1024 * 1024 + 1)), /1 MB/);
  assert.throws(
    () => htmlToLatex("<div>".repeat(70) + "text" + "</div>".repeat(70)),
    /nested/,
  );
  assert.throws(
    () => htmlToLatex('<table><tr><td colspan="25">x</td></tr></table>'),
    /spans/,
  );
  assert.throws(
    () =>
      htmlToLatex(
        "<table>" +
          Array(101).fill("<tr><td>x</td></tr>").join("") +
          "</table>",
      ),
    /100 rows/,
  );
});
test("Visual copies keep complete custom commands, equations, Unicode and exact full source", () => {
  const body = String.raw`Hello \textbf{nested \emph{Café}} \custom[opt]{a{b}} and $x_1$ \& 10\%.`,
    source =
      "\\documentclass{article}\n\\begin{document}\n" +
      body +
      "\n\\end{document}\n",
    from = source.indexOf(body);
  assert.equal(
    visualCopiedSource(source, from, from + body.length).latex,
    body,
  );
  const at = source.indexOf("a{b}");
  assert.equal(
    visualCopiedSource(source, at, at + 1).latex,
    String.raw`\custom[opt]{a{b}}`,
  );
  const p = clipboardPresentation(body);
  assert.match(p.html, /<strong>nested <em>Café<\/em><\/strong>/);
  assert.match(p.plain, /Hello nested Café/);
  assert.match(p.plain, /\\custom/);
  assert.doesNotMatch(p.html, /<img|<script/);
});
test("partial styled selections copy balanced formatting, including a range crossing a group boundary", () => {
  const s = String.raw`Before \textbf{bold \emph{inner} tail} after`,
    a = s.indexOf("nner"),
    b = s.indexOf(" after") + 3;
  assert.equal(
    visualCopiedSource(s, a, b).latex,
    String.raw`\textbf{\emph{nner} tail} af`,
  );
  const inside = s.indexOf("old");
  assert.equal(
    visualCopiedSource(s, inside, inside + 3).latex,
    String.raw`\textbf{old}`,
  );
});
test("list copies wrap multi-item fragments and keep a single prose selection inline", () => {
  const s = String.raw`\begin{itemize}
\item First item
\item Second item
\end{itemize}`;
  const a = s.indexOf("First"),
    b = s.indexOf("Second") + 6;
  assert.equal(visualCopiedSource(s, a, a + 5).latex, "First");
  const r = visualCopiedSource(s, a, b).latex;
  assert.match(r, /^\\begin\{itemize\}\\item First/);
  assert.match(r, /\\item Second\\end\{itemize\}$/);
});
test("formatted paste inside nested inline styles and headings keeps balanced surrounding source", () => {
  for (const s of [
    String.raw`\textbf{Left \emph{inner right} tail}`,
    String.raw`\section{Left \textbf{inner right} tail}`,
  ]) {
    const at = s.indexOf(" right"),
      tr = EditorState.create({ doc: s }).update(
        visualPasteTransaction(
          s,
          at,
          at,
          "\\section{Pasted}\nParagraph.",
          true,
        ),
      );
    const doc = tr.newDoc.toString();
    assert.ok(doc.includes("\\section{Pasted}"));
    assert.equal(
      (doc.match(/\{/g) ?? []).length,
      (doc.match(/\}/g) ?? []).length,
    );
    assert.ok(doc.includes("right"));
    assert.equal(tr.state.selection.main.empty, true);
  }
});
test("reviewed paste replaces a captured selection and exact one-step Undo/Redo restores source and selection", () => {
  const source = String.raw`\documentclass{article}
\begin{document}
Left \textbf{old selected text} right.
\end{document}`,
    from = source.indexOf("old"),
    to = from + "old selected".length;
  let state = EditorState.create({
    doc: source,
    selection: { anchor: to, head: from },
    extensions: [history(), readOnlyTransactions],
  });
  const selection = state.selection.main.toJSON();
  state = state.update(
    visualPasteTransaction(
      source,
      from,
      to,
      String.raw`\textit{New \& precise}`,
      false,
    ),
  ).state;
  assert.ok(
    state.doc
      .toString()
      .includes(String.raw`\textbf{\textit{New \& precise} text}`),
  );
  const next = state.doc.toString(),
    dispatch = (tr: any) => {
      state = tr.state;
    };
  assert.equal(undo({ state, dispatch }), true);
  assert.equal(state.doc.toString(), source);
  assert.deepEqual(state.selection.main.toJSON(), selection);
  assert.equal(redo({ state, dispatch }), true);
  assert.equal(state.doc.toString(), next);
  const locked = EditorState.create({
    doc: source,
    extensions: [EditorState.readOnly.of(true), readOnlyTransactions],
  });
  assert.equal(
    locked
      .update(visualPasteTransaction(source, from, to, "Blocked", false))
      .newDoc.toString(),
    source,
  );
});

test("paste presentation keeps captions, compact block spacing and literal code without source declarations", () => {
  const content = htmlToLatex(
    '<h2>Heading</h2><p>Paragraph</p><table border="1"><caption>Results</caption><tr><td>A</td></tr></table><pre>first\n  second</pre>',
  );
  const display = clipboardPresentation(content.latex);
  assert.match(display.html, /<caption>Results<\/caption>/);
  assert.doesNotMatch(display.html, /<\/h2>(?:\s*<br>)+/);
  assert.match(display.html, /<pre><code>first\n  second<\/code><\/pre>/);
  assert.doesNotMatch(display.html, /ttfamily|raggedright|↵/);
});
test("Visual source pastes reject document setup while preserving body macros and literal command text", () => {
  for (const latex of [
    String.raw`\documentclass{article}`,
    String.raw`\usepackage{array}`,
    String.raw`\begin{document}Body\end{document}`,
  ]) {
    assert.equal(clipboardHasSetup(latex), true);
    assert.throws(
      () => visualPasteTransaction("Body", 0, 0, latex, false),
      /Code view/,
    );
  }
  assert.equal(
    clipboardHasSetup(String.raw`\custom{\documentclass{nested}}`),
    false,
  );
  assert.equal(clipboardHasSetup("% \\usepackage{comment}\nText"), false);
  assert.equal(
    clipboardHasSetup(String.raw`\textbackslash{}documentclass\{article\}`),
    false,
  );
});
test("pasted cell border declarations follow later column width/alignment edits without losing content", () => {
  const original = htmlToLatex(
    '<table border="1"><tr><td style="text-align:center;width:30%">A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>',
  ).latex;
  const width = tableColumnStyle(parseTable(original), 0, "p", "2.5cm");
  assert.equal((width.match(/p\{2\.5cm\}/g) ?? []).length, 3);
  const right = tableColumnStyle(parseTable(width), 0, "r", "");
  assert.doesNotMatch(right, /centering|p\{2\.5cm\}/);
  assert.match(right, /\\multicolumn\{1\}\{\|r\|\}\{A\}/);
  assert.equal(parseTable(right).rows[1].cells[0].text, "C");
  assert.throws(
    () =>
      tableColumnStyle(
        parseTable(
          String.raw`\begin{tabular}{l}\multicolumn{1}{X}{A}\\\end{tabular}`,
        ),
        0,
        "r",
        "",
      ),
    /custom/,
  );
});

test("default paste reviews every unresolved package requirement before insertion", async () => {
  const base: ClipboardPacket = {
    source: "",
    from: 0,
    to: 0,
    visual: true,
    html: "",
    plain: "",
    rawLatex: "",
    id: null,
  };
  for (const html of [
    '<a href="https://example.org/">Link</a>',
    "<s>Removed</s>",
    '<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>',
  ]) {
    assert.ok(htmlToLatex(html).packages.length);
    assert.equal((await prepareClipboard({ ...base, html })).review, true);
  }
  assert.equal(
    (
      await prepareClipboard({
        ...base,
        html: "<strong>Simple supported text</strong>",
      })
    ).review,
    false,
  );
});
test("explicit unsupported presentation is disclosed and routed through review while supported styles stay immediate", async () => {
  const base: ClipboardPacket = {
    source: "",
    from: 0,
    to: 0,
    visual: true,
    html: "",
    plain: "",
    rawLatex: "",
    id: null,
  };
  for (const html of [
    '<p style="color:red;text-align:center">Colored and centered</p>',
    '<font face="Arial" color="red">Styled</font>',
    '<span style="font-size:24px">Large</span>',
    '<div class="external-layout">Class styles</div>',
    "<head><style>p { color:red; }</style></head><p>Styled</p>",
    '<table><tr style="background:yellow"><td>Cell</td></tr></table>',
  ]) {
    assert.match(
      htmlToLatex(html).warnings.join(" "),
      /formatting is not preserved/,
    );
    assert.equal((await prepareClipboard({ ...base, html })).review, true);
  }
  const supported =
    '<p><span style="font-weight:700;font-style:italic;text-decoration:underline">Kept</span></p><table><tr><td style="text-align:center">A</td></tr></table>';
  assert.deepEqual(htmlToLatex(supported).warnings, []);
  assert.equal(
    (await prepareClipboard({ ...base, html: supported })).review,
    false,
  );
});
