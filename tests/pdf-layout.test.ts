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
} from "../src/pdf-layout";

const paper = Array.from({ length: 19 }, () => ({ width: 612, height: 792 }));
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
