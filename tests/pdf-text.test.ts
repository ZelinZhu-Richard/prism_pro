import test from "node:test";
import assert from "node:assert/strict";
import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import {
  boundedTextStream,
  extractPdfText,
  PdfTextCache,
  type PdfTextDocument,
} from "../src/pdf-text";
import { pdfSourcePoint, pdfPreviewPoint } from "../src/pdf-selection";

const item = (str: string, hasEOL = false): TextItem => ({
  str,
  hasEOL,
  dir: "ltr",
  width: 1,
  height: 1,
  transform: [1, 0, 0, 1, 0, 0],
  fontName: "example",
});
const chunk = (...items: TextContent["items"]): TextContent => ({
  items,
  styles: {},
  lang: null,
});
function stream(chunks: TextContent[]) {
  return new ReadableStream<TextContent>({
    start(c) {
      for (const part of chunks) c.enqueue(part);
      c.close();
    },
  });
}
function document(pages: TextContent[][]): PdfTextDocument {
  return {
    numPages: pages.length,
    getPage: async (n) => ({ streamTextContent: () => stream(pages[n - 1]) }),
  };
}

test("PDF extraction retains Unicode, EOLs and page boundaries across fragmented streams, and strips NUL", async () => {
  const doc = document([
    [
      chunk(item("Café "), { type: "beginMarkedContent", id: "x" }),
      chunk(item("中文 👩🏽‍🔬\0", true), item("office ﬀ")),
    ],
    [chunk(item("Final page", true))],
  ]);
  const text = await extractPdfText(doc, new AbortController().signal, (s) =>
    s.replaceAll("ﬀ", "ff"),
  );
  assert.equal(text, "Café 中文 👩🏽‍🔬\noffice ff\nFinal page\n");
});

test("whole-PDF extraction includes every page serially, without rendering canvases", async () => {
  const order: number[] = [];
  const doc: PdfTextDocument = {
    numPages: 19,
    getPage: async (n) => {
      order.push(n);
      return { streamTextContent: () => stream([chunk(item(`PAGE ${n}`))]) };
    },
  };
  assert.equal(
    await extractPdfText(doc, new AbortController().signal),
    Array.from({ length: 19 }, (_, i) => `PAGE ${i + 1}`).join("\n"),
  );
  assert.deepEqual(
    order,
    Array.from({ length: 19 }, (_, i) => i + 1),
  );
});

test("text extraction refuses oversized character/item budgets and normalization expansion instead of truncating", async () => {
  for (const options of [{ maxCharacters: 3 }, { maxItems: 1 }]) {
    await assert.rejects(
      extractPdfText(
        document([[chunk(item("abcd"), item("e"))]]),
        new AbortController().signal,
        (s) => s,
        options,
      ),
      /limit|too complex/,
    );
  }
  await assert.rejects(
    extractPdfText(
      document([[chunk(item("ﬀﬀ"))]]),
      new AbortController().signal,
      (s) => s.replaceAll("ﬀ", "ff"),
      { maxCharacters: 3 },
    ),
    /Normalized/,
  );
});

