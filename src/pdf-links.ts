import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";
import { PDF_CSS_UNITS, PDF_ZOOM_MAX, PDF_ZOOM_MIN } from "./pdf-layout";

export type PdfDestination = string | unknown[];
export type PdfLinkTarget =
  | { kind: "destination"; destination: PdfDestination }
  | { kind: "url"; url: string }
  | {
      kind: "action";
      action:
        | "FirstPage"
        | "LastPage"
        | "NextPage"
        | "PrevPage"
        | "GoBack"
        | "GoForward";
    }
  | { kind: "unsupported"; message: string };
export interface PdfLink {
  id: string;
  label: string;
  target: PdfLinkTarget;
  // Points are in PDF coordinates. PDF.js supplies TL, TR, BL, BR quads.
  quads: number[][];
}
export interface PdfBookmark {
  id: string;
  title: string;
  target: PdfLinkTarget | null;
  children: PdfBookmark[];
}
export type PdfViewport = Pick<
  ReturnType<PDFPageProxy["getViewport"]>,
  "width" | "height" | "viewBox" | "convertToViewportPoint"
>;
export interface PdfDestinationView {
  page: number;
  mode: string;
  values: (number | null)[];
}
export const PDF_LINK_LIMIT = 2000;
const actions = new Set([
  "FirstPage",
  "LastPage",
  "NextPage",
  "PrevPage",
  "GoBack",
  "GoForward",
]);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const coordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e9;
const abortError = () =>
  new DOMException("PDF navigation cancelled.", "AbortError");

