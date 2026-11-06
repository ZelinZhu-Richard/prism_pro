import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  normalizeUnicode,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize,
  Search,
  Minus,
  Plus,
  FileText,
  LoaderCircle,
  TextSelect,
  ListTree,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import {
  layoutPdfPages,
  nearPdfPage,
  pdfAnchor,
  scrollForPdfAnchor,
  visiblePdfPage,
  PAGE_PADDING,
  PDF_CSS_UNITS,
  PDF_ZOOM_MIN,
  PDF_ZOOM_MAX,
  parsePdfPage,
  type PdfZoom,
  type PdfAnchor,
  type PdfPageSize,
} from "../pdf-layout";
import { PdfPage } from "./PdfPage";
import { Modal } from "./Modal";
import { PdfTextCache } from "../pdf-text";
import {
  PdfSearchIndex,
  defaultPdfSearchOptions,
  type PdfSearchMatch,
} from "../pdf-search";
import { searchPdfIndex } from "../pdf-search-client";
import { PdfFindBar } from "./PdfFindBar";
import { PdfZoomControl } from "./PdfZoomControl";
import { PdfPresentation } from "./PdfPresentation";
import { PdfBookmarks } from "./PdfBookmarks";
import { PdfLinks, pdfDestinationPlan, type PdfLinkTarget } from "../pdf-links";
import { PdfViewHistory, type PdfReadingView } from "../pdf-view-history";
import { pdfWorkspace, savePdfWorkspace } from "../workspace-session";
import {
  pdfSelectionPages,
  pdfPreviewPoint,
  samePdfRange,
  selectedPdfText,
} from "../pdf-selection";
GlobalWorkerOptions.workerSrc = workerUrl;
interface Props {
  active?: boolean;
  url?: string;
  workspaceProject?: string;
  onInverse?: (page: number, x: number, y: number) => void;
  targetLocation?: { page: number; x: number; y: number; nonce: number };
  stale: boolean;
  staleLabel?: string;
}
export function PdfPreview({
  active = true,
  url,
  workspaceProject,
  onInverse,
  targetLocation,
  stale,
  staleLabel = "Preview from the last successful build",
}: Props) {
  const [loaded, setLoaded] = useState<{
    url: string;
    pdf: PDFDocumentProxy;
  } | null>(null);
  const pdf = loaded && loaded.url === url ? loaded.pdf : null;
  const [sizes, setSizes] = useState<PdfPageSize[]>([]);
  const [zoom, setZoom] = useState<PdfZoom>("fit-width");
  const [width, setWidth] = useState(400);
  const [view, setView] = useState({ top: 0, height: 700 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [textOpen, setTextOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [pageInput, setPageInput] = useState("1"),
    [pageError, setPageError] = useState("");
  const [presentation, setPresentation] = useState<number | null>(null);
  const [findOpen, setFindOpen] = useState(false),
    [query, setQuery] = useState(""),
    [findOptions, setFindOptions] = useState(defaultPdfSearchOptions);
  const [findBusy, setFindBusy] = useState(false),
    [findStatus, setFindStatus] = useState("");
  const [findFocus, setFindFocus] = useState(0);
  const [bookmarksOpen, setBookmarksOpen] = useState(false),
    [linkStatus, setLinkStatus] = useState(""),
    [navigationTick, setNavigationTick] = useState(0);
  const bookmarksTrigger = useRef<HTMLButtonElement>(null);
  const navigation = useRef({
    operation: 0,
    controller: null as AbortController | null,
  });
  const pendingNavigation = useRef<
    | { page: number; x: number; y: number; focus: boolean }
    | { restore: PdfReadingView }
    | null
  >(null);
  const pdfHistory = useRef(new PdfViewHistory()),
    [historyCounts, setHistoryCounts] = useState({ back: 0, forward: 0 });
  const pageErrorId = useId();
  const [findResult, setFindResult] = useState<{
    source: PdfSearchIndex | null;
    matches: PdfSearchMatch[];
    active: number;
  }>({ source: null, matches: [], active: -1 });
  const findTrigger = useRef<HTMLButtonElement>(null),
    pendingMatch = useRef<PdfSearchMatch | null>(null);
  const selectAll = useRef<Range | null>(null);
  const copyOperation = useRef(0);
  const textCache = useMemo(
    () => (pdf ? new PdfTextCache(pdf, normalizeUnicode) : null),
    [pdf],
  );
  const searchIndex = useMemo(
    () => (pdf ? new PdfSearchIndex(pdf) : null),
    [pdf],
  );
  const pdfLinks = useMemo(() => (pdf ? new PdfLinks(pdf) : null), [pdf]);
  useEffect(() => () => pdfLinks?.dispose(), [pdfLinks]);
  const matches =
    findResult.source === searchIndex && findOpen ? findResult.matches : [];
  const currentMatch = matches[findResult.active];
  const pageMatches = useMemo(() => {
    const map = new Map<number, PdfSearchMatch[]>();
    for (const match of matches) {
      const list = map.get(match.page) ?? [];
      list.push(match);
      map.set(match.page, list);
    }
    return map;
  }, [findResult, searchIndex, findOpen]);
  const container = useRef<HTMLDivElement>(null);
  const anchor = useRef<PdfAnchor>({ page: 1, fraction: 0 });
  const preferredPage = useRef(1);
  const frame = useRef(0);
  const lastTarget = useRef<number>(undefined);
  const displayed = useRef(false);
  const restoredReading = useRef<PdfReadingView>(undefined);
  const pendingReading = useRef<{
    project: string;
    url: string;
    view: PdfReadingView;
  }>(undefined);
  const readingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pageViewports = useRef<ReturnType<PDFPageProxy["getViewport"]>[]>([]);
  const pages = useMemo(
    () => layoutPdfPages(sizes, width, zoom, view.height),
    [sizes, width, zoom, view.height],
  );
  const latestPages = useRef(pages);
  latestPages.current = pages;
  const latestZoom = useRef(zoom);
  latestZoom.current = zoom;
  const readingEnabled = useRef(false);
  readingEnabled.current = active && !!pdf && !loading && pages.length > 0;
  const page = visiblePdfPage(
    pages,
    view.top,
    view.height,
    preferredPage.current,
  );
  const percent =
    Math.round(((pages[0]?.scale ?? PDF_CSS_UNITS) / PDF_CSS_UNITS) * 1000) /
    10;
  const pageRef = useRef(page);
  pageRef.current = page;
  useEffect(() => {
    setPageInput(String(page));
    setPageError("");
  }, [page]);
  useEffect(() => () => searchIndex?.dispose(), [searchIndex]);
  useEffect(() => {
    const controller = new AbortController();
    setFindResult({ source: searchIndex, matches: [], active: -1 });
    pendingMatch.current = null;
    setFindStatus("");
    setFindBusy(false);
    if (!searchIndex || !findOpen || !query.trim()) return;
    setFindBusy(true);
    setFindStatus("Searching…");
    let hasText = true;
    const timer = setTimeout(
      () =>
        void searchIndex
          .load((n) => {
            if (!controller.signal.aborted)
              setFindStatus(`Reading page ${n} of ${pdf!.numPages}…`);
          })
          .then((index) => {
            hasText = index.some((p) => p.text.trim());
            return searchPdfIndex(index, query, findOptions, controller.signal);
          })
          .then((result) => {
            if (controller.signal.aborted) return;
            const next = Math.max(
              0,
              result.findIndex((match) => match.page >= pageRef.current),
            );
            selectMatch(result, result.length ? next : -1, searchIndex);
            setFindStatus(
              result.length
                ? ""
                : hasText
                  ? "No matches."
                  : "No extractable text. Scanned images need OCR.",
            );
          })
          .catch((error) => {
            if (!controller.signal.aborted)
              setFindStatus(
                error instanceof Error
                  ? error.message
                  : "Could not search this PDF.",
              );
          })
          .finally(() => {
            if (!controller.signal.aborted) setFindBusy(false);
          }),
      180,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchIndex, findOpen, query, findOptions]);
  function closeFind() {
    setFindOpen(false);
    searchIndex?.cancel();
    findTrigger.current?.focus();
  }
  function selectMatch(
    result: PdfSearchMatch[],
    active: number,
    source = searchIndex,
  ) {
    pendingMatch.current = result[active] ?? null;
    setFindResult({ source, matches: result, active });
    if (result[active]) goTo(result[active].page);
  }
  function stepMatch(step: number) {
    if (matches.length && !findBusy)
      selectMatch(
        matches,
        (findResult.active + step + matches.length) % matches.length,
      );
  }
  function matchReady(element: HTMLElement) {
    if (
      !pendingMatch.current ||
      pendingMatch.current !== currentMatch ||
      !container.current
    )
      return;
    pendingMatch.current = null;
    const c = container.current,
      outer = c.getBoundingClientRect(),
      mark = element.getBoundingClientRect();
    c.scrollTop += mark.top - outer.top - Math.min(100, c.clientHeight / 3);
    if (mark.left < outer.left + 20 || mark.right > outer.right - 20)
      c.scrollLeft += mark.left - outer.left - 24;
    readScroll();
  }
  function zoomStep(direction: number) {
    cancelPdfNavigation();
    setZoom(
      Math.max(
        PDF_ZOOM_MIN,
        Math.min(
          PDF_ZOOM_MAX,
          ((latestPages.current[0]?.scale ?? PDF_CSS_UNITS) / PDF_CSS_UNITS) *
            Math.pow(1.2, direction),
        ),
      ),
    );
  }
  function chooseZoom(value: PdfZoom) {
    cancelPdfNavigation();
    if (value === "fit-page") {
      const current = pageRef.current;
      pendingNavigation.current = {
        restore: {
          anchor: { page: current, fraction: 0 },
          horizontal: 0,
          preferred: current,
          zoom: value,
        },
      };
      setNavigationTick((tick) => tick + 1);
    }
    setZoom(value);
  }
  function readSelection() {
    const root = container.current;
    if (!root) return;
    const selection = window.getSelection();
    if (
      !selection?.rangeCount ||
      !samePdfRange(selectAll.current, selection.getRangeAt(0))
    )
      selectAll.current = null;
    const next = pdfSelectionPages(selection, root);
    setSelectedPages((prev) =>
      prev.length === next.length && prev.every((p, i) => p === next[i])
        ? prev
        : next,
    );
  }
  function readScroll() {
    const c = container.current;
    if (
      !c ||
      !readingEnabled.current ||
      c.clientWidth <= 0 ||
      c.clientHeight <= 0
    )
      return;
    preferredPage.current = visiblePdfPage(
      latestPages.current,
      c.scrollTop,
      c.clientHeight,
      preferredPage.current,
    );
    const reading = readingView();
    if (reading) anchor.current = reading.anchor;
    setView({ top: c.scrollTop, height: c.clientHeight });
    readSelection();
    if (workspaceProject && url && reading) {
      pendingReading.current = { project: workspaceProject, url, view: reading };
      readingTimer.current ??= setTimeout(flushReading, 150);
    }
  }
  function flushReading() {
    clearTimeout(readingTimer.current);
    readingTimer.current = undefined;
    const pending = pendingReading.current;
    pendingReading.current = undefined;
    if (pending) savePdfWorkspace(pending.project, pending.url, pending.view);
  }
  function cancelPdfNavigation(clearStatus = true) {
    if (clearStatus && navigation.current.controller)
      setLinkStatus((status) =>
        status === "Opening PDF destination…" ? "" : status,
      );
    navigation.current.operation++;
    navigation.current.controller?.abort();
    navigation.current.controller = null;
    pendingNavigation.current = null;
  }
  function readingView(): PdfReadingView | null {
    const c = container.current,
      current = latestPages.current;
    return c && current.length
      ? {
          anchor: pdfAnchor(
            current,
            c.scrollTop,
            latestZoom.current === "fit-page"
              ? { page: preferredPage.current, height: c.clientHeight }
              : undefined,
          ),
          horizontal: c.scrollLeft / current[0].scale,
          zoom: latestZoom.current,
          preferred: preferredPage.current,
        }
      : null;
  }
  function previousView(forward = false) {
    cancelPdfNavigation();
    const current = readingView();
    if (!current) return;
    const target = forward
      ? pdfHistory.current.forward(current)
      : pdfHistory.current.back(current);
    if (!target) return;
    pendingNavigation.current = { restore: target };
    setZoom(target.zoom);
    setHistoryCounts(pdfHistory.current.counts);
    setNavigationTick((n) => n + 1);
    setLinkStatus(forward ? "Next PDF view" : "Previous PDF view");
  }
  async function followPdfLink(target: PdfLinkTarget, focus = true) {
    cancelPdfNavigation();
    setCopyStatus("");
    if (target.kind === "url") {
      setLinkStatus("External link opens separately");
      return;
    }
    if (target.kind === "unsupported") {
      setLinkStatus(target.message);
      return;
    }
    if (target.kind === "action") {
      if (target.action === "GoBack" || target.action === "GoForward") {
        previousView(target.action === "GoForward");
        return;
      }
      const current = readingView();
      if (current) pdfHistory.current.record(current);
      setHistoryCounts(pdfHistory.current.counts);
      goTo(
        target.action === "FirstPage"
          ? 1
          : target.action === "LastPage"
            ? pages.length
            : page + (target.action === "NextPage" ? 1 : -1),
      );
      setLinkStatus("PDF page navigation");
      if (focus) container.current?.focus({ preventScroll: true });
      return;
    }
    if (!pdfLinks || !pdf || !container.current) return;
    const operation = navigation.current.operation,
      controller = (navigation.current.controller = new AbortController());
    setLinkStatus("Opening PDF destination…");
    try {
      const destination = await pdfLinks.destination(
        target.destination,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        operation !== navigation.current.operation
      )
        return;
      const viewport = pageViewports.current[destination.page - 1],
        c = container.current;
      if (!viewport || !c) return;
      const current = readingView(),
        frame = latestPages.current.find(
          (p) => p.page === current?.anchor.page,
        ),
        currentViewport = frame && pageViewports.current[frame.page - 1];
      const widest = Math.max(
        c.clientWidth - 2 * PAGE_PADDING,
        ...latestPages.current.map((p) => p.width),
      );
      const point =
        currentViewport && frame
          ? currentViewport.convertToPdfPoint(
              Math.max(
                0,
                (c.scrollLeft - (widest - frame.width) / 2) / frame.scale,
              ),
              Math.max(
                0,
                (c.scrollTop + PAGE_PADDING - frame.top) / frame.scale,
              ),
            )
          : undefined;
      const plan = pdfDestinationPlan(
        destination,
        viewport,
        Math.max(1, c.clientWidth - 2 * PAGE_PADDING),
        Math.max(1, c.clientHeight - 2 * PAGE_PADDING),
        (latestPages.current[0]?.scale ?? PDF_CSS_UNITS) / PDF_CSS_UNITS,
        point ? { x: point[0], y: point[1] } : undefined,
      );
      if (current) pdfHistory.current.record(current);
      setHistoryCounts(pdfHistory.current.counts);
      pendingNavigation.current = {
        page: destination.page,
        x: plan.x,
        y: plan.y,
        focus,
      };
      if (destination.mode !== "XYZ" || !!destination.values[2])
        setZoom(plan.zoom);
      setNavigationTick((n) => n + 1);
      setLinkStatus(
        `PDF page ${destination.page} · previous view returns to your reading position`,
      );
    } catch (error) {
      if (
        !controller.signal.aborted &&
        operation === navigation.current.operation
      )
        setLinkStatus(
          error instanceof Error
            ? error.message
            : "This PDF destination could not be opened.",
        );
    } finally {
      if (navigation.current.controller === controller)
        navigation.current.controller = null;
    }
  }
  useEffect(() => {
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, []);
  useEffect(() => {
    window.addEventListener("pagehide", flushReading);
    return () => {
      window.removeEventListener("pagehide", flushReading);
      flushReading();
    };
  }, []);
  useEffect(
    () => () => {
      textCache?.dispose();
      copyOperation.current++;
    },
    [textCache],
  );
  useEffect(() => {
    const c = container.current;
    if (!c) return;
    const obs = new ResizeObserver(() => {
      if (c.clientWidth <= 0 || c.clientHeight <= 0) return;
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
    if (!active) cancelPdfNavigation(false);
  }, [active]);
  useEffect(() => {
    const c = container.current;
    if (!c) return;
    let pending = 0,
      delta = 0;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !readingEnabled.current) return;
      event.preventDefault();
      cancelPdfNavigation();
      delta +=
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? c.clientHeight
            : 1);
      if (!pending)
        pending = requestAnimationFrame(() => {
          const base =
            (latestPages.current[0]?.scale ?? PDF_CSS_UNITS) / PDF_CSS_UNITS;
          setZoom(
            Math.min(
              PDF_ZOOM_MAX,
              Math.max(
                PDF_ZOOM_MIN,
                base * Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.002),
              ),
            ),
          );
          delta = 0;
          pending = 0;
        });
    };
    c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      c.removeEventListener("wheel", wheel);
      cancelAnimationFrame(pending);
    };
  }, []);
  useEffect(() => {
    cancelPdfNavigation();
    cancelAnimationFrame(frame.current);
    flushReading();
    restoredReading.current = undefined;
    pdfHistory.current.clear();
    setHistoryCounts(pdfHistory.current.counts);
    setLinkStatus("");
    setBookmarksOpen(false);
    setLoaded(null);
    setSizes([]);
    pageViewports.current = [];
    setError("");
    setLoading(!!url);
    setTextOpen(false);
    setCopyStatus("");
    setCopying(false);
    setFindResult({ source: null, matches: [], active: -1 });
    setFindStatus("");
    setFindBusy(false);
    pendingMatch.current = null;
    setPresentation(null);
    selectAll.current = null;
    setSelectedPages([]);
    copyOperation.current++;
    if (!url) {
      anchor.current = { page: 1, fraction: 0 };
      preferredPage.current = 1;
      lastTarget.current = undefined;
      return;
    }
    let cancelled = false;
    const task = getDocument({ url, disableAutoFetch: true });
    void task.promise
      .then(async (doc) => {
        // Reserve exact page dimensions first, avoiding layout shifts as pages render.
        const dimensions: PdfPageSize[] = [];
        const viewports: ReturnType<PDFPageProxy["getViewport"]>[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const p = await doc.getPage(n),
            v = p.getViewport({ scale: 1 });
          dimensions.push({ width: v.width, height: v.height });
          viewports.push(v);
        }
        if (!cancelled) {
          const saved =
            workspaceProject && !displayed.current
              ? pdfWorkspace(workspaceProject, url)
              : undefined;
          if (saved) {
            restoredReading.current = saved;
            setZoom(saved.zoom);
          }
          setLoaded({ url, pdf: doc });
          pageViewports.current = viewports;
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
      cancelPdfNavigation(false);
      void task.destroy();
    };
  }, [url, workspaceProject]);
  // Preserve a page-relative reading anchor on zoom, resize and recompilation.
  // Only a new SyncTeX request overrides it; ordinary scrolling never does.
  useLayoutEffect(() => {
    const c = container.current;
    if (
      !active ||
      !c ||
      !pages.length ||
      !pdf ||
      c.clientWidth <= 0 ||
      c.clientHeight <= 0
    )
      return;
    const saved = restoredReading.current;
    restoredReading.current = undefined;
    const target = pendingNavigation.current ?? (saved && { restore: saved });
    if (targetLocation && targetLocation.nonce !== lastTarget.current) {
      cancelPdfNavigation();
      const p = pages[
        Math.max(0, Math.min(pages.length - 1, targetLocation.page - 1))
      ];
      preferredPage.current = p.page;
      const sourceViewport = pageViewports.current[p.page - 1];
      const point = sourceViewport
        ? pdfPreviewPoint(sourceViewport, targetLocation.x, targetLocation.y)
        : null;
      c.scrollTop = Math.max(
        0,
        // Keep a short landscape page visible instead of entering the next page.
        p.top +
          (point
            ? Math.max(
                -PAGE_PADDING,
                Math.min(
                  point.y * p.scale - 100,
                  Math.max(0, p.height - c.clientHeight + PAGE_PADDING),
                ),
              )
            : -PAGE_PADDING),
      );
      const widest = Math.max(
        width - 2 * PAGE_PADDING,
        ...pages.map((p) => p.width),
      );
      c.scrollLeft = Math.max(
        0,
        PAGE_PADDING + (widest - p.width) / 2 +
          (point?.x ?? targetLocation.x) * p.scale - 100,
      );
      lastTarget.current = targetLocation.nonce;
    } else if (target) {
      pendingNavigation.current = null;
      if ("restore" in target) {
        preferredPage.current = target.restore.preferred;
        c.scrollTop = scrollForPdfAnchor(pages, target.restore.anchor);
        c.scrollLeft = target.restore.horizontal * pages[0].scale;
      } else {
        const p = pages[target.page - 1];
        if (p) {
          preferredPage.current = p.page;
          const widest = Math.max(
            c.clientWidth - 2 * PAGE_PADDING,
            ...pages.map((p) => p.width),
          );
          c.scrollTop = Math.max(0, p.top + target.y * p.scale - PAGE_PADDING);
          c.scrollLeft = Math.max(
            0,
            (widest - p.width) / 2 + target.x * p.scale,
          );
          if (target.focus) c.focus({ preventScroll: true });
        }
      }
    } else c.scrollTop = scrollForPdfAnchor(pages, anchor.current);
    displayed.current = true;
    readScroll();
  }, [pages, pdf, targetLocation, navigationTick, active]);
  function goTo(number: number) {
    cancelPdfNavigation();
    const current = latestPages.current;
    const p = current[Math.max(0, Math.min(current.length - 1, number - 1))];
    if (!p || !container.current) return;
    preferredPage.current = p.page;
    container.current.scrollTop = Math.max(0, p.top - PAGE_PADDING);
    readScroll();
  }
  async function copyDocument() {
    if (!textCache || copying) return;
    const operation = ++copyOperation.current;
    setCopying(true);
    setLinkStatus("");
    setCopyStatus("Reading PDF text… Escape to cancel");
    try {
      const text = await textCache.read();
      if (operation !== copyOperation.current) return;
      if (!text.trim()) {
        setCopyStatus("This PDF has no extractable text.");
        return;
      }
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard is unavailable.");
      await navigator.clipboard.writeText(text);
      if (operation === copyOperation.current)
        setCopyStatus(`Copied text from ${pdf!.numPages} pages`);
    } catch (e) {
      if (operation === copyOperation.current)
        setCopyStatus(
          e instanceof Error && e.name !== "AbortError"
            ? `${e.message} Open Read PDF text to copy manually.`
            : "Copy cancelled",
        );
    } finally {
      if (operation === copyOperation.current) setCopying(false);
    }
  }
  return (
    <div
      className="pdf-viewer"
      onKeyDownCapture={(event) => {
        if (navigation.current.controller) cancelPdfNavigation();
        if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
        if (event.key.toLowerCase() === "f" && !event.shiftKey && pdf) {
          event.preventDefault();
          event.stopPropagation();
          setFindOpen(true);
          setFindFocus((n) => n + 1);
        } else if (event.key.toLowerCase() === "g" && findOpen) {
          event.preventDefault();
          event.stopPropagation();
          stepMatch(event.shiftKey ? -1 : 1);
        } else if (["+", "=", "-", "0", "9"].includes(event.key) && pdf) {
          event.preventDefault();
          event.stopPropagation();
          cancelPdfNavigation();
          if (event.key === "0") setZoom("fit-width");
          else if (event.key === "9") setZoom("fit-height");
          else zoomStep(event.key === "-" ? -1 : 1);
        }
      }}
    >
      <div className="pdf-toolbar">
        <div className="page-controls">
          <button
            ref={bookmarksTrigger}
            aria-label="PDF bookmarks"
            title="Bookmarks from the compiled PDF"
            aria-expanded={bookmarksOpen}
            disabled={!pdf}
            onClick={() => setBookmarksOpen(!bookmarksOpen)}
          >
            <ListTree size={15} />
          </button>
          <button
            aria-label="Previous PDF view"
            title="Return after following a PDF link"
            disabled={!historyCounts.back}
            onClick={() => previousView()}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            aria-label="Next PDF view"
            title="Next PDF view"
            disabled={!historyCounts.forward}
            onClick={() => previousView(true)}
          >
            <ArrowRight size={15} />
          </button>
          <button
            aria-label="Previous PDF page"
            disabled={!pdf || page <= 1}
            onClick={() => goTo(page - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const target = parsePdfPage(pageInput, pdf?.numPages ?? 0);
              if (target === null)
                setPageError(`Enter a page from 1 to ${pdf?.numPages ?? 1}.`);
              else {
                setPageError("");
                setPageInput(String(target));
                goTo(target);
                container.current?.focus({ preventScroll: true });
              }
            }}
          >
            <input
              aria-label="PDF page number"
              aria-invalid={!!pageError}
              aria-describedby={pageError ? pageErrorId : undefined}
              value={pageInput}
              disabled={!pdf}
              inputMode="numeric"
              maxLength={8}
              onChange={(event) => {
                setPageInput(event.target.value);
                setPageError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setPageInput(String(page));
                  setPageError("");
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="muted"> / {pdf?.numPages ?? "—"}</span>
          </form>
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
            ref={findTrigger}
            aria-label="Search PDF"
            title="Search PDF (⌘/Ctrl F)"
            aria-expanded={findOpen}
            disabled={!pdf}
            onClick={() => (findOpen ? closeFind() : setFindOpen(true))}
          >
            <Search size={15} />
          </button>
          <button
            aria-label="Read PDF text"
            title="Read or copy all PDF text"
            disabled={!pdf}
            onClick={() => setTextOpen(true)}
          >
            <TextSelect size={15} />
          </button>
          <button
            aria-label="Zoom out"
            disabled={!pdf || percent <= PDF_ZOOM_MIN * 100}
            onClick={() => zoomStep(-1)}
          >
            <Minus size={15} />
          </button>
          <PdfZoomControl
            zoom={zoom}
            percent={percent}
            disabled={!pdf}
            onChange={chooseZoom}
          />
          <button
            aria-label="Zoom in"
            disabled={!pdf || percent >= PDF_ZOOM_MAX * 100}
            onClick={() => zoomStep(1)}
          >
            <Plus size={15} />
          </button>
          <button
            aria-label="Present PDF"
            title="Presentation mode"
            disabled={!pdf}
            onClick={() => setPresentation(page)}
          >
            <Maximize size={15} />
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
      {pageError && (
        <p className="pdf-navigation-error" role="alert" id={pageErrorId}>
          {pageError}
        </p>
      )}
      {bookmarksOpen && pdfLinks && (
        <PdfBookmarks
          links={pdfLinks}
          onNavigate={(target) => void followPdfLink(target, false)}
          onClose={() => {
            setBookmarksOpen(false);
            bookmarksTrigger.current?.focus();
          }}
        />
      )}
      {findOpen && pdf && (
        <PdfFindBar
          query={query}
          options={findOptions}
          status={
            matches.length
              ? `${findResult.active + 1} of ${matches.length}`
              : findStatus
          }
          busy={findBusy}
          count={matches.length}
          focusSequence={findFocus}
          onQuery={setQuery}
          onOptions={setFindOptions}
          onStep={stepMatch}
          onClose={closeFind}
        />
      )}
      {stale && pdf && <div className="stale-banner">{staleLabel}</div>}
      <div
        className="pdf-pages"
        ref={container}
        role="region"
        aria-label="PDF preview pages"
        tabIndex={0}
        onScroll={() => {
          if (navigation.current.controller && !pendingNavigation.current)
            cancelPdfNavigation();
          readSelection();
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(readScroll);
        }}
        onKeyDown={(e) => {
          if (
            (e.metaKey || e.ctrlKey) &&
            !e.altKey &&
            !e.shiftKey &&
            e.key.toLowerCase() === "a" &&
            pdf
          ) {
            const stack = e.currentTarget.querySelector(".pdf-stack");
            if (!stack) return;
            e.preventDefault();
            const range = document.createRange();
            range.selectNodeContents(stack);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            selectAll.current = range.cloneRange();
            setCopyStatus("All PDF text selected · copy includes every page");
            return;
          }
          if (e.key === "Escape" && copying) {
            e.preventDefault();
            copyOperation.current++;
            textCache?.cancel();
            setCopying(false);
            setCopyStatus("Copy cancelled");
            return;
          }
          if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            cancelPdfNavigation();
            preferredPage.current = e.key === "Home" ? 1 : pages.length;
            e.currentTarget.scrollTop =
              e.key === "Home" ? 0 : e.currentTarget.scrollHeight;
            readScroll();
          }
          if (
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.shiftKey &&
            ["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key)
          ) {
            e.preventDefault();
            goTo(page + (["ArrowUp", "PageUp"].includes(e.key) ? -1 : 1));
          }
        }}
        onPointerDown={(e) => {
          cancelPdfNavigation();
          if (e.button === 0) e.currentTarget.focus({ preventScroll: true });
        }}
        onWheelCapture={() => cancelPdfNavigation()}
        onCopy={(e) => {
          const selection = window.getSelection();
          if (
            selection?.rangeCount &&
            samePdfRange(selectAll.current, selection.getRangeAt(0))
          ) {
            e.preventDefault();
            void copyDocument();
            return;
          }
          const text = selectedPdfText(selection, e.currentTarget);
          if (text !== null) {
            e.preventDefault();
            if (text) {
              e.clipboardData.setData("text/plain", normalizeUnicode(text));
              setCopyStatus("Selected PDF text copied");
            } else setCopyStatus("No selectable text here. Try Read PDF text.");
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
                selected={selectedPages.includes(p.page)}
                onInverse={onInverse}
                matches={pageMatches.get(p.page)}
                currentMatch={
                  currentMatch?.page === p.page ? currentMatch : undefined
                }
                onMatchReady={matchReady}
                links={pdfLinks ?? undefined}
                onLink={(target) => void followPdfLink(target)}
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
        <span role="status" aria-live="polite">
          {linkStatus ||
            copyStatus ||
            (onInverse
              ? "Click links · drag to select · double-click elsewhere for source"
              : "Click links · drag to select")}
        </span>
      </div>
      {textOpen && textCache && (
        <PdfTextDialog
          cache={textCache}
          onClose={() => {
            setTextOpen(false);
            textCache.cancel();
          }}
        />
      )}
      {presentation !== null && pdf && sizes.length > 0 && (
        <PdfPresentation
          pdf={pdf}
          sizes={sizes}
          initialPage={presentation}
          links={pdfLinks ?? undefined}
          onClose={(number) => {
            setPresentation(null);
            goTo(number);
          }}
        />
      )}
    </div>
  );
}

function PdfTextDialog({
  cache,
  onClose,
}: {
  cache: PdfTextCache;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void cache
      .read()
      .then((value) => {
        if (active) setText(value);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Could not read PDF text.");
      });
    return () => {
      active = false;
    };
  }, [cache]);
  return (
    <Modal title="PDF text" onClose={onClose} wide className="pdf-text-dialog">
      <p className="muted">
        Text from the compiled PDF, in extraction order. Columns and equations
        may read differently from the page. Scanned images need OCR.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : text === null ? (
        <p role="status">Reading all pages…</p>
      ) : !text.trim() ? (
        <p role="status">This PDF has no extractable text.</p>
      ) : (
        <label className="pdf-text-label">
          All PDF text
          <textarea
            aria-label="All PDF text"
            readOnly
            value={text}
            spellCheck={false}
          />
        </label>
      )}
      <div className="form-actions">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
