import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Minus,
  Plus,
  FileText,
  LoaderCircle,
} from "lucide-react";
import {
  layoutPdfPages,
  nearPdfPage,
  pdfAnchor,
  scrollForPdfAnchor,
  visiblePdfPage,
  PAGE_PADDING,
  type PdfAnchor,
  type PdfPageLayout,
  type PdfPageSize,
} from "../pdf-layout";
GlobalWorkerOptions.workerSrc = workerUrl;
interface Props {
  url?: string;
  onInverse: (page: number, x: number, y: number) => void;
  targetPage?: number;
  targetLocation?: { page: number; x: number; y: number; nonce: number };
  stale: boolean;
}
function PdfPage({
  pdf,
  layout,
  active,
  onInverse,
}: {
  pdf: PDFDocumentProxy;
  layout: PdfPageLayout;
  active: boolean;
  onInverse: Props["onInverse"];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    const c = canvas.current;
    if (!active || !c) return;
    let cancelled = false,
      task: RenderTask | undefined;
    setError(false);
    setRendered(false);
    void pdf
      .getPage(layout.page)
      .then((p) => {
        if (cancelled) return;
        const viewport = p.getViewport({ scale: layout.scale });
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
          if (!cancelled) setRendered(true);
        });
      })
      .catch((e) => {
        if (!cancelled && e?.name !== "RenderingCancelledException")
          setError(true);
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, layout.page, layout.scale, active]);
  return (
    <div
      className="pdf-page"
      data-page={layout.page}
      style={{ width: layout.width, height: layout.height }}
    >
      {active && (
        <canvas
          key={layout.scale}
          ref={canvas}
          style={{ width: layout.width, height: layout.height }}
          aria-label={`PDF page ${layout.page}. Double-click to find source.`}
          data-rendered={rendered && !error ? "true" : "false"}
          onDoubleClick={(e) => {
            if (rendered && !error) {
              const r = e.currentTarget.getBoundingClientRect();
              onInverse(
                layout.page,
                (e.clientX - r.left) / layout.scale,
                (e.clientY - r.top) / layout.scale,
              );
            }
          }}
        />
      )}
      {(!active || !rendered || error) && (
        <div className="pdf-page-placeholder">
          {error
            ? `Page ${layout.page} could not be rendered. Try compiling again.`
            : `Page ${layout.page}`}
        </div>
      )}
    </div>
  );
}
export function PdfPreview({
  url,
  onInverse,
  targetPage,
  targetLocation,
  stale,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PdfPageSize[]>([]);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(400);
  const [view, setView] = useState({ top: 0, height: 700 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const anchor = useRef<PdfAnchor>({ page: 1, fraction: 0 });
  const frame = useRef(0);
  const lastTarget = useRef<{ page?: number; nonce?: number } | null>(null);
  const pages = useMemo(
    () => layoutPdfPages(sizes, width, scale),
    [sizes, width, scale],
  );
  const latestPages = useRef(pages);
  latestPages.current = pages;
  const readingEnabled = useRef(false);
  readingEnabled.current = !!pdf && !loading && pages.length > 0;
  const page = visiblePdfPage(pages, view.top, view.height);
  function readScroll() {
    const c = container.current;
    if (!c || !readingEnabled.current) return;
    anchor.current = pdfAnchor(latestPages.current, c.scrollTop);
    setView({ top: c.scrollTop, height: c.clientHeight });
  }
  useEffect(() => {
    const c = container.current;
    if (!c) return;
    const obs = new ResizeObserver(() => {
      setWidth(c.clientWidth);
      setView((v) => ({ ...v, height: c.clientHeight }));
    });
    obs.observe(c);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, []);
  useEffect(() => {
    setPdf(null);
    setSizes([]);
    setError("");
    setLoading(!!url);
    if (!url) {
      anchor.current = { page: 1, fraction: 0 };
      lastTarget.current = {
        page: targetLocation?.page ?? targetPage,
        nonce: targetLocation?.nonce,
      };
      return;
    }
    let cancelled = false;
    const task = getDocument({ url, disableAutoFetch: true });
    void task.promise
      .then(async (doc) => {
        // Reserve exact page dimensions first, avoiding layout shifts as pages render.
        const dimensions: PdfPageSize[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const p = await doc.getPage(n),
            v = p.getViewport({ scale: 1 });
          dimensions.push({ width: v.width, height: v.height });
        }
        if (!cancelled) {
          setPdf(doc);
          setSizes(dimensions);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("This PDF could not be loaded. Try compiling again.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);
  // Preserve a page-relative reading anchor on zoom, resize and recompilation.
  // Only a new SyncTeX request overrides it; ordinary scrolling never does.
  useLayoutEffect(() => {
    const c = container.current;
    if (!c || !pages.length || !pdf) return;
    const request = {
      page: targetLocation?.page ?? targetPage,
      nonce: targetLocation?.nonce,
    };
    const jump =
      request.page &&
      (request.page !== lastTarget.current?.page ||
        request.nonce !== lastTarget.current?.nonce);
    if (jump) {
      const p =
        pages[Math.max(0, Math.min(pages.length - 1, request.page! - 1))];
      c.scrollTop = Math.max(
        0,
        p.top +
          (targetLocation ? targetLocation.y * p.scale - 100 : -PAGE_PADDING),
      );
      if (targetLocation) {
        const widest = Math.max(
          width - 2 * PAGE_PADDING,
          ...pages.map((p) => p.width),
        );
        c.scrollLeft = Math.max(
          0,
          PAGE_PADDING +
            (widest - p.width) / 2 +
            targetLocation.x * p.scale -
            100,
        );
      }
      lastTarget.current = request;
    } else c.scrollTop = scrollForPdfAnchor(pages, anchor.current);
    readScroll();
  }, [pages, pdf, targetPage, targetLocation?.nonce]);
  function goTo(number: number) {
    const p = pages[Math.max(0, Math.min(pages.length - 1, number - 1))];
    if (!p || !container.current) return;
    container.current.scrollTop = Math.max(0, p.top - PAGE_PADDING);
    readScroll();
  }
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <div className="page-controls">
          <button
            aria-label="Previous PDF page"
            disabled={!pdf || page <= 1}
            onClick={() => goTo(page - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span aria-label="Current PDF page">
            {page}
            <span className="muted"> / {pdf?.numPages ?? "—"}</span>
          </span>
          <button
            aria-label="Next PDF page"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => goTo(page + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="toolbar-actions">
          <button
            aria-label="Zoom out"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
          >
            <Minus size={15} />
          </button>
          <button
            className="zoom-label"
            title="Fit to width"
            onClick={() => setScale(1)}
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => setScale((s) => Math.min(2, s + 0.15))}
          >
            <Plus size={15} />
          </button>
          <button aria-label="Fit PDF to width" onClick={() => setScale(1)}>
            <Expand size={15} />
          </button>
          {url && (
            <a
              className="icon-button"
              href={url}
              download="document.pdf"
              aria-label="Download PDF"
            >
              <Download size={15} />
            </a>
          )}
        </div>
      </div>
      {stale && pdf && (
        <div className="stale-banner">
          Preview from the last successful build
        </div>
      )}
      <div
        className="pdf-pages"
        ref={container}
        role="region"
        aria-label="PDF preview pages"
        tabIndex={0}
        onScroll={() => {
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(readScroll);
        }}
        onKeyDown={(e) => {
          if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            e.currentTarget.scrollTop =
              e.key === "Home" ? 0 : e.currentTarget.scrollHeight;
            readScroll();
          }
        }}
      >
        {loading ? (
          <div className="empty-preview">
            <LoaderCircle className="spin" size={24} />
            <p>Preparing your preview…</p>
          </div>
        ) : error ? (
          <div className="empty-preview">
            <p>{error}</p>
          </div>
        ) : pdf ? (
          <div className="pdf-stack">
            {pages.map((p) => (
              <PdfPage
                key={p.page}
                pdf={pdf}
                layout={p}
                active={nearPdfPage(p, view.top, view.height)}
                onInverse={onInverse}
              />
            ))}
          </div>
        ) : (
          <div className="empty-preview">
            <div className="paper-outline">
              <FileText size={32} strokeWidth={1} />
            </div>
            <h3>Your ideas, on paper.</h3>
            <p>Compile your document to see it here.</p>
            <kbd>⌘ Enter</kbd>
          </div>
        )}
      </div>
      <div className="pdf-footer">
        <span>PDF PREVIEW</span>
        <span>Double-click to find source</span>
      </div>
    </div>
  );
}