test("page overlays enforce their own budget and propagate cancellation upstream", async () => {
  let cancelled = false;
  const source = new ReadableStream<TextContent>({
    start(c) {
      c.enqueue(chunk(item("large")));
    },
    cancel() {
      cancelled = true;
    },
  });
  const reader = boundedTextStream(source, 2, 4).getReader();
  await assert.rejects(reader.read(), /too complex/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
  const tooMany = boundedTextStream(
    stream([chunk(item("a"), item("b"))]),
    1,
  ).getReader();
  await assert.rejects(tooMany.read(), /too complex/);
});

test("cancellation interrupts a pending page load and a pending text read", async () => {
  const controller = new AbortController();
  const pendingPage = extractPdfText(
    { numPages: 1, getPage: () => new Promise(() => {}) },
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pendingPage, { name: "AbortError" });
  let cancelled = false;
  const readController = new AbortController();
  const doc: PdfTextDocument = {
    numPages: 1,
    getPage: async () => ({
      streamTextContent: () =>
        new ReadableStream({
          pull() {
            readController.abort();
          },
          cancel() {
            cancelled = true;
          },
        }),
    }),
  };
  await assert.rejects(extractPdfText(doc, readController.signal), {
    name: "AbortError",
  });
  assert.equal(cancelled, true);
});

test("a local deadline interrupts stuck extraction, and failed streams surface errors", async () => {
  await assert.rejects(
    extractPdfText(
      { numPages: 1, getPage: () => new Promise(() => {}) },
      new AbortController().signal,
      (s) => s,
      { timeout: 10 },
    ),
    /timed out/,
  );
  await assert.rejects(
    extractPdfText(
      {
        numPages: 1,
        getPage: async () => ({
          streamTextContent: () =>
            new ReadableStream({
              start(c) {
                c.error(new Error("broken text stream"));
              },
            }),
        }),
      },
      new AbortController().signal,
    ),
    /broken text stream/,
  );
});

test("text cache coalesces callers, caches empty text, and does not read again after disposal", async () => {
  let reads = 0;
  const cache = new PdfTextCache(
    {
      numPages: 1,
      getPage: async () => {
        reads++;
        return { streamTextContent: () => stream([]) };
      },
    },
    (s) => s,
  );
  const first = cache.read(),
    second = cache.read();
  assert.equal(first, second);
  assert.deepEqual(await Promise.all([first, second]), ["", ""]);
  assert.equal(await cache.read(), "");
  assert.equal(reads, 1);
  cache.dispose();
  await assert.rejects(cache.read(), { name: "AbortError" });
});

test("cancelled cache work cannot overwrite a fresh read or produce stale text after disposal", async () => {
  let finish!: (value: Awaited<ReturnType<PdfTextDocument["getPage"]>>) => void,
    reads = 0;
  const cache = new PdfTextCache(
    {
      numPages: 1,
      getPage: () =>
        ++reads === 1
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve({
              streamTextContent: () => stream([chunk(item("new"))]),
            }),
    },
    (s) => s,
  );
  const old = cache.read();
  cache.cancel();
  const current = cache.read();
  finish({ streamTextContent: () => stream([chunk(item("old"))]) });
  await assert.rejects(old, { name: "AbortError" });
  assert.equal(await current, "new");
  assert.equal(await cache.read(), "new");
  const pending = new PdfTextCache(
    { numPages: 1, getPage: () => new Promise(() => {}) },
    (s) => s,
  );
  const read = pending.read();
  pending.dispose();
  await assert.rejects(read, { name: "AbortError" });
});

test("SyncTeX points use inverse viewport rotation/scale and cropped page coordinates", () => {
  const box = [10, 20, 610, 820];
  for (const rotation of [0, 90, 180, 270]) {
    const transform =
      rotation === 0
        ? (x: number, y: number) => [10 + x / 2, 820 - y / 2]
        : rotation === 90
          ? (x: number, y: number) => [10 + y / 2, 20 + x / 2]
          : rotation === 180
            ? (x: number, y: number) => [610 - x / 2, 20 + y / 2]
            : (x: number, y: number) => [610 - y / 2, 820 - x / 2];
    const screen =
      rotation === 0
        ? [200, 600]
        : rotation === 90
          ? [1000, 200]
          : rotation === 180
            ? [1000, 1000]
            : [600, 1000];
    assert.deepEqual(
      pdfSourcePoint(
        { viewBox: box, convertToPdfPoint: transform },
        screen[0],
        screen[1],
      ),
      { x: 100, y: 300 },
    );
    const forward =
      rotation === 0
        ? (x: number, y: number) => [(x - 10) * 2, (820 - y) * 2]
        : rotation === 90
          ? (x: number, y: number) => [(y - 20) * 2, (x - 10) * 2]
          : rotation === 180
            ? (x: number, y: number) => [(610 - x) * 2, (y - 20) * 2]
            : (x: number, y: number) => [(820 - y) * 2, (610 - x) * 2];
    assert.deepEqual(
      pdfPreviewPoint(
        { viewBox: box, convertToViewportPoint: forward },
        100,
        300,
      ),
      { x: screen[0], y: screen[1] },
    );
  }
});
