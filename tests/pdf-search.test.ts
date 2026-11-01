import test from "node:test";
import assert from "node:assert/strict";
import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import {
  PdfSearchIndex,
  searchPage,
  searchProjection,
  findPdfMatches,
  defaultPdfSearchOptions,
  PDF_SEARCH_PAGE_LIMIT,
} from "../src/pdf-search";
import type { PdfTextDocument } from "../src/pdf-text";

const item = (str: string, hasEOL = false) => ({ str, hasEOL }) as TextItem;
const chunk = (...items: TextContent["items"]) =>
  ({ items, styles: {}, lang: null }) as TextContent;
const page = (text: string, n = 1) => searchPage(n, [chunk(item(text))]);
const stream = (chunks: TextContent[]) =>
  new ReadableStream<TextContent>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
const document = (pages: TextContent[][]): PdfTextDocument => ({
  numPages: pages.length,
  getPage: async (n) => ({ streamTextContent: () => stream(pages[n - 1]) }),
});
const find = (text: string, query: string, options = {}) =>
  findPdfMatches([page(text)], query, {
    ...defaultPdfSearchOptions,
    ...options,
  });

test("PDF search maps fragmented items, empty items and EOLs back to exact text-layer offsets", async () => {
  const source = searchPage(19, [
    chunk(item("Final "), item(""), { type: "beginMarkedContent", id: "m" }),
    chunk(item("page", true), item("office")),
  ]);
  assert.equal(source.text, "Final page\noffice");
  const [match] = await findPdfMatches([source], "page office");
  assert.deepEqual(match, {
    page: 19,
    from: 6,
    to: 17,
    parts: [
      { item: 2, from: 0, to: 4 },
      { item: 3, from: 0, to: 6 },
    ],
  });
  assert.equal(source.text, "Final page\noffice");
});
test("case, accent and whole-word options are independent and Unicode aware", async () => {
  const text = "Café cafe CAFE cafe\u0301 cafeteria";
  assert.equal((await find(text, "cafe")).length, 5);
  assert.equal((await find(text, "cafe", { wholeWord: true })).length, 4);
  assert.equal(
    (await find(text, "cafe", { matchAccents: true, wholeWord: true })).length,
    2,
  );
  assert.equal(
    (await find(text, "CAFE", { caseSensitive: true, matchAccents: true }))
      .length,
    1,
  );
  assert.equal((await find("𐐀𐐀 𐐀 𐐀𐐁", "𐐀", { wholeWord: true })).length, 1);
  const [decomposed] = await find("cafe\u0301", "café", { matchAccents: true });
  assert.equal(decomposed.to, 5);
});
test("compatibility ligatures, long Arabic expansions, fractions and emoji retain whole source graphemes", async () => {
  const [ligature] = await find("oﬃce", "office");
  assert.deepEqual(ligature.parts, [{ item: 0, from: 0, to: 4 }]);
  assert.equal((await find("ﬀ", "f")).length, 1);
  const arabic = "\ufdfa",
    expansion = arabic.normalize("NFKC");
  assert.ok(expansion.length > 4);
  const projected = searchProjection(arabic, defaultPdfSearchOptions);
  assert.equal(projected.text, expansion);
  assert.equal(projected.starts.length, expansion.length);
  assert.ok([...projected.ends].every((n) => n === 1));
  assert.equal((await find(arabic, expansion)).length, 1);
  assert.equal((await find("½", "1/2")).length, 1);
  const [emoji] = await find("x 👩🏽‍🔬 y", "👩🏽‍🔬");
  assert.equal(emoji.from, 2);
  assert.equal(emoji.to, 9);
});
test("line-break hyphens, repeated whitespace, CJK line breaks and soft hyphens are searchable", async () => {
  assert.equal(
    (await find("An inter-\n  national result", "international result")).length,
    1,
  );
  assert.equal((await find("co\u00adoperate", "cooperate")).length, 1);
  assert.equal((await find("Two \t\n  words", "two words")).length, 1);
  assert.equal((await find("中\n文", "中文")).length, 1);
  assert.equal((await find("well-being", "wellbeing")).length, 0);
  assert.equal((await find("a\0b", "ab")).length, 1);
});
test("matches are ordered, nonoverlapping, page-local and bounded without silent truncation", async () => {
  const result = await findPdfMatches(
    [page("banana", 2), page("ana", 19)],
    "ana",
  );
  assert.deepEqual(
    result.map((m) => [m.page, m.from, m.to]),
    [
      [2, 1, 4],
      [19, 0, 3],
    ],
  );
  assert.equal(
    (await findPdfMatches([page("page"), page("break", 2)], "page break"))
      .length,
    0,
  );
  await assert.rejects(
    findPdfMatches([page("x x x")], "x", defaultPdfSearchOptions, undefined, 2),
    /More than 2/,
  );
  await assert.rejects(find("x", "a".repeat(513)), /at most 512/);
  assert.equal((await find("any", "   ")).length, 0);
  assert.throws(
    () =>
      searchProjection(
        "x".repeat(PDF_SEARCH_PAGE_LIMIT + 1),
        defaultPdfSearchOptions,
      ),
    /page exceeds/,
  );
  await assert.rejects(
    findPdfMatches(
      [
        searchPage(1, [
          chunk(...Array.from({ length: 2001 }, () => item("x"))),
        ]),
      ],
      "x".repeat(2001),
    ),
    /at most 512/,
  );
});
test("search cancellation interrupts matching before stale results are returned", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    findPdfMatches(
      [page("result")],
      "result",
      defaultPdfSearchOptions,
      controller.signal,
    ),
    { name: "AbortError" },
  );
});
test("indexing reads all 19 pages serially, coalesces callers and caches without canvases", async () => {
  const order: number[] = [];
  const index = new PdfSearchIndex({
    numPages: 19,
    getPage: async (n) => {
      order.push(n);
      return { streamTextContent: () => stream([chunk(item(`PAGE ${n}`))]) };
    },
  });
  const progress: number[] = [];
  const first = index.load((n) => progress.push(n)),
    second = index.load();
  assert.equal(first, second);
  const pages = await first;
  assert.equal(await index.load(), pages);
  assert.deepEqual(
    order,
    Array.from({ length: 19 }, (_, i) => i + 1),
  );
  assert.deepEqual(progress, order);
  assert.equal((await findPdfMatches(pages, "PAGE 19"))[0].page, 19);
  index.dispose();
  await assert.rejects(index.load(), { name: "AbortError" });
});
test("index refuses total characters/items, huge pages and failed text streams", async () => {
  for (const limits of [
    { characters: 3, items: 10, timeout: 1000 },
    { characters: 100, items: 1, timeout: 1000 },
  ]) {
    const index = new PdfSearchIndex(
      document([[chunk(item("abcd"), item("e"))]]),
      limits,
    );
    await assert.rejects(index.load(), /indexing limit/);
    index.dispose();
  }
  const huge = new PdfSearchIndex(
    document([[chunk(item("x".repeat(1024 * 1024 + 1)))]]),
  );
  await assert.rejects(huge.load(), /too complex/);
  huge.dispose();
  const broken = new PdfSearchIndex({
    numPages: 1,
    getPage: async () => ({
      streamTextContent: () =>
        new ReadableStream({
          start(c) {
            c.error(new Error("broken stream"));
          },
        }),
    }),
  });
  await assert.rejects(broken.load(), /broken stream/);
  broken.dispose();
});
test("cancel, disposal and timeout interrupt pending page or stream extraction", async () => {
  const stuck: PdfTextDocument = {
    numPages: 1,
    getPage: () => new Promise(() => {}),
  };
  const index = new PdfSearchIndex(stuck);
  const pending = index.load();
  index.cancel();
  await assert.rejects(pending, { name: "AbortError" });
  const timed = new PdfSearchIndex(stuck, {
    characters: 100,
    items: 100,
    timeout: 10,
  });
  await assert.rejects(timed.load(), /timed out/);
  timed.dispose();
  let cancelled = false;
  const source = new PdfSearchIndex({
    numPages: 1,
    getPage: async () => ({
      streamTextContent: () =>
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
    }),
  });
  const reading = source.load();
  await new Promise((resolve) => setImmediate(resolve));
  source.dispose();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(cancelled, true);
});
test("cancelled old index extraction cannot replace a fresh load", async () => {
  let finish!: (value: Awaited<ReturnType<PdfTextDocument["getPage"]>>) => void,
    reads = 0;
  const index = new PdfSearchIndex({
    numPages: 1,
    getPage: () =>
      ++reads === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({
            streamTextContent: () => stream([chunk(item("new"))]),
          }),
  });
  const old = index.load();
  index.cancel();
  const fresh = index.load();
  finish({ streamTextContent: () => stream([chunk(item("old"))]) });
  await assert.rejects(old, { name: "AbortError" });
  assert.equal((await fresh)[0].text, "new");
  assert.equal((await index.load())[0].text, "new");
  index.dispose();
});
