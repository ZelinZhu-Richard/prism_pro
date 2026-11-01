import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ChatMarkdown, ChatMath } from "../src/components/ChatMarkdown";
import { chatLink, chatMath } from "../src/chat-markdown";
test("formatted chat renders prose, lists, tables, code and both common math delimiters locally", () => {
  const text =
    String.raw`## A useful reply

**Strong** prose and [a source](https://example.org/paper).

- First item
- Second item

| Symbol | Value |
| --- | --- |
| x | 2 |

Inline \(x^2\) and $y^2$.

\[z = \frac{1}{2}\]

` + "```latex\n\\section{Example}\n```";
  const html = renderToStaticMarkup(createElement(ChatMarkdown, { text }));
  assert.match(html, /<h2>A useful reply<\/h2>/);
  assert.match(html, /<strong>Strong<\/strong>/);
  assert.match(html, /<table>/);
  assert.match(html, /class="katex/);
  assert.match(html, /Copy code/);
  assert.match(html, /\\section\{Example\}/);
  assert.match(html, /rel="noopener noreferrer"/);
});
test("chat markup cannot execute raw HTML, fetch images or turn local/script links into live destinations", () => {
  const html = renderToStaticMarkup(
    createElement(ChatMarkdown, {
      text: '<script>bad()</script>\n<img src="https://tracking.invalid/pixel">\n\n![Alt](https://tracking.invalid/image)\n\n[bad](javascript:alert%281%29) [file](file:///private/local) [relative](/api/settings) [safe](https://example.org/)',
    }),
  );
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('src="https://tracking'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(!html.includes('href="file:'));
  assert.ok(!html.includes('href="/api'));
  assert.match(html, /Image omitted: Alt/);
  assert.match(html, /href="https:\/\/example.org\/"/);
});
test("untrusted TeX cannot create images or active HTML, and invalid or oversized math falls back to source", () => {
  for (const source of [
    String.raw`\includegraphics{https://tracking.invalid/a}`,
    String.raw`\href{javascript:alert(1)}{Click}`,
    String.raw`\htmlStyle{background:url(https://tracking.invalid/a)}{Text}`,
  ]) {
    const html = renderToStaticMarkup(
      createElement(ChatMath, { source, display: false }),
    );
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes('href="javascript'));
    assert.ok(!/style=["'][^"']*url\(/.test(html));
  }
  assert.match(
    renderToStaticMarkup(
      createElement(ChatMath, { source: "{bad", display: true }),
    ),
    /chat-math-fallback/,
  );
  assert.match(
    renderToStaticMarkup(
      createElement(ChatMath, { source: "x".repeat(8001), display: true }),
    ),
    /chat-math-fallback/,
  );
});
test("math normalisation preserves literal fenced/inline code, escaped backslashes, link destinations and incomplete streams", () => {
  const code =
    "```latex\n\\(literal\\)\n```\n`\\[literal\\]`\n[link](https://example.org/\\(x\\))";
  assert.equal(chatMath(code), code);
  assert.equal(
    chatMath("~~~tex\n\\(literal\\)\n~~~\n\\(x\\)"),
    "~~~tex\n\\(literal\\)\n~~~\n$x$",
  );
  assert.equal(chatMath("\\(unfinished"), "\\(unfinished");
  assert.equal(chatMath("\\\\(escaped\\)"), "\\\\(escaped\\)");
  assert.equal(chatMath("\\(a\nb\\)"), "\\(a\nb\\)");
});
test("external chat URLs accept only explicit web or email destinations and no credentials/control characters", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,abc",
    "file:///tmp/source",
    "/api/settings",
    "//remote.invalid/path",
    "https://name:secret@example.org/",
    "https://example.org/\npath",
  ])
    assert.equal(chatLink(url), "");
  for (const url of [
    "https://example.org/paper?q=x",
    "http://example.org/",
    "mailto:author@example.org",
  ])
    assert.equal(chatLink(url), url);
});
test("large replies use a readable plain-text fallback without parsing or dropping their content", () => {
  const text = "<unsafe>" + "x".repeat(100001),
    html = renderToStaticMarkup(createElement(ChatMarkdown, { text }));
  assert.match(html, /Large reply shown as plain text/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.ok(html.includes("x".repeat(100001)));
});
