import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import nspell from "nspell";
import { scanLatex, checkWriting, WritingLimit } from "../shared/latex-checks";
import {
  writingSettings,
  writingPatch,
  dictionaryWord,
} from "../shared/writing-checks";
import { WritingChecks } from "../server/writing-checks";
import { Store } from "../server/store";
import { createApp } from "../server/app";
test("standard LaTeX, definitions and nested math scopes do not produce structural false alarms", () => {
  const source = String.raw`\documentclass{article}
\newcommand{\openformula}{\begin{equation}}
\newenvironment{custom}{\begin{quote}}{\end{quote}}
\title{A title}
\begin{document}
\section{Introduction}
Text \emph{with \textbf{nested} formatting}.
\begin{equation}\left(\begin{array}{cc}a&b\\c&d\end{array}\right)\end{equation}
Inline \(\left[x\right]\), $a+b$, and \[c+d\].
\begin{itemize}\item An item\end{itemize}
\end{document}`;
  assert.deepEqual(scanLatex(source).issues, []);
});
test("Code Check reports groups, environments, math delimiters, left/right and text/math command placement", () => {
  const cases: [string, RegExp][] = [
    ["{unclosed", /Opening \{/],
    ["extra}", /Closing \}/],
    [String.raw`\begin{quote}Text\end{itemize}`, /Expected/],
    ["$a+b", /Unclosed math/],
    [String.raw`\(x\]`, /matching opener/],
    [String.raw`$\right)$`, /no matching/],
    [String.raw`$\left(x$`, /matching/],
    [String.raw`Text \frac{1}{2}`, /math mode/],
    [String.raw`$\section{Title}$`, /structural text/],
  ];
  for (const [source, pattern] of cases)
    assert.ok(
      scanLatex(source).issues.some((i) => pattern.test(i.message)),
      source,
    );
  assert.deepEqual(scanLatex("{ unclosed", false).issues, []);
  assert.deepEqual(
    scanLatex(String.raw`\frac{1}{2}\begin{document}Valid prose\end{document}`)
      .issues,
    [],
  );
});
test("comments, raw/code environments, escaped delimiters and verbatim text do not disturb balancing", () => {
  const source = String.raw`\begin{document}
% { $ \begin{bad}
\verb|{ $ \left| and \$ \{ \} \%.
\begin{lstlisting}[language=Python]
{ $ \begin{unmatched}
\end{lstlisting}
\begin{minted}{python}
{ $ \end{bogus}
\end{minted}
\end{document}`;
  assert.deepEqual(scanLatex(source).issues, []);
  assert.ok(
    scanLatex(String.raw`\verb|missing`).issues.some((i) =>
      /verb/.test(i.message),
    ),
  );
});
test("prose spans include headings, footnotes, link labels, figure captions and table cells while excluding metadata", () => {
  const source = String.raw`\documentclass{mispeled}
\newcommand{\model}{mispeled}
\title{mispeled}
\begin{document}
mispeled \textbf{mispeled} \footnote{mispeled}
\cite{mispeled} \label{mispeled} \input{mispeled}
\custom{mispeled} \texttt{mispeled} $mispeled$
\href{https://mispeled.invalid}{mispeled}
\begin{figure}\includegraphics{mispeled}\caption{mispeled}\end{figure}
\begin{tabularx}{\linewidth}{mispeled}mispeled\end{tabularx}
% mispeled
\end{document}
mispeled`;
  const result = checkWriting(source, false, (word) => word !== "mispeled");
  assert.equal(result.issues.length, 7);
  for (const issue of result.issues)
    assert.equal(source.slice(issue.from, issue.to), "mispeled");
  assert.equal(
    checkWriting(source, false, () => false, ["mispeled"]).issues.filter(
      (i) => i.word === "mispeled",
    ).length,
    0,
  );
});
test("headless files, Unicode positions, URLs, acronyms, accents and command fragments preserve replacement boundaries", () => {
  const source = String.raw`👩🏽‍🔬 café mispeled NASA https://mispeled.invalid/a and caf\'e \textbf{mispe}led`;
  const result = checkWriting(
    source,
    false,
    (w) => !["mispeled", "caf", "mispe", "led"].includes(w),
  );
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].from, source.indexOf("mispeled"));
  assert.equal(result.issues[0].to, source.indexOf("mispeled") + 8);
  assert.deepEqual(
    scanLatex(String.raw`\begin{tabular}{lcr}Words\end{tabular}`).issues,
    [],
  );
});
test("writing checks bound source, words, nesting and visible findings", () => {
  assert.throws(() => scanLatex("x".repeat(1_000_001)), WritingLimit);
  assert.throws(() => scanLatex("{".repeat(257)), WritingLimit);
  assert.throws(
    () => scanLatex("\\textbf{".repeat(130) + "word" + "}".repeat(130)),
    WritingLimit,
  );
  assert.throws(
    () => checkWriting("word ".repeat(50_001), false, () => true),
    /50,000/,
  );
  const result = checkWriting("mispeled ".repeat(520), false, () => false);
  assert.equal(result.issues.length, 500);
  assert.match(result.notice || "", /first 500/);
});
test("the bundled US and UK dictionaries provide real suggestions and variant-specific spelling", () => {
  const dictionaries = Object.fromEntries(
    ["en-US", "en-GB"].map((language) => [
      language,
      nspell(
        fs.readFileSync(`vendor/dictionaries/${language}/index.aff`, "utf8"),
        fs.readFileSync(`vendor/dictionaries/${language}/index.dic`, "utf8"),
      ),
    ]),
  );
  for (const dictionary of Object.values(dictionaries)) {
    assert.equal(dictionary.correct("scientific"), true);
    assert.equal(dictionary.correct("mispeled"), false);
    assert.ok(
      dictionary
        .suggest("mispeled")
        .some((w) => ["misspelled", "misspelt"].includes(w)),
    );
  }
  assert.equal(dictionaries["en-US"].correct("color"), true);
  assert.equal(dictionaries["en-US"].correct("colour"), false);
  assert.equal(dictionaries["en-GB"].correct("colour"), true);
});
test("writing preference validation is strict on incoming patches and recovers persisted invalid values", () => {
  assert.equal(
    writingSettings({ language: "elsewhere", codeCheck: "true" }).language,
    "off",
  );
  assert.equal(writingSettings({ codeCheck: "yes" }).codeCheck, false);
  assert.throws(() => writingPatch({ language: "javascript:bad" }));
  assert.throws(() => writingPatch({ words: [] }));
  assert.throws(() => writingPatch(JSON.parse('{"__proto__":{}}')));
  assert.equal(dictionaryWord("  TensorRT  "), "TensorRT");
  assert.throws(() => dictionaryWord("\\input{secret}"));
  assert.throws(() => dictionaryWord("two words"));
});
test("personal dictionaries and per-file exclusions persist without changing source or project history", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-writing-"));
  let store = new Store(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = store.create("Synthetic writing", [
      { path: "main.tex", data: Buffer.from("Original source.\r\n") },
    ]),
    service = new WritingChecks(store),
    before = store.project(p.id),
    history = store.checkpoints(p.id);
  service.update({ language: "en-GB", codeCheck: true });
  service.word({ language: "en-GB", word: "TensorRT", action: "add" });
  service.word({ language: "en-GB", word: "tensorrt", action: "add" });
  service.exclude(p.id, { path: "main.tex", excluded: true });
  assert.equal(service.settings().words["en-GB"].length, 1);
  assert.deepEqual(store.project(p.id), before);
  assert.deepEqual(store.checkpoints(p.id), history);
  store.close();
  store = new Store(root);
  const reopened = new WritingChecks(store);
  assert.equal(reopened.settings().language, "en-GB");
  assert.equal(reopened.settings().excluded[0].path, "main.tex");
  assert.equal(
    store.readText(p.id, "main.tex").content,
    "Original source.\r\n",
  );
  reopened.word({ language: "en-GB", word: "TENSORRT", action: "remove" });
  assert.equal(reopened.settings().words["en-GB"].length, 0);
  assert.throws(() =>
    reopened.exclude(p.id, { path: "../outside", excluded: true }),
  );
});
test("writing APIs serve only bundled dictionaries and validate preferences, words and origin", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prism-writing-api-")),
    env = await createApp(root, { seed: false });
  t.after(async () => {
    await env.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const headers = { host: "127.0.0.1:4317", "x-prism-request": "1" };
  const dict = await env.app.inject({
    method: "GET",
    url: "/api/writing/dictionary/en-US/aff",
    headers,
  });
  assert.equal(dict.statusCode, 200);
  assert.match(dict.body, /SET UTF-8/);
  for (const url of [
    "/api/writing/dictionary/en-US/secret",
    "/api/writing/dictionary/unknown/dic",
  ])
    assert.equal(
      (await env.app.inject({ method: "GET", url, headers })).statusCode,
      404,
    );
  assert.equal(
    (
      await env.app.inject({
        method: "PUT",
        url: "/api/settings/writing",
        headers,
        payload: { language: "en-US", codeCheck: true },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await env.app.inject({
        method: "PUT",
        url: "/api/settings/writing",
        headers,
        payload: { codeCheck: "yes" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await env.app.inject({
        method: "POST",
        url: "/api/settings/writing/words",
        headers,
        payload: { language: "en-US", word: "Localword", action: "add" },
      })
    ).json().words["en-US"][0],
    "Localword",
  );
  assert.equal(
    (
      await env.app.inject({
        method: "PUT",
        url: "/api/settings/writing",
        headers: { ...headers, origin: "https://outside.invalid" },
        payload: { language: "en-GB" },
      })
    ).statusCode,
    403,
  );
});
