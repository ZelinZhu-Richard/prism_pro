import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from "lucide-react";
import { PAGE_PADDING, type PdfPageSize } from "../pdf-layout";
import { PdfPage } from "./PdfPage";

export function PdfPresentation({
  pdf,
  sizes,
  initialPage,
  onClose,
}: {
  pdf: PDFDocumentProxy;
  sizes: PdfPageSize[];
  initialPage: number;
  onClose: (page: number) => void;
}) {
  const [page, setPage] = useState(initialPage),
    [size, setSize] = useState({ width: 800, height: 600 }),
    [fallback, setFallback] = useState(false);
  const root = useRef<HTMLDialogElement>(null),
    host = useRef<HTMLDivElement>(null),
    area = useRef<HTMLDivElement>(null),
    lastWheel = useRef(0),
    wheel = useRef(0),
    latest = useRef({ page, onClose });
  latest.current = { page, onClose };
  const close = () => latest.current.onClose(latest.current.page);
  useLayoutEffect(() => {
    const element = root.current!,
      fullscreenRoot = host.current!,
      previous = document.activeElement as HTMLElement | null;
    element.showModal();
    element.focus();
    const observer = new ResizeObserver(() =>
      setSize({
        width: area.current!.clientWidth,
        height: area.current!.clientHeight,
      }),
    );
    observer.observe(area.current!);
    let mounted = true,
      entered = false;
    const change = () => {
      if (document.fullscreenElement === fullscreenRoot) {
        entered = true;
        setFallback(false);
      } else if (entered) {
        // Embedded viewers may immediately leave native fullscreen. Keep the
        // presentation usable in the window; Escape/Exit still close it.
        setFallback(true);
        element.focus({ preventScroll: true });
      }
    };
    document.addEventListener("fullscreenchange", change);
    if (fullscreenRoot.requestFullscreen)
      void fullscreenRoot.requestFullscreen().catch(() => {
        if (mounted) setFallback(true);
      });
    else setFallback(true);
    return () => {
      mounted = false;
      observer.disconnect();
      document.removeEventListener("fullscreenchange", change);
      if (document.fullscreenElement === fullscreenRoot)
        void document.exitFullscreen().catch(() => {});
      element.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  // Keep app-wide editing shortcuts out of the presentation and trap keyboard
  // focus within its controls, including the browser-window fallback.
  useEffect(() => {
    const scroll = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (Date.now() - lastWheel.current < 400) return;
      wheel.current +=
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      if (Math.abs(wheel.current) > 60) {
        setPage((p) =>
          Math.max(1, Math.min(sizes.length, p + Math.sign(wheel.current))),
        );
        wheel.current = 0;
        lastWheel.current = Date.now();
      }
    };
    const element = root.current!;
    element.addEventListener("wheel", scroll, { passive: false });
    const key = (event: KeyboardEvent) => {
      if (!root.current?.contains(event.target as Node)) return;
      const control = (event.target as HTMLElement).closest("button");
      if (event.key === "Tab") {
        const buttons = [
          ...root.current.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        ];
        const first = buttons[0],
          last = buttons.at(-1);
        if (event.shiftKey && (!control || control === first)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && control === last) {
          event.preventDefault();
          first?.focus();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(control && (event.key === " " || event.key === "Enter"))
      ) {
        let next: number | undefined;
        if (
          ["ArrowRight", "ArrowDown", "PageDown"].includes(event.key) ||
          (event.key === " " && !event.shiftKey)
        )
          next = latest.current.page + 1;
        if (
          ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key) ||
          (event.key === " " && event.shiftKey)
        )
          next = latest.current.page - 1;
        if (event.key === "Home") next = 1;
        if (event.key === "End") next = sizes.length;
        if (next !== undefined) {
          event.preventDefault();
          setPage(Math.max(1, Math.min(sizes.length, next)));
        }
      }
      event.stopPropagation();
    };
    document.addEventListener("keydown", key, true);
    // Some browsers consume Escape's keydown while exiting native fullscreen,
    // but deliver keyup to the document after restoring its window.
    const release = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keyup", release, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("keyup", release, true);
      element.removeEventListener("wheel", scroll);
    };
  }, [sizes.length, size.height]);
  const paper = sizes[page - 1],
    scale = Math.min(
      (size.width - 2 * PAGE_PADDING) / paper.width,
      (size.height - 2 * PAGE_PADDING) / paper.height,
    );
  return createPortal(
    <div ref={host} className="pdf-presentation-host">
      <dialog
        className="pdf-presentation"
        ref={root}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="PDF presentation"
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
      >
        <div className="pdf-presentation-paper" ref={area}>
          <PdfPage
            key={page}
            pdf={pdf}
            layout={{
              page,
              top: PAGE_PADDING,
              scale: Math.max(0.001, scale),
              width: paper.width * Math.max(0.001, scale),
              height: paper.height * Math.max(0.001, scale),
            }}
            active
            selected={false}
          />
        </div>
        <div className="pdf-presentation-controls">
          <span>
            {fallback ? "Window presentation · " : ""}Arrow keys to navigate ·
            Esc to exit
          </span>
          <button
            aria-label="Previous presentation page"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span role="status" aria-live="polite">
            {page} / {sizes.length}
          </span>
          <button
            aria-label="Next presentation page"
            disabled={page >= sizes.length}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={18} />
          </button>
          <button aria-label="Exit presentation" onClick={close}>
            <X size={18} />
          </button>
          <button
            aria-label={
              fallback
                ? "Enter fullscreen presentation"
                : "Use window presentation"
            }
            onClick={() => {
              if (document.fullscreenElement === host.current)
                void document.exitFullscreen().catch(() => setFallback(true));
              else if (host.current?.requestFullscreen)
                void host.current
                  .requestFullscreen()
                  .catch(() => setFallback(true));
            }}
          >
            {fallback ? <Maximize size={18} /> : <Minimize size={18} />}
          </button>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
