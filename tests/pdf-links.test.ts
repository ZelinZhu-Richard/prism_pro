import test from "node:test";
import assert from "node:assert/strict";
import {
  PdfLinks,
  pdfLinkUrl,
  pdfLinkTarget,
  pdfPageLinks,
  pdfLinkRegions,
  pointInPdfRegion,
  pdfBookmarks,
  pdfDestinationPlan,
  type PdfViewport,
} from "../src/pdf-links";
import { PdfViewHistory, type PdfReadingView } from "../src/pdf-view-history";

type Document = ConstructorParameters<typeof PdfLinks>[0];
const document = (overrides: Partial<Document> = {}): Document => ({
  numPages: 19,
  getDestination: async () => [18, { name: "XYZ" }, 0, 700, null],
  getPageIndex: async () => 18,
  getOutline: async () => null,
  getPage: async () =>
    ({ getAnnotations: async () => [] }) as unknown as Awaited<
      ReturnType<Document["getPage"]>
    >,
  ...overrides,
});
const annotation = (overrides: Record<string, unknown> = {}) => ({
  subtype: "Link",
  rect: [20, 700, 120, 720],
  dest: "section.2",
  ...overrides,
});
function viewport(rotation = 0): PdfViewport {
  return {
    width: rotation % 180 ? 800 : 600,
    height: rotation % 180 ? 600 : 800,
    viewBox: [10, 20, 610, 820],
    convertToViewportPoint: (x, y) =>
      rotation === 0
        ? [x - 10, 820 - y]
        : rotation === 90
          ? [y - 20, x - 10]
          : rotation === 180
            ? [610 - x, y - 20]
            : [820 - y, 610 - x],
  };
}
test("PDF URLs allow explicit web/mail links and reject launches, scripts, credentials, controls and relative paths", () => {
  assert.equal(
    pdfLinkUrl(" HTTPS://example.com/a b "),
    "https://example.com/a%20b",
  );
  assert.equal(
    pdfLinkUrl("mailto:paper@example.com?subject=Review"),
    "mailto:paper@example.com?subject=Review",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "run:build.sh",
    "ftp://example.com/a",
    "https://user:secret@example.com",
    "https://example.com/\nsecret",
    "//example.com",
    "../paper.pdf",
    "#chapter",
    null,
    "a".repeat(4097),
  ])
    assert.equal(pdfLinkUrl(value), null);
  assert.equal(
    pdfLinkTarget({ unsafeUrl: "javascript:alert(1)" }).kind,
    "unsupported",
  );
  assert.equal(pdfLinkTarget({ action: "Print" }).kind, "unsupported");
  assert.equal(
    pdfLinkTarget({
      actions: { Action: ["alert(1)"] },
      attachment: { content: "x" },
    }).kind,
    "unsupported",
  );
  assert.deepEqual(pdfLinkTarget({ action: "GoBack" }), {
    kind: "action",
    action: "GoBack",
  });
});
test("page links filter hidden/non-link annotations, retain literal labels and do not interpret markup", () => {
  const result = pdfPageLinks([
    annotation({ overlaidText: "<script>not executed</script>" }),
    annotation({
      annotationType: 2,
      subtype: undefined,
      url: "https://example.com",
    }),
    annotation({ hidden: true }),
    annotation({ noView: true }),
    { subtype: "Text", rect: [0, 0, 1, 1] },
    annotation({ rect: [0, 0, NaN, 1] }),
    annotation({ rect: [0, 0, 0, 1] }),
  ]);
  assert.equal(result.links.length, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.links[0].label, "<script>not executed</script>");
  assert.equal(result.links[1].target.kind, "url");
  assert.notEqual(result.links[0].id, result.links[1].id);
  assert.equal(
    pdfPageLinks([annotation({ unsafeUrl: "file:///private/data" })]).links[0]
      .target.kind,
    "unsupported",
  );
});
test("PDF link hit regions map crop/rotation and multiline quad gaps without activating blank space", () => {
  const link = pdfPageLinks([
    annotation({
      rect: [20, 700, 170, 720],
      quadPoints: new Float32Array([
        20, 720, 70, 720, 20, 700, 70, 700, 120, 720, 170, 720, 120, 700, 170,
        700,
      ]),
    }),
  ]).links[0];
  for (const angle of [0, 90, 180, 270]) {
    const v = viewport(angle),
      regions = pdfLinkRegions(link, v),
      a = v.convertToViewportPoint(40, 710),
      gap = v.convertToViewportPoint(90, 710),
      b = v.convertToViewportPoint(140, 710);
    assert.equal(regions.length, 2);
    assert.equal(
      regions.some((r) => pointInPdfRegion(a[0], a[1], r)),
      true,
    );
    assert.equal(
      regions.some((r) => pointInPdfRegion(b[0], b[1], r)),
      true,
    );
    assert.equal(
      regions.some((r) => pointInPdfRegion(gap[0], gap[1], r)),
      false,
    );
  }
  assert.equal(
    pdfLinkRegions(
      pdfPageLinks([annotation({ rect: [1000, 1000, 1100, 1100] })]).links[0],
      viewport(),
    ).length,
    0,
  );
});
test("link metadata rejects annotation/link/quad/text budgets without silently truncating usable links", () => {
  assert.throws(
    () => pdfPageLinks(Array.from({ length: 10001 }, () => ({}))),
    /too many annotations/,
  );
  assert.throws(
    () => pdfPageLinks(Array.from({ length: 2001 }, () => annotation())),
    /2,000-link/,
  );
  assert.throws(
    () => pdfPageLinks([annotation({ quadPoints: [1, 2, 3] })]),
    /invalid highlight/,
  );
  assert.throws(
    () =>
      pdfPageLinks(
        Array.from({ length: 1000 }, () =>
          annotation({ url: "https://example.com/" + "a".repeat(3000) }),
        ),
      ),
    /display limit/,
  );
  assert.equal(
    pdfPageLinks([annotation({ quadPoints: [NaN, 0, 1, 1, 0, 0, 1, 0] })])
      .skipped,
    1,
  );
});
test("bookmarks preserve hierarchy, Unicode, external destinations and non-navigating groups", () => {
  const raw = [
    {
      title: "研究 👩🏽‍🔬",
      dest: "target",
      items: [{ title: "العربية", url: "https://example.com" }],
    },
    { title: "Group", dest: null, items: [{ title: "Empty" }] },
  ];
  const bookmarks = pdfBookmarks(raw);
  assert.equal(bookmarks[0].title, "研究 👩🏽‍🔬");
  assert.equal(bookmarks[0].children[0].target?.kind, "url");
  assert.equal(bookmarks[1].target, null);
  assert.equal(bookmarks[1].children[0].target, null);
  assert.deepEqual(pdfBookmarks(null), []);
  assert.equal(raw[0].title, "研究 👩🏽‍🔬");
  assert.ok(
    pdfBookmarks([{ title: "👩🏽‍🔬".repeat(600) }])[0].title.endsWith("👩🏽‍🔬…"),
  );
});
test("bookmarks reject cyclic, deep, oversized or malformed metadata", () => {
  const cycle: any = { title: "cycle", items: [] };
  cycle.items.push(cycle);
  assert.throws(() => pdfBookmarks([cycle]), /cyclic/);
  let deep: any = { title: "end" };
  for (let n = 0; n < 34; n++) deep = { title: `depth${n}`, items: [deep] };
  assert.throws(() => pdfBookmarks([deep]), /32-level/);
  assert.throws(
    () => pdfBookmarks(Array.from({ length: 2001 }, () => ({ title: "x" }))),
    /too many/,
  );
  assert.throws(
    () =>
      pdfBookmarks(
        Array.from({ length: 1500 }, () => ({ title: "x".repeat(500) })),
      ),
    /text limit/,
  );
  assert.throws(() => pdfBookmarks({}), /could not be read/);
});
test("named/reference/zero-based PDF destinations resolve once and are document-local", async () => {
  let names = 0,
    references = 0;
  const links = new PdfLinks(
    document({
      getDestination: async (name) => {
        names++;
        assert.equal(name, "section.2");
        return [{ num: 99, gen: 0 }, { name: "XYZ" }, 0, 700, null];
      },
      getPageIndex: async (ref) => {
        references++;
        assert.deepEqual(ref, { num: 99, gen: 0 });
        return 18;
      },
    }),
  );
  const [a, b] = await Promise.all([
    links.destination("section.2"),
    links.destination("section.2"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(a.page, 19);
  assert.equal(names, 1);
  assert.equal(references, 1);
  assert.equal((await links.destination([0, { name: "Fit" }])).page, 1);
  links.dispose();
  await assert.rejects(links.destination("section.2"), { name: "AbortError" });
  const second = new PdfLinks(
    document({ numPages: 1, getDestination: async () => [0, { name: "Fit" }] }),
  );
  assert.equal((await second.destination("section.2")).page, 1);
  second.dispose();
});
test("invalid destination references, shape, prototype mode names, numbers and names are rejected", async () => {
  const links = new PdfLinks(document());
  for (const dest of [
    [19, { name: "Fit" }],
    [-1, { name: "Fit" }],
    [1, { name: "constructor" }],
    [1, { name: "XYZ" }, 0, Infinity, null],
    [1, { name: "XYZ" }, 0, 700, -1],
    [1, { name: "FitR" }, 0, 0, 0, 10],
    [{ num: 0, gen: 0 }, { name: "Fit" }],
    [null, { name: "Fit" }],
    [1, { name: "Fit" }, 0],
    "",
    "x".repeat(2049),
    "bad\0name",
  ]) {
    await assert.rejects(
      links.destination(dest),
      /invalid|outside|unsupported|empty/,
    );
  }
  links.dispose();
  const missing = new PdfLinks(document({ getDestination: async () => null }));
  await assert.rejects(missing.destination("missing"), /invalid/);
  missing.dispose();
});
test("XYZ destinations preserve explicit zero/null coordinates, fit modes and bounded zoom", () => {
  const v = viewport();
  assert.deepEqual(
    pdfDestinationPlan(
      { page: 1, mode: "XYZ", values: [0, 0, null] },
      v,
      600,
      800,
      1,
    ),
    { zoom: 1, x: 0, y: 800 },
  );
  assert.deepEqual(
    pdfDestinationPlan(
      { page: 1, mode: "XYZ", values: [null, null, 0] },
      v,
      600,
      800,
      0.75,
      { x: 40, y: 720 },
    ),
    { zoom: 0.75, x: 30, y: 100 },
  );
  assert.equal(
    pdfDestinationPlan(
      { page: 1, mode: "XYZ", values: [null, null, 9999] },
      v,
      600,
      800,
      0.75,
    ).zoom,
    4,
  );
  assert.equal(
    pdfDestinationPlan({ page: 1, mode: "Fit", values: [] }, v, 400, 400, 1)
      .zoom,
    0.375,
  );
  assert.equal(
    pdfDestinationPlan({ page: 1, mode: "FitH", values: [700] }, v, 400, 400, 1)
      .y,
    120,
  );
  assert.equal(
    pdfDestinationPlan({ page: 1, mode: "FitV", values: [100] }, v, 400, 400, 1)
      .x,
    90,
  );
  const rectangle = pdfDestinationPlan(
    { page: 1, mode: "FitR", values: [20, 700, 120, 720] },
    v,
    400,
    400,
    1,
  );
  assert.deepEqual(rectangle, { zoom: 3, x: 10, y: 100 });
});
test("destination geometry respects crop and every rotation for explicit points and rectangles", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const v = viewport(rotation),
      point = v.convertToViewportPoint(110, 720);
    assert.deepEqual(
      pdfDestinationPlan(
        { page: 19, mode: "XYZ", values: [110, 720, 1] },
        v,
        400,
        400,
        1,
      ),
      { zoom: 1, x: point[0], y: point[1] },
    );
    const fit = pdfDestinationPlan(
      { page: 19, mode: "FitR", values: [110, 620, 210, 720] },
      v,
      400,
      400,
      1,
    );
    assert.equal(fit.zoom, 3);
    assert.ok(fit.x >= 0 && fit.y >= 0);
  }
});
test("one cancelled destination caller does not poison a coalesced read, and disposal rejects pending results", async () => {
  let finish!: (value: any) => void;
  let reads = 0;
  const links = new PdfLinks(
    document({
      getDestination: () => {
        reads++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    }),
  );
  const controller = new AbortController(),
    first = links.destination("late", controller.signal),
    second = links.destination("late");
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  finish([18, { name: "Fit" }]);
  assert.equal((await second).page, 19);
  assert.equal(reads, 1);
  links.dispose();
  const disposed = new PdfLinks(
    document({ getDestination: () => new Promise(() => {}) }),
  );
  const pending = disposed.destination("pending");
  disposed.dispose();
  await assert.rejects(pending, { name: "AbortError" });
});
test("destination timeout/failure can retry without reusing a failed cached promise", async () => {
  let reads = 0;
  const links = new PdfLinks(
    document({
      getDestination: () =>
        ++reads === 1
          ? new Promise(() => {})
          : Promise.resolve([0, { name: "Fit" }]),
    }),
    10,
  );
  await assert.rejects(links.destination("retry"), /timed out/);
  assert.equal((await links.destination("retry")).page, 1);
  assert.equal(reads, 2);
  links.dispose();
});
test("page and outline reads coalesce, respect bounded caches and retry failed outline reads", async () => {
  let pages = 0,
    outlines = 0;
  const links = new PdfLinks(
    document({
      getPage: async () => {
        pages++;
        return { getAnnotations: async () => [annotation()] } as any;
      },
      getOutline: async () => {
        outlines++;
        if (outlines === 1) throw new Error("temporary failure");
        return [];
      },
    }),
  );
  const [a, b] = await Promise.all([links.page(1), links.page(1)]);
  assert.deepEqual(a, b);
  assert.equal(pages, 1);
  for (let n = 2; n <= 5; n++) await links.page(n);
  await links.page(1);
  assert.equal(pages, 6);
  await assert.rejects(links.bookmarks(), /temporary/);
  assert.deepEqual(await links.bookmarks(), []);
  await links.bookmarks();
  assert.equal(outlines, 2);
  links.dispose();
  await assert.rejects(links.page(1), { name: "AbortError" });
  await assert.rejects(links.bookmarks(), { name: "AbortError" });
});
test("view history restores independent reading snapshots, supports forward and discards abandoned branches", () => {
  const history = new PdfViewHistory(2),
    view = (page: number): PdfReadingView => ({
      anchor: { page, fraction: 0.3 },
      horizontal: 40,
      zoom: "fit-width",
      preferred: page,
    });
  const original = view(1);
  history.record(original);
  original.anchor.page = 99;
  history.record(view(2));
  history.record(view(3));
  assert.deepEqual(history.counts, { back: 2, forward: 0 });
  assert.equal(history.back(view(19))!.anchor.page, 3);
  assert.equal(history.back(view(3))!.anchor.page, 2);
  assert.equal(history.back(view(2)), undefined);
  assert.equal(history.forward(view(2))!.anchor.page, 3);
  assert.equal(history.forward(view(3))!.anchor.page, 19);
  history.back(view(19));
  history.record(view(4));
  assert.equal(history.counts.forward, 0);
  history.clear();
  assert.deepEqual(history.counts, { back: 0, forward: 0 });
});
