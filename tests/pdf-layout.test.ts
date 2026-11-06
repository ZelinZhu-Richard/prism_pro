import test from "node:test";
import assert from "node:assert/strict";
import {
  layoutPdfPages,
  visiblePdfPage,
  pdfAnchor,
  scrollForPdfAnchor,
  nearPdfPage,
  PAGE_GAP,
  PAGE_PADDING,
  PDF_CSS_UNITS,
  pdfZoomScale,
  pdfRasterRatio,
  parsePdfZoom,
  parsePdfPage,
} from "../src/pdf-layout";

const paper = Array.from({ length: 19 }, () => ({ width: 612, height: 792 }));
test("direct navigation retains pages 18 and 19 when low zoom exposes several complete pages at the bottom", () => {
  const pages = layoutPdfPages(paper, 220, "fit-width", 650);
  const end = pages.at(-1)!.top + pages.at(-1)!.height + PAGE_PADDING - 650;
  assert.equal(visiblePdfPage(pages, end, 650, 18), 18);
  assert.equal(visiblePdfPage(pages, end, 650, 19), 19);
  assert.equal(visiblePdfPage(pages, 0, 650, 19), 1);
  const tall = layoutPdfPages(paper, 500, 1, 700);
  assert.equal(visiblePdfPage(tall, tall[1].top, 700, 18), 2);
});
test("100% uses real CSS point conversion while fit modes track panel dimensions", () => {
  for (const width of [320, 500, 1200])
    assert.equal(layoutPdfPages(paper, width, 1)[0].width, 816);
  assert.equal(
    pdfZoomScale(paper, 500, 700, "fit-width"),
    (500 - 2 * PAGE_PADDING) / 612,
  );
  assert.equal(
    pdfZoomScale(paper, 500, 700, "fit-height"),
    (700 - 2 * PAGE_PADDING) / 792,
  );
  assert.equal(pdfZoomScale(paper, 500, 700, 4), 4 * PDF_CSS_UNITS);
  const mixed = [...paper, { width: 1000, height: 2000 }];
  assert.ok(
    layoutPdfPages(mixed, 500, "fit-width").every(
      (p) => p.width <= 500 - 2 * PAGE_PADDING,
    ),
  );
  assert.ok(
    layoutPdfPages(mixed, 500, "fit-height", 700).every(
      (p) => p.height <= 700 - 2 * PAGE_PADDING,
    ),
  );
});
test("Fit Page constrains both dimensions of every sheet at one continuous scale", () => {
  const mixed = [
    { width: 612, height: 792 },
    { width: 1000, height: 600 },
  ];
  for (const [width, height, limitingDimension] of [
    [460, 780, "width"],
    [1200, 480, "height"],
  ] as const) {
    const fitted = layoutPdfPages(mixed, width, "fit-page", height);
    assert.ok(fitted.every((p) => p.width <= width - 2 * PAGE_PADDING + 1e-8));
    assert.ok(
      fitted.every((p) => p.height <= height - 2 * PAGE_PADDING + 1e-8),
    );
    assert.equal(fitted[0].scale, fitted[1].scale);
    assert.equal(
      fitted[0].scale,
      pdfZoomScale(
        mixed,
        width,
        height,
        limitingDimension === "width" ? "fit-width" : "fit-height",
      ),
    );
  }
  assert.ok(
    pdfZoomScale([{ width: 1000000, height: 1000000 }], 300, 300, "fit-page") <
      0.001,
  );
});