export function pdfLinkUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    return null;
  try {
    const url = new URL(value.trim());
    return ["https:", "http:", "mailto:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function pdfLinkTarget(data: Record<string, unknown>): PdfLinkTarget {
  if (data.url || data.unsafeUrl) {
    const url = pdfLinkUrl(data.url ?? data.unsafeUrl);
    return url
      ? { kind: "url", url }
      : {
          kind: "unsupported",
          message:
            "This PDF link uses an unsupported address or local-file action.",
        };
  }
  if (typeof data.dest === "string" || Array.isArray(data.dest))
    return { kind: "destination", destination: data.dest };
  if (typeof data.action === "string" && actions.has(data.action))
    return {
      kind: "action",
      action: data.action as Extract<
        PdfLinkTarget,
        { kind: "action" }
      >["action"],
    };
  return {
    kind: "unsupported",
    message:
      "This PDF action is not supported. Scripts, forms, file launches and attachments are not opened by the preview.",
  };
}
export function pdfLinkLabel(target: PdfLinkTarget) {
  if (target.kind === "url") return target.url;
  if (target.kind === "destination")
    return typeof target.destination === "string"
      ? `Go to ${pdfLabel(target.destination)}`
      : "Go to a location in this PDF";
  if (target.kind === "action")
    return {
      FirstPage: "First PDF page",
      LastPage: "Last PDF page",
      NextPage: "Next PDF page",
      PrevPage: "Previous PDF page",
      GoBack: "Previous PDF view",
      GoForward: "Next PDF view",
    }[target.action];
  return target.message;
}
function pdfLabel(value: unknown) {
  if (typeof value !== "string") return "Untitled bookmark";
  const cleaned = value
    .slice(0, 4096)
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .trim();
  const clusters = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(cleaned),
    (entry) => entry.segment,
  );
  if (value.length > 4096) clusters.pop();
  return (
    clusters.slice(0, 500).join("") +
      (clusters.length > 500 || value.length > 4096 ? "…" : "") ||
    "Untitled bookmark"
  );
}
export function pdfPageLinks(annotations: unknown[]) {
  if (annotations.length > 10000)
    throw new Error(
      "This page has too many annotations to expose links. Download the PDF to inspect them.",
    );
  const links: PdfLink[] = [];
  let skipped = 0,
    quads = 0,
    characters = 0;
  for (const data of annotations) {
    if (
      !record(data) ||
      !(data.subtype === "Link" || data.annotationType === 2) ||
      data.noView ||
      data.hidden
    )
      continue;
    if (links.length >= PDF_LINK_LIMIT)
      throw new Error(
        "This page exceeds the 2,000-link limit. Download the PDF to inspect its links.",
      );
    const rect = data.rect;
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(coordinate)) {
      skipped++;
      continue;
    }
    const [x1, y1, x2, y2] = rect;
    if (x1 === x2 || y1 === y2) {
      skipped++;
      continue;
    }
    const boxes: number[][] = [];
    const raw = data.quadPoints;
    if (
      (Array.isArray(raw) || ArrayBuffer.isView(raw)) &&
      "length" in raw &&
      Number(raw.length) > 0
    ) {
      const points = raw as ArrayLike<unknown>;
      if (points.length % 8 || points.length > 8 * 5000)
        throw new Error(
          "A PDF link has too many or invalid highlight regions.",
        );
      for (let at = 0; at < points.length; at += 8) {
        const quad = Array.from({ length: 8 }, (_, i) => points[at + i]);
        if (!quad.every(coordinate)) {
          skipped++;
          continue;
        }
        boxes.push(quad);
      }
    } else
      boxes.push([
        Math.min(x1, x2),
        Math.max(y1, y2),
        Math.max(x1, x2),
        Math.max(y1, y2),
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.max(x1, x2),
        Math.min(y1, y2),
      ]);
    if (!boxes.length) continue;
    quads += boxes.length;
    const target = pdfLinkTarget(data),
      label = pdfLabel(
        data.overlaidText ||
          (record(data.contentsObj) ? data.contentsObj.str : undefined) ||
          pdfLinkLabel(target),
      );
    characters +=
      label.length +
      (target.kind === "url"
        ? target.url.length
        : target.kind === "destination" &&
            typeof target.destination === "string"
          ? target.destination.length
          : 0);
    if (quads > 5000 || characters > 2 * 1024 * 1024)
      throw new Error(
        "This page exceeds the PDF link display limit. Download it to inspect all links.",
      );
    links.push({ id: `link-${links.length}`, label, target, quads: boxes });
  }
  return { links, skipped };
}
export function pdfLinkRegions(link: PdfLink, viewport: PdfViewport) {
  return link.quads
    .map((quad) => {
      const corners = [0, 2, 6, 4].map((at) =>
        viewport.convertToViewportPoint(quad[at], quad[at + 1]),
      );
      const left = Math.min(...corners.map((p) => p[0])),
        top = Math.min(...corners.map((p) => p[1])),
        right = Math.max(...corners.map((p) => p[0])),
        bottom = Math.max(...corners.map((p) => p[1]));
      return { left, top, width: right - left, height: bottom - top, corners };
    })
    .filter(
      (rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left < viewport.width &&
        rect.top < viewport.height &&
        rect.left + rect.width > 0 &&
        rect.top + rect.height > 0,
    );
}
export function pointInPdfRegion(
  x: number,
  y: number,
  region: ReturnType<typeof pdfLinkRegions>[number],
) {
  if (
    x < region.left ||
    y < region.top ||
    x > region.left + region.width ||
    y > region.top + region.height
  )
    return false;
  const points = region.corners;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i],
      [bx, by] = points[j];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (
      Math.abs(cross) < 1e-7 &&
      x >= Math.min(ax, bx) - 1e-7 &&
      x <= Math.max(ax, bx) + 1e-7 &&
      y >= Math.min(ay, by) - 1e-7 &&
      y <= Math.max(ay, by) + 1e-7
    )
      return true;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside;
  }
  return inside;
}
export function pdfBookmarks(input: unknown): PdfBookmark[] {
  if (input === null) return [];
  if (!Array.isArray(input))
    throw new Error("This PDF outline could not be read.");
  const roots: PdfBookmark[] = [],
    seen = new Set<object>();
  const queue = [{ source: input, target: roots, depth: 0 }];
  let count = 0,
    characters = 0;
  while (queue.length) {
    const { source, target, depth } = queue.pop()!;
    if (depth > 32)
      throw new Error(
        "This PDF outline exceeds the 32-level limit. Download the PDF to inspect it.",
      );
    if (source.length > 2000)
      throw new Error("This PDF has too many bookmarks to display at once.");
    for (const item of source) {
      if (!record(item)) continue;
      if (seen.has(item) || ++count > 2000)
        throw new Error("This PDF has a cyclic or oversized bookmark outline.");
      seen.add(item);
      const title = pdfLabel(item.title),
        destination =
          (item.dest !== null && item.dest !== undefined) ||
          item.url ||
          item.unsafeUrl ||
          item.action;
      const node: PdfBookmark = {
        id: `bookmark-${count}`,
        title,
        target: destination ? pdfLinkTarget(item) : null,
        children: [],
      };
      characters += title.length;
      if (characters > 512 * 1024)
        throw new Error("This PDF outline exceeds its text limit.");
      target.push(node);
      if (Array.isArray(item.items) && item.items.length)
        queue.push({
          source: item.items,
          target: node.children,
          depth: depth + 1,
        });
    }
  }
  return roots;
}
function explicitDestination(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    !record(value[1]) ||
    typeof value[1].name !== "string"
  )
    throw new Error("This PDF destination is invalid.");
  const lengths: Record<string, number> = {
    XYZ: 5,
    Fit: 2,
    FitB: 2,
    FitH: 3,
    FitBH: 3,
    FitV: 3,
    FitBV: 3,
    FitR: 6,
  };
  const mode = value[1].name;
  if (
    !Object.hasOwn(lengths, mode) ||
    value.length !== lengths[mode] ||
    !value.slice(2).every((v) => v === null || coordinate(v))
  )
    throw new Error("This PDF destination uses unsupported coordinates.");
  if (
    mode === "FitR" &&
    (value.slice(2).some((v) => v === null) ||
      value[2] === value[4] ||
      value[3] === value[5])
  )
    throw new Error("This PDF destination has an empty rectangle.");
  if (mode === "XYZ" && typeof value[4] === "number" && value[4] < 0)
    throw new Error("This PDF destination has an invalid zoom.");
  return {
    reference: value[0],
    mode,
    values: value.slice(2) as (number | null)[],
  };
}
function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
type LinkDocument = Pick<
  PDFDocumentProxy,
  "numPages" | "getDestination" | "getPageIndex" | "getPage"
