import type {
  PDFPageProxy,
  TextContent,
} from "pdfjs-dist/types/src/display/api";

export interface PdfTextDocument {
  numPages: number;
  getPage: (page: number) => Promise<Pick<PDFPageProxy, "streamTextContent">>;
}
export const PDF_TEXT_LIMIT = 8 * 1024 * 1024;
const abortError = () =>
  new DOMException("PDF text extraction cancelled.", "AbortError");

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

// A hostile or unusually complex page must not create an unbounded DOM overlay.
export function boundedTextStream(
  source: ReadableStream<TextContent>,
  maxItems = 100000,
  maxCharacters = 1024 * 1024,
) {
  let items = 0,
    characters = 0;
  return source.pipeThrough(
    new TransformStream<TextContent, TextContent>({
      transform(chunk, controller) {
        items += chunk.items.length;
        for (const item of chunk.items)
          if ("str" in item) characters += item.str.length;
        if (items > maxItems || characters > maxCharacters)
          throw new Error(
            "This page is too complex for text selection. Use the text view or download the PDF.",
          );
        controller.enqueue(chunk);
      },
    }),
  );
}

export async function extractPdfText(
  doc: PdfTextDocument,
  signal: AbortSignal,
  normalize: (text: string) => string = (text) => text,
  { maxCharacters = PDF_TEXT_LIMIT, maxItems = 500000, timeout = 15000 } = {},
) {
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        new Error(
          "PDF text extraction timed out. Select a smaller passage or download the PDF.",
        ),
      ),
    timeout,
  );
  const combined = AbortSignal.any([signal, deadline.signal]);
  const chunks: string[] = [];
  let characters = 0,
    count = 0;
  const append = (text: string) => {
    characters += text.length;
    if (characters > maxCharacters)
      throw new Error(
        "PDF text exceeds the extraction limit. Select a smaller passage or download the PDF.",
      );
    chunks.push(text);
  };
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      combined.throwIfAborted();
      const page = await abortable(doc.getPage(n), combined);
      combined.throwIfAborted();
      const reader = page
        .streamTextContent({
          includeMarkedContent: false,
          disableNormalization: true,
        })
        .getReader();
      const cancel = () => {
        void reader.cancel(combined.reason).catch(() => {});
      };
      combined.addEventListener("abort", cancel, { once: true });
      try {
        while (true) {
          combined.throwIfAborted();
          const { value, done } = await abortable(reader.read(), combined);
          combined.throwIfAborted();
          if (done) break;
          for (const item of value.items) {
            if (++count > maxItems)
              throw new Error(
                "PDF text is too complex to extract at once. Select a smaller passage or download the PDF.",
              );
            if ("str" in item) {
              append(item.str.replace(/\0/g, ""));
              if (item.hasEOL) append("\n");
            }
          }
        }
      } finally {
        combined.removeEventListener("abort", cancel);
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (n < doc.numPages) append("\n");
    }
    combined.throwIfAborted();
    const text = normalize(chunks.join(""));
    if (text.length > maxCharacters)
      throw new Error(
        "Normalized PDF text exceeds the extraction limit. Select a smaller passage or download the PDF.",
      );
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export class PdfTextCache {
  private text: string | undefined;
  private pending: Promise<string> | null = null;
  private controller: AbortController | null = null;
  private disposed = false;
  constructor(
    private doc: PdfTextDocument,
    private normalize: (text: string) => string,
  ) {}
  read() {
    if (this.disposed) return Promise.reject(abortError());
    if (this.text !== undefined) return Promise.resolve(this.text);
    if (this.pending) return this.pending;
    const controller = (this.controller = new AbortController());
    const pending = extractPdfText(this.doc, controller.signal, this.normalize)
      .then((text) => {
        if (this.controller !== controller || this.disposed) throw abortError();
        this.text = text;
        return text;
      })
      .finally(() => {
        if (this.controller === controller) {
          this.pending = null;
          this.controller = null;
        }
      });
    this.pending = pending;
    return pending;
  }
  cancel() {
    this.controller?.abort(abortError());
    this.controller = null;
    this.pending = null;
  }
  dispose() {
    this.disposed = true;
    this.cancel();
    this.text = undefined;
  }
}
