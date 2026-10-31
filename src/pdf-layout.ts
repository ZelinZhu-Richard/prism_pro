export const PAGE_GAP = 20;
export const PAGE_PADDING = 24;
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
  zoom: number,
): PdfPageLayout[] {
  const widest = Math.max(1, ...sizes.map((p) => p.width));
  const scale = Math.max(0.2, (width - 2 * PAGE_PADDING) / widest) * zoom;
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
) {
  let visible = 1,
    largest = -1;
  for (const p of pages) {
    const overlap = Math.max(
      0,
      Math.min(top + height, p.top + p.height) - Math.max(top, p.top),
    );
    if (overlap > largest) {
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
