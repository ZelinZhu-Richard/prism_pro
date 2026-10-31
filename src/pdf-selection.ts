export function samePdfRange(a: Range | null, b: Range | null) {
  if (!a || !b) return false;
  try {
    return (
      a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
      a.compareBoundaryPoints(Range.END_TO_END, b) === 0
    );
  } catch {
    return false;
  }
}
function inside(node: Node | null, root: HTMLElement) {
  return !!node && root.contains(node);
}
export function pdfSelectionPages(
  selection: Selection | null,
  root: HTMLElement,
) {
  if (
    !selection?.rangeCount ||
    selection.isCollapsed ||
    !inside(selection.anchorNode, root) ||
    !inside(selection.focusNode, root)
  )
    return [];
  const pageOf = (node: Node | null) =>
    Number(
      (node?.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node?.parentElement
      )?.closest<HTMLElement>(".pdf-page")?.dataset.page,
    );
  const start = pageOf(selection.getRangeAt(0).startContainer),
    end = pageOf(selection.getRangeAt(selection.rangeCount - 1).endContainer);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < 1
  )
    return [];
  return Array.from(
    { length: Math.abs(end - start) + 1 },
    (_, i) => Math.min(start, end) + i,
  );
}
// Copy only selected PDF spans/line breaks, excluding page placeholders and app UI.
export function selectedPdfText(
  selection: Selection | null,
  root: HTMLElement,
): string | null {
  if (
    !selection?.rangeCount ||
    selection.isCollapsed ||
    !inside(selection.anchorNode, root) ||
    !inside(selection.focusNode, root)
  )
    return null;
  const chunks: string[] = [];
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    for (const layer of root.querySelectorAll<HTMLElement>(
      ".pdf-text-layer[data-ready='true']",
    )) {
      if (!range.intersectsNode(layer)) continue;
      const bounds = document.createRange();
      bounds.selectNodeContents(layer);
      const clipped = range.cloneRange();
      if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0)
        clipped.setStart(bounds.startContainer, bounds.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0)
        clipped.setEnd(bounds.endContainer, bounds.endOffset);
      const fragment = clipped.cloneContents(),
        walk = document.createTreeWalker(
          fragment,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        );
      let node: Node | null,
        text = "";
      while ((node = walk.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
        else if ((node as Element).tagName === "BR") text += "\n";
      }
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n").replace(/\0/g, "");
}
export function pdfSourcePoint(
  viewport: {
    convertToPdfPoint(x: number, y: number): number[];
    viewBox: number[];
  },
  x: number,
  y: number,
) {
  const [left, bottom] = viewport.convertToPdfPoint(x, y),
    box = viewport.viewBox;
  return {
    x: left - Math.min(box[0], box[2]),
    y: Math.max(box[1], box[3]) - bottom,
  };
}
export function pdfPreviewPoint(
  viewport: {
    convertToViewportPoint(x: number, y: number): number[];
    viewBox: number[];
  },
  x: number,
  y: number,
) {
  const box = viewport.viewBox;
  const [left, top] = viewport.convertToViewportPoint(
    x + Math.min(box[0], box[2]),
    Math.max(box[1], box[3]) - y,
  );
  return { x: left, y: top };
}
