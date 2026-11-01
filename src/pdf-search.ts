import type { TextContent } from "pdfjs-dist/types/src/display/api";
import type { PdfTextDocument } from "./pdf-text";
import { boundedTextStream, PDF_TEXT_LIMIT } from "./pdf-text";

export interface PdfSearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  matchAccents: boolean;
}
export interface PdfSearchPart {
  item: number;
  from: number;
  to: number;
}
export interface PdfSearchMatch {
  page: number;
  from: number;
  to: number;
  parts: PdfSearchPart[];
}
export interface PdfSearchPage {
  page: number;
  text: string;
  spans: { item: number; from: number; to: number }[];
}
export const PDF_SEARCH_MATCH_LIMIT = 10000;
export const PDF_SEARCH_QUERY_LIMIT = 512;
export const PDF_SEARCH_PAGE_LIMIT = 2 * 1024 * 1024;
export const defaultPdfSearchOptions: PdfSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  matchAccents: false,
};
const word = /[\p{L}\p{N}\p{M}_]/u,
  letter = /\p{L}/u,
  han = /\p{Script=Han}/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const cancelled = () => new DOMException("PDF search cancelled.", "AbortError");
function checked(signal?: AbortSignal, deadline = Infinity) {
  signal?.throwIfAborted();
  if (Date.now() > deadline)
    throw new Error(
      "PDF search took too long. Use a shorter passage or download the PDF.",
    );
}
async function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export function searchPage(page: number, chunks: TextContent[]): PdfSearchPage {
  let text = "",
    item = 0;
  const spans: PdfSearchPage["spans"] = [];
  for (const chunk of chunks)
    for (const entry of chunk.items)
      if ("str" in entry) {
        const from = text.length;
        text += entry.str;
        spans.push({ item: item++, from, to: text.length });
        if (entry.hasEOL) text += "\n";
      }
  return { page, text, spans };
}
function normalizedCluster(value: string, options: PdfSearchOptions) {
  let text = value
    .normalize("NFKC")
    .replace(/[\0\u00ad]/g, "")
    .replace(/\u2044/g, "/");
  if (!options.caseSensitive) text = text.toLowerCase();
  if (!options.matchAccents)
    text = text.normalize("NFD").replace(/\p{M}/gu, "");
  return text.normalize("NFC");
}
// Each output UTF-16 unit maps to a complete source grapheme, including ligatures.
// Work a page at a time so mappings do not grow with the entire document.
export function searchProjection(
  text: string,
  options: PdfSearchOptions,
  signal?: AbortSignal,
  deadline = Infinity,
) {
  if (text.length > PDF_SEARCH_PAGE_LIMIT)
    throw new Error(
      "This page exceeds the PDF search limit. Download it to search with another PDF reader.",
    );
  let starts = new Uint32Array(
      Math.min(PDF_SEARCH_PAGE_LIMIT, Math.max(16, text.length)),
    ),
    ends = new Uint32Array(starts.length);
  const reserve = (length: number) => {
    if (length > PDF_SEARCH_PAGE_LIMIT)
      throw new Error("Normalized PDF text exceeds the search limit.");
    if (length <= starts.length) return;
    const size = Math.min(
        PDF_SEARCH_PAGE_LIMIT,
        Math.max(length, starts.length * 2),
      ),
      nextStarts = new Uint32Array(size),
      nextEnds = new Uint32Array(size);
    nextStarts.set(starts);
    nextEnds.set(ends);
    starts = nextStarts;
    ends = nextEnds;
  };
  const output: string[] = [];
  let offset = 0,
    previous = "",
    skipUntil = 0,
    count = 0;
  for (const { segment, index } of segmenter.segment(text)) {
    if ((++count & 255) === 0) checked(signal, deadline);
    if (index < skipUntil) continue;
    if (
      (segment === "-" || segment === "\u2010") &&
      letter.test(Array.from(previous).at(-1) ?? "")
    ) {
      const next = text
        .slice(index + segment.length)
        .match(/^[ \t]*\r?\n\s*(?=\p{L})/u);
      if (next) {
        skipUntil = index + segment.length + next[0].length;
        continue;
      }
    }
    const normalized = normalizedCluster(segment, options);
    for (let value of normalized) {
      if (/\s/u.test(value)) {
        if (
          segment.includes("\n") &&
          han.test(previous) &&
          han.test(
            String.fromCodePoint(text.codePointAt(index + segment.length) ?? 0),
          )
        )
          continue;
        value = " ";
        if (previous === " ") {
          ends[offset - 1] = index + segment.length;
          continue;
        }
      }
      reserve(offset + value.length);
      output.push(value);
      starts.fill(index, offset, offset + value.length);
      ends.fill(index + segment.length, offset, offset + value.length);
      offset += value.length;
      previous = value;
    }
  }
  checked(signal, deadline);
  return {
    text: output.join(""),
    starts: starts.subarray(0, offset),
    ends: ends.subarray(0, offset),
  };
}
export function matchParts(
  page: PdfSearchPage,
  from: number,
  to: number,
): PdfSearchPart[] {
  let lo = 0,
    hi = page.spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (page.spans[mid].to <= from) lo = mid + 1;
    else hi = mid;
  }
  const parts: PdfSearchPart[] = [];
  for (let i = lo; i < page.spans.length && page.spans[i].from < to; i++) {
    const span = page.spans[i],
      start = Math.max(from, span.from),
      end = Math.min(to, span.to);
    if (
      end > start &&
      page.text.slice(start, end).replace(/[\s\0\u00ad]/gu, "").length
    )
      parts.push({
        item: span.item,
        from: start - span.from,
        to: end - span.from,
      });
    if (parts.length > 2000)
      throw new Error(
        "This PDF match is too complex to highlight. Try a shorter search.",
      );
  }
  return parts;
}
export async function findPdfMatches(
  pages: readonly PdfSearchPage[],
  query: string,
  options = defaultPdfSearchOptions,
  signal?: AbortSignal,
  limit = PDF_SEARCH_MATCH_LIMIT,
) {
  if (query.length > PDF_SEARCH_QUERY_LIMIT)
    throw new Error(
      `Use at most ${PDF_SEARCH_QUERY_LIMIT} characters in PDF search.`,
    );
  const deadline = Date.now() + 15000,
    needle = searchProjection(query, options, signal, deadline).text.trim();
  if (!needle) return [];
  const matches: PdfSearchMatch[] = [];
  for (const page of pages) {
    checked(signal, deadline);
    const projected = searchProjection(page.text, options, signal, deadline);
    let offset = 0,
      found: number;
    while ((found = projected.text.indexOf(needle, offset)) !== -1) {
      checked(signal, deadline);
      const end = found + needle.length;
      offset = end;
      if (options.wholeWord) {
        const before =
            Array.from(projected.text.slice(Math.max(0, found - 2), found)).at(
              -1,
            ) ?? "",
          after = String.fromCodePoint(projected.text.codePointAt(end) ?? 0);
        if (
          (word.test(String.fromCodePoint(needle.codePointAt(0)!)) &&
            word.test(before)) ||
          (word.test(Array.from(needle).at(-1)!) && word.test(after))
        )
          continue;
      }
      const from = projected.starts[found],
        to = projected.ends[end - 1];
      // Normalization can produce multiple hits inside a single ligature/grapheme.
      if (
        matches.at(-1)?.page === page.page &&
        matches.at(-1)?.from === from &&
        matches.at(-1)?.to === to
      )
        continue;
      if (matches.length === limit)
        throw new Error(
          `More than ${limit.toLocaleString("en-US")} PDF matches. Refine your search.`,
        );
      matches.push({
        page: page.page,
        from,
        to,
        parts: matchParts(page, from, to),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  checked(signal, deadline);
  return matches;
}

export class PdfSearchIndex {
  private pages: PdfSearchPage[] | undefined;
  private pending: Promise<PdfSearchPage[]> | null = null;
  private controller: AbortController | null = null;
  private disposed = false;
  constructor(
    private doc: PdfTextDocument,
    private limits = {
      characters: PDF_TEXT_LIMIT,
      items: 500000,
      timeout: 15000,
    },
  ) {}
  load(progress?: (page: number) => void): Promise<PdfSearchPage[]> {
    if (this.disposed) return Promise.reject(cancelled());
    if (this.pages) return Promise.resolve(this.pages);
    if (this.pending) return this.pending;
    const controller = (this.controller = new AbortController()),
      signal = controller.signal;
    const timer = setTimeout(
      () =>
        controller.abort(
          new Error(
            "PDF search indexing timed out. Try again or download the PDF.",
          ),
        ),
      this.limits.timeout,
    );
    const pending = (async () => {
      const pages: PdfSearchPage[] = [];
      let characters = 0,
        items = 0;
      for (let page = 1; page <= this.doc.numPages; page++) {
        signal.throwIfAborted();
        const source = await abortable(this.doc.getPage(page), signal);
        const reader = boundedTextStream(
            source.streamTextContent({
              includeMarkedContent: false,
              disableNormalization: true,
            }),
          ).getReader(),
          chunks: TextContent[] = [];
        const cancel = () => {
          void reader.cancel(signal.reason).catch(() => {});
        };
        signal.addEventListener("abort", cancel, { once: true });
        try {
          while (true) {
            const result = await abortable(reader.read(), signal);
            signal.throwIfAborted();
            if (result.done) break;
            for (const item of result.value.items) {
              items++;
              if ("str" in item)
                characters += item.str.length + (item.hasEOL ? 1 : 0);
              if (
                items > this.limits.items ||
                characters > this.limits.characters
              )
                throw new Error(
                  "This PDF exceeds the search indexing limit. Download it to search with another PDF reader.",
                );
            }
            chunks.push(result.value);
          }
        } finally {
          signal.removeEventListener("abort", cancel);
          void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        pages.push(searchPage(page, chunks));
        progress?.(page);
      }
      signal.throwIfAborted();
      if (this.controller !== controller || this.disposed) throw cancelled();
      this.pages = pages;
      return pages;
    })().finally(() => {
      clearTimeout(timer);
      if (this.controller === controller) {
        this.pending = null;
        this.controller = null;
      }
    });
    this.pending = pending;
    return pending;
  }
  cancel() {
    this.controller?.abort(cancelled());
    this.controller = null;
    this.pending = null;
  }
  dispose() {
    this.disposed = true;
    this.cancel();
    this.pages = undefined;
  }
}