> & { getOutline: () => Promise<unknown> };
export class PdfLinks {
  private controller = new AbortController();
  private destinations = new Map<string, Promise<PdfDestinationView>>();
  private pages = new Map<number, Promise<ReturnType<typeof pdfPageLinks>>>();
  private outline: Promise<PdfBookmark[]> | null = null;
  constructor(
    private doc: LinkDocument,
    private timeout = 8000,
  ) {}
  private async bounded<T>(work: Promise<T>, signal?: AbortSignal) {
    const deadline = new AbortController(),
      timer = setTimeout(
        () =>
          deadline.abort(
            new Error(
              "Reading PDF links timed out. Try again or download the PDF.",
            ),
          ),
        this.timeout,
      );
    try {
      return await waitFor(
        work,
        AbortSignal.any([
          this.controller.signal,
          deadline.signal,
          ...(signal ? [signal] : []),
        ]),
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async destination(
    destination: PdfDestination,
    signal?: AbortSignal,
  ): Promise<PdfDestinationView> {
    this.controller.signal.throwIfAborted();
    signal?.throwIfAborted();
    if (
      typeof destination === "string" &&
      (destination.length > 2048 ||
        !destination.length ||
        /[\x00-\x1f\x7f]/.test(destination))
    )
      throw new Error("This PDF destination name is invalid.");
    let supplied = destination;
    if (Array.isArray(destination)) {
      const { reference, mode, values } = explicitDestination(destination);
      const cleanReference = Number.isInteger(reference)
        ? reference
        : record(reference) &&
            Number.isInteger(reference.num) &&
            Number.isInteger(reference.gen)
          ? { num: reference.num, gen: reference.gen }
          : null;
      if (cleanReference === null)
        throw new Error("This PDF destination has an invalid page reference.");
      supplied = [cleanReference, { name: mode }, ...values];
    }
    const key = JSON.stringify(supplied);
    let pending = this.destinations.get(key);
    if (!pending) {
      pending = this.bounded(
        (async () => {
          const resolved =
            typeof supplied === "string"
              ? await this.doc.getDestination(supplied)
              : supplied;
          const { reference, mode, values } = explicitDestination(resolved);
          let index: number;
          if (Number.isInteger(reference)) index = reference as number;
          else if (
            record(reference) &&
            Number.isInteger(reference.num) &&
            Number.isInteger(reference.gen) &&
            Number(reference.num) > 0 &&
            Number(reference.gen) >= 0
          )
            index = await this.doc.getPageIndex(
              reference as { num: number; gen: number },
            );
          else
            throw new Error(
              "This PDF destination has an invalid page reference.",
            );
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= this.doc.numPages
          )
            throw new Error(
              "This PDF destination points outside the document.",
            );
          return { page: index + 1, mode, values };
        })(),
      );
      this.destinations.set(key, pending);
      if (this.destinations.size > 256)
        this.destinations.delete(this.destinations.keys().next().value!);
      void pending.catch(() => {
        if (this.destinations.get(key) === pending)
          this.destinations.delete(key);
      });
    }
    return this.bounded(pending, signal);
  }
  async page(number: number, signal?: AbortSignal) {
    this.controller.signal.throwIfAborted();
    let pending = this.pages.get(number);
    if (!pending) {
      pending = this.bounded(
        (async () =>
          pdfPageLinks(
            await (
              await this.doc.getPage(number)
            ).getAnnotations({ intent: "display" }),
          ))(),
      );
      this.pages.set(number, pending);
      // Keep at most four dense pages (8 Mi text plus bounded coordinates).
      if (this.pages.size > 4)
        this.pages.delete(this.pages.keys().next().value!);
      void pending.catch(() => {
        if (this.pages.get(number) === pending) this.pages.delete(number);
      });
    }
    return this.bounded(pending, signal);
  }
  async bookmarks(signal?: AbortSignal) {
    this.controller.signal.throwIfAborted();
    if (!this.outline) {
      this.outline = this.bounded(this.doc.getOutline().then(pdfBookmarks));
      void this.outline.catch(() => {
        this.outline = null;
      });
    }
    return this.bounded(this.outline, signal);
  }
  dispose() {
    this.controller.abort(abortError());
    this.destinations.clear();
    this.pages.clear();
    this.outline = null;
  }
}
export function pdfDestinationPlan(
  destination: PdfDestinationView,
  viewport: PdfViewport,
  width: number,
  height: number,
  currentZoom: number,
  currentPoint?: { x: number; y: number },
) {
  const box = viewport.viewBox,
    minimum = { x: box[0], y: box[1] },
    maximum = { x: box[2], y: box[3] };
  const current = currentPoint ?? { x: minimum.x, y: maximum.y },
    values = destination.values;
  let x = minimum.x,
    y = maximum.y,
    zoom = currentZoom;
  if (destination.mode === "XYZ") {
    x = values[0] ?? current.x;
    y = values[1] ?? current.y;
    if (values[2] && values[2]! > 0) zoom = values[2]!;
  } else if (["Fit", "FitB"].includes(destination.mode))
    zoom =
      Math.min(width / viewport.width, height / viewport.height) /
      PDF_CSS_UNITS;
  else if (["FitH", "FitBH"].includes(destination.mode)) {
    zoom = width / viewport.width / PDF_CSS_UNITS;
    y = values[0] ?? current.y;
  } else if (["FitV", "FitBV"].includes(destination.mode)) {
    zoom = height / viewport.height / PDF_CSS_UNITS;
    x = values[0] ?? current.x;
  }
  if (["Fit", "FitB"].includes(destination.mode))
    return {
      zoom: Math.max(PDF_ZOOM_MIN, Math.min(PDF_ZOOM_MAX, zoom)),
      x: 0,
      y: 0,
    };
  if (destination.mode === "FitR") {
    const a = viewport.convertToViewportPoint(values[0]!, values[1]!),
      b = viewport.convertToViewportPoint(values[2]!, values[3]!);
    zoom =
      Math.min(width / Math.abs(b[0] - a[0]), height / Math.abs(b[1] - a[1])) /
      PDF_CSS_UNITS;
    return {
      zoom: Math.max(PDF_ZOOM_MIN, Math.min(PDF_ZOOM_MAX, zoom)),
      x: Math.max(0, Math.min(a[0], b[0])),
      y: Math.max(0, Math.min(a[1], b[1])),
    };
  }
  const point = viewport.convertToViewportPoint(
    Math.max(minimum.x, Math.min(maximum.x, x)),
    Math.max(minimum.y, Math.min(maximum.y, y)),
  );
  return {
    zoom: Math.max(PDF_ZOOM_MIN, Math.min(PDF_ZOOM_MAX, zoom)),
    x: Math.max(0, point[0]),
    y: Math.max(0, point[1]),
  };
}
