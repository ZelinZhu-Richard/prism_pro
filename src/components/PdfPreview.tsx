import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
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
GlobalWorkerOptions.workerSrc = workerUrl;
interface Props {
  url?: string;
  onInverse: (page: number, x: number, y: number) => void;
  targetPage?: number;
  targetLocation?: { page: number; x: number; y: number; nonce: number };
  stale: boolean;
}
export function PdfPreview({
  url,
  onInverse,
  targetPage,
  targetLocation,
  stale,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [scale, setScale] = useState(1),
    [width, setWidth] = useState(400),
    [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    viewportRef = useRef<any>(null),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    if (container.current) obs.observe(container.current);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!url) {
      setPdf(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    const task = getDocument({
      url,
      disableAutoFetch: true,
    });
    task.promise
      .then((doc) => {
        if (!cancelled) {
          setPdf(doc);
          setPage((p) => Math.min(p, doc.numPages));
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
  useEffect(() => {
    if (targetPage && pdf)
      setPage(Math.max(1, Math.min(targetPage, pdf.numPages)));
  }, [targetPage, targetLocation?.nonce, pdf]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false,
      task: any;
    void pdf
      .getPage(page)
      .then((p) => {
        if (cancelled) return;
        const natural = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({
          scale: Math.max(0.2, (width - 48) / natural.width) * scale,
        });
        viewportRef.current = viewport;
        const c = canvas.current!,
          ratio = window.devicePixelRatio || 1;
        c.width = Math.floor(viewport.width * ratio);
        c.height = Math.floor(viewport.height * ratio);
        c.style.width = viewport.width + "px";
        c.style.height = viewport.height + "px";
        task = p.render({
          canvas: c,
          canvasContext: c.getContext("2d")!,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        return task.promise.then(() => {
          if (!cancelled && targetLocation?.page === page && container.current)
            container.current.scrollTo({
              top: Math.max(0, targetLocation.y * viewport.scale - 100),
              left: Math.max(0, targetLocation.x * viewport.scale - 100),
            });
        });
      })
      .catch((e) => {
        if (e?.name !== "RenderingCancelledException" && !cancelled)
          setError("PDF rendering failed.");
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, width, scale, targetLocation?.nonce]);
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <div className="page-controls">
          <button
            aria-label="Previous PDF page"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            {page}
            <span className="muted"> / {pdf?.numPages ?? "—"}</span>
          </span>
          <button
            aria-label="Next PDF page"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => setPage((p) => p + 1)}
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
      <div className="pdf-pages" ref={container}>
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
          <canvas
            ref={canvas}
            aria-label={`PDF page ${page}. Double-click to find source.`}
            onDoubleClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect(),
                v = viewportRef.current;
              if (v)
                onInverse(
                  page,
                  (e.clientX - r.left) / v.scale,
                  (e.clientY - r.top) / v.scale,
                );
            }}
          />
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
