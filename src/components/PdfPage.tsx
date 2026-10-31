import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import type { PdfPageLayout } from "../pdf-layout";
import { boundedTextStream } from "../pdf-text";
import { pdfSourcePoint } from "../pdf-selection";

export function PdfPage({
  pdf,
  layout,
  active,
  selected,
  onInverse,
}: {
  pdf: PDFDocumentProxy;
  layout: PdfPageLayout;
  active: boolean;
  selected: boolean;
  onInverse?: (page: number, x: number, y: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null);
  const latest = useRef(layout);
  latest.current = layout;
  const textInstance = useRef<{ page: PDFPageProxy; layer: TextLayer } | null>(
    null,
  );
  const canvasViewport = useRef<ReturnType<PDFPageProxy["getViewport"]> | null>(
    null,
  );
  const [paint, setPaint] = useState<{
    pdf: PDFDocumentProxy;
    scale: number;
    error?: boolean;
  } | null>(null);
  const [textStatus, setTextStatus] = useState<
    "idle" | "ready" | "empty" | "error"
  >("idle");
  const textActive = active || selected;
  const rendered =
    active &&
    paint?.pdf === pdf &&
    paint.scale === layout.scale &&
    !paint.error;
  const error =
    active && paint?.pdf === pdf && paint.scale === layout.scale && paint.error;
  useEffect(() => {
    const c = canvas.current;
    if (!active || !c) return;
    let cancelled = false,
      task: RenderTask | undefined;
    void pdf
      .getPage(layout.page)
      .then((p) => {
        if (cancelled) return;
        const viewport = p.getViewport({ scale: layout.scale });
        canvasViewport.current = viewport;
        const ratio = window.devicePixelRatio || 1;
        c.width = Math.floor(viewport.width * ratio);
        c.height = Math.floor(viewport.height * ratio);
        task = p.render({
          canvas: c,
          canvasContext: c.getContext("2d")!,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        return task.promise.then(() => {
          if (!cancelled) setPaint({ pdf, scale: layout.scale });
        });
      })
      .catch((e) => {
        if (!cancelled && e?.name !== "RenderingCancelledException")
          setPaint({ pdf, scale: layout.scale, error: true });
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, layout.page, layout.scale, active]);
  useEffect(() => {
    const container = text.current;
    if (!container || !textActive) return;
    let cancelled = false,
      task: TextLayer | undefined;
    setTextStatus("idle");
    void pdf
      .getPage(layout.page)
      .then(async (p) => {
        if (cancelled) return;
        task = new TextLayer({
          textContentSource: boundedTextStream(
            p.streamTextContent({
              includeMarkedContent: true,
              disableNormalization: true,
            }),
          ),
          container,
          viewport: p.getViewport({ scale: latest.current.scale }),
        });
        textInstance.current = { page: p, layer: task };
        await task.render();
        if (!cancelled)
          setTextStatus(
            task.textContentItemsStr.some((s) => s.trim()) ? "ready" : "empty",
          );
      })
      .catch(() => {
        if (!cancelled) {
          container.replaceChildren();
          setTextStatus("error");
        }
      });
    return () => {
      cancelled = true;
      task?.cancel();
      textInstance.current = null;
      container.replaceChildren();
      setTextStatus("idle");
    };
  }, [pdf, layout.page, textActive]);
  useLayoutEffect(() => {
    const current = textInstance.current;
    current?.layer.update({
      viewport: current.page.getViewport({ scale: layout.scale }),
    });
  }, [layout.scale]);
  return (
    <div
      className="pdf-page"
      data-page={layout.page}
      role="group"
      aria-label={`PDF page ${layout.page}`}
      style={
        {
          width: layout.width,
          height: layout.height,
          "--total-scale-factor": layout.scale,
          "--scale-round-x": "0.001px",
          "--scale-round-y": "0.001px",
        } as CSSProperties
      }
      onDoubleClick={(e) => {
        if (!rendered || !onInverse || !canvasViewport.current) return;
        const bounds = e.currentTarget.getBoundingClientRect(),
          point = pdfSourcePoint(
            canvasViewport.current,
            e.clientX - bounds.left,
            e.clientY - bounds.top,
          );
        onInverse(layout.page, point.x, point.y);
      }}
    >
      {active && (
        <canvas
          key={layout.scale}
          ref={canvas}
          style={{ width: layout.width, height: layout.height }}
          aria-hidden={textStatus === "ready" ? true : undefined}
          aria-label={
            textStatus === "ready" ? undefined : `PDF page ${layout.page}.`
          }
          data-rendered={rendered ? "true" : "false"}
        />
      )}
      <div
        ref={text}
        className="pdf-text-layer"
        role="document"
        aria-label={`Selectable text for PDF page ${layout.page}`}
        data-ready={textStatus === "ready" ? "true" : "false"}
        hidden={textStatus !== "ready"}
      />
      {(!active || !rendered || error) && (
        <div className="pdf-page-placeholder" aria-hidden="true">
          {error
            ? `Page ${layout.page} could not be rendered. Try compiling again.`
            : `Page ${layout.page}`}
        </div>
      )}
      {rendered && ["empty", "error"].includes(textStatus) && (
        <span className="pdf-text-unavailable">
          {textStatus === "empty"
            ? "No selectable text on this page"
            : "Text selection unavailable · use text view or download"}
        </span>
      )}
    </div>
  );
}
