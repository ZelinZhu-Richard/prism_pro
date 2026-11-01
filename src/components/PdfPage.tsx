import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { pdfRasterRatio, type PdfPageLayout } from "../pdf-layout";
import type { PdfSearchMatch } from "../pdf-search";
import { boundedTextStream } from "../pdf-text";
import { pdfSourcePoint } from "../pdf-selection";
import { PdfLinkLayer, type PdfLinkLayerHandle } from "./PdfLinkLayer";
import type { PdfLinks, PdfLinkTarget } from "../pdf-links";

export function PdfPage({
  pdf,
  layout,
  active,
  selected,
  onInverse,
  matches,
  currentMatch,
  onMatchReady,
  links,
  onLink,
}: {
  pdf: PDFDocumentProxy;
  layout: PdfPageLayout;
  active: boolean;
  selected: boolean;
  onInverse?: (page: number, x: number, y: number) => void;
  matches?: PdfSearchMatch[];
  currentMatch?: PdfSearchMatch;
  onMatchReady?: (element: HTMLElement) => void;
  links?: PdfLinks;
  onLink?: (target: PdfLinkTarget) => void;
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
  const highlights = useRef<HTMLDivElement>(null);
  const linkLayer = useRef<PdfLinkLayerHandle>(null),
    pointerStart = useRef<{ x: number; y: number; dragged: boolean } | null>(
      null,
    );
  const [linkFocused, setLinkFocused] = useState(false),
    [linkTitle, setLinkTitle] = useState(""),
    [hoveredLink, setHoveredLink] = useState(false);
  const [highlightLimit, setHighlightLimit] = useState(false);
  const textActive = active || selected || linkFocused;
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
        const ratio = pdfRasterRatio(
          viewport.width,
          viewport.height,
          window.devicePixelRatio || 1,
        );
        c.width = Math.max(1, Math.floor(viewport.width * ratio));
        c.height = Math.max(1, Math.floor(viewport.height * ratio));
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
  useLayoutEffect(() => {
    const root = highlights.current,
      layer = textInstance.current?.layer;
    if (!root) return;
    root.replaceChildren();
    setHighlightLimit(false);
    if (textStatus !== "ready" || !textActive || !layer || !matches?.length)
      return;
    const bounds = root.getBoundingClientRect(),
      fragment = document.createDocumentFragment();
    let count = 0,
      limited = false,
      currentElement: HTMLElement | undefined;
    // Prioritize the selected result, even on a page with very dense matches.
    const ordered = currentMatch
      ? [currentMatch, ...matches.filter((m) => m !== currentMatch)]
      : matches;
    outer: for (const match of ordered)
      for (const part of match.parts) {
        const node = layer.textDivs[part.item]?.firstChild;
        if (
          !node ||
          node.nodeType !== Node.TEXT_NODE ||
          part.to > (node.textContent?.length ?? 0)
        )
          continue;
        const range = document.createRange();
        range.setStart(node, part.from);
        range.setEnd(node, part.to);
        for (const rect of range.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (count++ >= 5000) {
            limited = true;
            break outer;
          }
          const mark = document.createElement("span");
          mark.className =
            "pdf-search-mark" + (match === currentMatch ? " current" : "");
          Object.assign(mark.style, {
            left: `${rect.left - bounds.left}px`,
            top: `${rect.top - bounds.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          });
          fragment.append(mark);
          if (match === currentMatch && !currentElement) currentElement = mark;
        }
      }
    root.append(fragment);
    setHighlightLimit(limited);
    if (currentElement) onMatchReady?.(currentElement);
  }, [matches, currentMatch, textStatus, textActive, layout.scale]);
  return (
    <div
      className="pdf-page"
      data-page={layout.page}
      role="group"
      aria-label={`PDF page ${layout.page}`}
      title={linkTitle || undefined}
      data-hovered-link={hoveredLink || undefined}
      style={
        {
          width: layout.width,
          height: layout.height,
          "--total-scale-factor": layout.scale,
          "--scale-round-x": "0.001px",
          "--scale-round-y": "0.001px",
        } as CSSProperties
      }
      onPointerDown={(event) => {
        if (event.button === 0)
          pointerStart.current = {
            x: event.clientX,
            y: event.clientY,
            dragged: false,
          };
      }}
      onPointerMove={(event) => {
        const start = pointerStart.current;
        if (
          start &&
          event.buttons === 1 &&
          Math.hypot(start.x - event.clientX, start.y - event.clientY) > 4
        )
          start.dragged = true;
        if (!links || !onLink) return;
        const bounds = event.currentTarget.getBoundingClientRect(),
          link = linkLayer.current?.at(
            event.clientX - bounds.left,
            event.clientY - bounds.top,
          );
        setLinkTitle(
          link ? `${link.label} · Click to follow · drag to select` : "",
        );
        setHoveredLink(!!link);
      }}
      onPointerLeave={(event) => {
        setLinkTitle("");
        setHoveredLink(false);
        if (pointerStart.current && event.buttons === 1)
          pointerStart.current.dragged = true;
      }}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.detail > 1 ||
          event.target instanceof HTMLAnchorElement
        )
          return;
        const start = pointerStart.current;
        pointerStart.current = null;
        const selection = window.getSelection();
        if (
          !start ||
          start.dragged ||
          Math.hypot(start.x - event.clientX, start.y - event.clientY) > 4 ||
          (selection &&
            !selection.isCollapsed &&
            event.currentTarget.contains(selection.anchorNode) &&
            event.currentTarget.contains(selection.focusNode))
        )
          return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          linkLayer.current?.activateAt(
            event.clientX - bounds.left,
            event.clientY - bounds.top,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDoubleClick={(e) => {
        if (e.target instanceof HTMLAnchorElement) return;
        if (!rendered || !onInverse || !canvasViewport.current) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          linkLayer.current?.at(e.clientX - bounds.left, e.clientY - bounds.top)
        )
          return;
        const point = pdfSourcePoint(
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
      <div
        ref={highlights}
        className="pdf-search-highlights"
        aria-hidden="true"
      />
      {links && onLink && (
        <PdfLinkLayer
          ref={linkLayer}
          pdf={pdf}
          links={links}
          page={layout.page}
          scale={layout.scale}
          enabled={active || linkFocused}
          onActivate={onLink}
          onFocusChange={setLinkFocused}
        />
      )}
      {highlightLimit && (
        <span className="pdf-text-unavailable">
          Some highlights omitted · every match remains navigable
        </span>
      )}
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