test("a fitted final page stays the reading anchor when scrolling clamps at the document end", () => {
  const mixed = [...paper.slice(0, 2), { width: 792, height: 200 }];
  const height = 670;
  const pages = layoutPdfPages(mixed, 600, "fit-page", height);
  const last = pages[2];
  const end = last.top + last.height + PAGE_PADDING - height;
  assert.equal(pdfAnchor(pages, end).page, 2);
  assert.equal(visiblePdfPage(pages, end, height, last.page), last.page);
  assert.deepEqual(pdfAnchor(pages, end, { page: last.page, height }), {
    page: 3,
    fraction: 0,
  });
  assert.deepEqual(
    pdfAnchor(pages, 0, { page: last.page, height }),
    pdfAnchor(pages, 0),
  );
  const next = layoutPdfPages(mixed, 410, "fit-page", 480);
  const lastNext = next[2];
  const nextTop = Math.min(
    scrollForPdfAnchor(
      next,
      pdfAnchor(pages, end, { page: last.page, height }),
    ),
    lastNext.top + lastNext.height + PAGE_PADDING - 480,
  );
  assert.equal(visiblePdfPage(next, nextTop, 480, last.page), last.page);
});
test("custom zoom and page inputs validate ranges, decimals and invalid syntax", () => {
  for (const [input, value] of [
    ["100%", 1],
    [" 125.5 ", 1.255],
    ["10", 0.1],
    ["400", 4],
  ] as const)
    assert.equal(parsePdfZoom(input), value);
  for (const input of [
    "0",
    "401",
    "9.9",
    "NaN",
    "Infinity",
    "1e2",
    "10foo",
    "",
    "-10",
  ])
    assert.equal(parsePdfZoom(input), null);
  assert.equal(parsePdfPage(" 19 ", 19), 19);
  assert.equal(parsePdfPage("01", 19), 1);
  for (const input of ["0", "20", "1.5", "1e1", "x", ""])
    assert.equal(parsePdfPage(input, 19), null);
});
test("high zoom canvas raster stays under pixel and dimension budgets without changing display scale", () => {
  for (const [width, height, ratio] of [
    [816, 1056, 2],
    [4000, 6000, 2],
    [20000, 300, 3],
    [1, 100000, 2],
  ]) {
    const actual = pdfRasterRatio(width, height, ratio);
    assert.ok(actual > 0);
    assert.ok(width * actual <= 8192 + 1e-7);
    assert.ok(height * actual <= 8192 + 1e-7);
    assert.ok(width * height * actual * actual <= 16 * 1024 * 1024 + 1e-7);
  }
  assert.equal(pdfRasterRatio(816, 1056, 2), 2);
});
test("continuous PDF layout reaches all 19 pages with a stable gap and correct visible page", () => {
  const pages = layoutPdfPages(paper, 500, 1);
  assert.equal(pages.length, 19);
  assert.equal(pages[0].top, PAGE_PADDING);
  for (let n = 1; n < pages.length; n++)
    assert.equal(
      pages[n].top,
      pages[n - 1].top + pages[n - 1].height + PAGE_GAP,
    );
  assert.equal(visiblePdfPage(pages, 0, 700), 1);
  assert.equal(visiblePdfPage(pages, pages[9].top - PAGE_PADDING, 700), 10);
  const end = pages[18].top + pages[18].height + PAGE_PADDING - 700;
  assert.equal(visiblePdfPage(pages, end, 700), 19);
});
test("zoom and panel resizing preserve the page and fractional reading position", () => {
  const pages = layoutPdfPages(paper, 500, 1);
  const original = pages[11].top + pages[11].height * 0.37 - PAGE_PADDING;
  const anchor = pdfAnchor(pages, original);
  assert.equal(anchor.page, 12);
  for (const [width, zoom] of [
    [500, 1.75],
    [320, 1],
    [700, 0.5],
  ]) {
    const next = layoutPdfPages(paper, width, zoom);
    const restored = pdfAnchor(next, scrollForPdfAnchor(next, anchor));
    assert.equal(restored.page, 12);
    assert.ok(Math.abs(restored.fraction - 0.37) < 1e-10);
  }
});
test("mixed page sizes keep their dimensions and only nearby canvases need rendering", () => {
  const pages = layoutPdfPages(
    [{ width: 612, height: 792 }, { width: 792, height: 612 }, ...paper],
    700,
    1,
  );
  assert.equal(pages[0].scale, pages[1].scale);
  assert.ok(pages[0].height > pages[0].width);
  assert.ok(pages[1].width > pages[1].height);
  const nearby = pages.filter((p) => nearPdfPage(p, pages[10].top, 700));
  assert.ok(nearby.some((p) => p.page === 11));
  assert.ok(nearby.length < 6);
  assert.ok(!nearby.some((p) => p.page === 1 || p.page === 21));
});
test("reading anchors clamp after a shorter recompile and tolerate an empty preview", () => {
  const shorter = layoutPdfPages(paper.slice(0, 3), 500, 1);
  const top = scrollForPdfAnchor(shorter, { page: 19, fraction: 0.5 });
  assert.equal(pdfAnchor(shorter, top).page, 3);
  assert.deepEqual(pdfAnchor([], 0), { page: 1, fraction: 0 });
  assert.equal(scrollForPdfAnchor([], { page: 19, fraction: 1 }), 0);
  assert.equal(visiblePdfPage([], 0, 700), 1);
});
