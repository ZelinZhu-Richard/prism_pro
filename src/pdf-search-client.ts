import type {
  PdfSearchMatch,
  PdfSearchOptions,
  PdfSearchPage,
} from "./pdf-search";

// Extraction uses PDF.js's existing worker. Matching is isolated too: a complex
// Unicode page must not block editing, scrolling, or cancellation in the UI.
export function searchPdfIndex(
  pages: PdfSearchPage[],
  query: string,
  options: PdfSearchOptions,
  signal: AbortSignal,
): Promise<PdfSearchMatch[]> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./pdf-search.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = (error?: unknown, matches?: PdfSearchMatch[]) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(matches!);
    };
    const abort = () => finish(signal.reason);
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "PDF search took too long. Refine your search or download the PDF.",
          ),
        ),
      20000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ matches?: PdfSearchMatch[]; error?: string }>,
    ) => {
      if (event.data.error) finish(new Error(event.data.error));
      else finish(undefined, event.data.matches);
    };
    worker.onerror = () =>
      finish(
        new Error("PDF search could not start. Try again or download the PDF."),
      );
    try {
      worker.postMessage({ pages, query, options });
    } catch (error) {
      finish(error);
    }
  });
}
