import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  PdfLinks,
  pdfLinkRegions,
  pointInPdfRegion,
  type PdfLink,
  type PdfLinkTarget,
  type PdfViewport,
} from "../pdf-links";

export interface PdfLinkLayerHandle {
  at(x: number, y: number): PdfLink | undefined;
  activateAt(x: number, y: number): boolean;
}
export const PdfLinkLayer = forwardRef<
  PdfLinkLayerHandle,
  {
    pdf: PDFDocumentProxy;
    links: PdfLinks;
    page: number;
    scale: number;
    enabled: boolean;
    onActivate: (target: PdfLinkTarget) => void;
    onFocusChange: (focused: boolean) => void;
  }
>(function PdfLinkLayer(
  { pdf, links, page, scale, enabled, onActivate, onFocusChange },
  ref,
) {
  const [data, setData] = useState<{
      links: PdfLink[];
      viewport: PdfViewport;
      skipped: number;
    } | null>(null),
    [error, setError] = useState("");
  const anchors = useRef(new Map<string, HTMLAnchorElement>());
  useEffect(() => {
    setError("");
    setData(null);
    if (!enabled) return;
    const controller = new AbortController();
    void Promise.all([links.page(page, controller.signal), pdf.getPage(page)])
      .then(([result, source]) => {
        if (!controller.signal.aborted)
          setData({ ...result, viewport: source.getViewport({ scale: 1 }) });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "PDF links could not be read. Download the PDF to inspect them.",
          );
      });
    return () => controller.abort();
  }, [pdf, links, page, enabled]);
  const positioned = useMemo(
    () =>
      data?.links.flatMap((link) => {
        const regions = pdfLinkRegions(link, data.viewport);
        if (!regions.length) return [];
        const left = Math.min(...regions.map((r) => r.left)),
          top = Math.min(...regions.map((r) => r.top));
        return [
          {
            link,
            regions,
            left,
            top,
            width: Math.max(...regions.map((r) => r.left + r.width)) - left,
            height: Math.max(...regions.map((r) => r.top + r.height)) - top,
          },
        ];
      }) ?? [],
    [data],
  );
  function at(x: number, y: number) {
    return enabled
      ? positioned.findLast((item) =>
          item.regions.some((region) =>
            pointInPdfRegion(x / scale, y / scale, region),
          ),
        )?.link
      : undefined;
  }
  useImperativeHandle(
    ref,
    () => ({
      at,
      activateAt(x, y) {
        const link = at(x, y);
        if (!link) return false;
        anchors.current.get(link.id)?.click();
        return true;
      },
    }),
    [positioned, enabled, scale],
  );
  return (
    <>
      <div
        className="pdf-link-layer"
        data-links-ready={!!data}
        onFocusCapture={() => onFocusChange(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            onFocusChange(false);
        }}
      >
        {enabled &&
          positioned.map(({ link, left, top, width, height }) => (
            <a
              key={link.id}
              ref={(element) => {
                if (element) anchors.current.set(link.id, element);
                else anchors.current.delete(link.id);
              }}
              className="pdf-link-anchor"
              aria-label={link.label}
              href={
                link.target.kind === "url"
                  ? link.target.url
                  : "#pdf-destination"
              }
              target={link.target.kind === "url" ? "_blank" : undefined}
              rel={
                link.target.kind === "url" ? "noopener noreferrer" : undefined
              }
              title={`${link.label} · Click to follow · drag to select`}
              style={{
                left: left * scale,
                top: top * scale,
                width: width * scale,
                height: height * scale,
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (link.target.kind !== "url") event.preventDefault();
                onActivate(link.target);
              }}
            />
          ))}
      </div>
      {(error || !!data?.skipped) && (
        <span className="pdf-links-unavailable">
          {error || `${data!.skipped} invalid PDF link regions were skipped`}
        </span>
      )}
    </>
  );
});
