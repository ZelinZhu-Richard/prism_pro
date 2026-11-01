export const PAGE_GAP = 20;
export const PAGE_PADDING = 24;
export const PDF_CSS_UNITS = 96 / 72;
export type PdfZoom = number | "fit-width" | "fit-height";
export const PDF_ZOOM_MIN = 0.1;
export const PDF_ZOOM_MAX = 4;
export function pdfZoomScale(
  sizes: PdfPageSize[],
  width: number,
  height: number,
  zoom: PdfZoom,
) {
  if (typeof zoom === "number")
    return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoom)) * PDF_CSS_UNITS;
  const extent =
    zoom === "fit-width"
      ? Math.max(1, ...sizes.map((p) => p.width))
      : Math.max(1, ...sizes.map((p) => p.height));
  return Math.max(
    0.001,
    ((zoom === "fit-width" ? width : height) - 2 * PAGE_PADDING) / extent,
  );
}
export function parsePdfZoom(value: string): number | null {
  const text = value.trim().replace(/%$/, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const percent = Number(text);
  return percent >= PDF_ZOOM_MIN * 100 && percent <= PDF_ZOOM_MAX * 100
    ? percent / 100
    : null;
}
export function parsePdfPage(value: string, count: number): number | null {
  return /^\d+$/.test(value.trim()) &&
    Number(value) >= 1 &&
    Number(value) <= count
    ? Number(value)
    : null;
}
export function pdfRasterRatio(
  width: number,
  height: number,
  pixelRatio: number,
) {
  // Keep high zoom and large sheets below browser canvas limits, while CSS and
  // the text/SyncTeX viewport retain their exact display dimensions.
  return Math.min(
    Math.max(1, pixelRatio),
    8192 / Math.max(1, width, height),
    Math.sqrt((16 * 1024 * 1024) / Math.max(1, width * height)),
  );
}
export interface PdfPageSize {
  width: number;
  height: number;
}
export interface PdfPageLayout extends PdfPageSize {
  page: number;
  top: number;
  scale: number;
}
export interface PdfAnchor {
  page: number;
  fraction: number;
}

export function layoutPdfPages(
  sizes: PdfPageSize[],
  width: number,
  zoom: PdfZoom,
  height = 700,
): PdfPageLayout[] {
  const scale = pdfZoomScale(sizes, width, height, zoom);
  let top = PAGE_PADDING;
  return sizes.map((size, index) => {
    const page = {
      page: index + 1,
      width: size.width * scale,
      height: size.height * scale,
      scale,
      top,
    };
    top += page.height + PAGE_GAP;
    return page;
  });
}
export function visiblePdfPage(
  pages: PdfPageLayout[],
  top: number,
  height: number,
  preferred?: number,
) {
  // At low zoom several pages can be fully visible, especially at the document
  // end where scrolling clamps. Keep an explicitly navigated page current.
  const target = preferred === undefined ? undefined : pages[preferred - 1];
  if (
    target &&
    target.top >= top - 1 &&
    target.top + target.height <= top + height + 1
  )
    return target.page;
  let visible = 1,
    largest = -1;
  for (const p of pages) {
    const overlap = Math.max(
      0,
      Math.min(top + height, p.top + p.height) - Math.max(top, p.top),
    );
    // Fractional page sizes can differ by rounding noise; tied full pages keep
    // their document order instead of making the counter jump unpredictably.
    if (overlap > largest + 0.01) {
      largest = overlap;
      visible = p.page;
    }
  }
  return visible;
}
export function pdfAnchor(pages: PdfPageLayout[], top: number): PdfAnchor {
  const point = top + PAGE_PADDING;
  const page = pages.find((p) => p.top + p.height > point) || pages.at(-1);
  return page
    ? {
        page: page.page,
        fraction: Math.max(0, Math.min(1, (point - page.top) / page.height)),
      }
    : { page: 1, fraction: 0 };
}
export function scrollForPdfAnchor(pages: PdfPageLayout[], anchor: PdfAnchor) {
  const p = pages[Math.max(0, Math.min(pages.length - 1, anchor.page - 1))];
  return p ? Math.max(0, p.top + p.height * anchor.fraction - PAGE_PADDING) : 0;
}
export function nearPdfPage(page: PdfPageLayout, top: number, height: number) {
  return page.top + page.height >= top - 800 && page.top <= top + height + 800;
}
