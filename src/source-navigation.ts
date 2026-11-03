import type {
  SourceLocation,
  SourceNavigationRequest,
  SourceNavigationResult,
} from "../shared/source-navigation";
import type { TextFile } from "../shared/types";
import type { NavigationItem } from "./quick-navigation";

export interface NavigationCapture {
  projectId: string;
  generation: number;
  request: SourceNavigationRequest;
}
export interface SourceNavigationView {
  loading: boolean;
  result?: SourceNavigationResult;
  error?: string;
}
export class SourceNavigationQuery {
  view: SourceNavigationView = { loading: true };
  private serial = 0;
  private alive = true;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private ports: {
      read: (
        capture: NavigationCapture,
        signal: AbortSignal,
      ) => Promise<SourceNavigationResult>;
      notify: (view: SourceNavigationView) => void;
      deadlineMs?: number;
    },
  ) {}
  private publish(view: SourceNavigationView) {
    if (this.alive) {
      this.view = view;
      this.ports.notify(view);
    }
  }
  async load(capture: NavigationCapture) {
    if (!this.alive) return;
    const serial = ++this.serial;
    this.abort?.abort();
    clearTimeout(this.timer);
    const abort = new AbortController();
    this.abort = abort;
    this.publish({ ...this.view, loading: true, error: undefined });
    this.timer = setTimeout(() => {
      if (!this.alive || serial !== this.serial) return;
      this.serial++;
      abort.abort();
      this.publish({
        ...this.view,
        loading: false,
        error:
          "Source lookup timed out. Refresh locations when the local backend is available.",
      });
    }, this.ports.deadlineMs ?? 15000);
    try {
      const result = await this.ports.read(capture, abort.signal);
      if (!this.alive || serial !== this.serial) return;
      const r = capture.request;
      if (
        result.projectId !== capture.projectId ||
        result.generation < capture.generation ||
        result.kind !== r.kind ||
        result.name !== r.name ||
        result.mode !== r.mode ||
        !Number.isSafeInteger(result.generation) ||
        !Number.isSafeInteger(result.total) ||
        !Array.isArray(result.locations) ||
        result.locations.length > 2000 ||
        result.total < result.locations.length ||
        !Array.isArray(result.warnings) ||
        !result.warnings.every((warning) => typeof warning === "string") ||
        !result.locations.every(
          (location) =>
            location.kind === r.kind &&
            location.name === r.name &&
            location.role ===
              (r.mode === "definitions" ? "definition" : "reference") &&
            typeof location.path === "string" &&
            location.path.length > 0 &&
            Number.isSafeInteger(location.revision) &&
            location.revision >= 0 &&
            Number.isSafeInteger(location.from) &&
            location.from >= 0 &&
            Number.isSafeInteger(location.to) &&
            location.to > location.from &&
            Number.isSafeInteger(location.line) &&
            location.line > 0 &&
            (location.column === undefined ||
              (Number.isSafeInteger(location.column) && location.column > 0)) &&
            typeof location.hash === "string" &&
            /^[a-f0-9]{64}$/.test(location.hash) &&
            typeof location.preview === "string",
        )
      )
        throw Error(
          "Source lookup returned a different or older request. Refresh locations to retry.",
        );
      this.publish({ loading: false, result });
    } catch (error) {
      if (this.alive && serial === this.serial)
        this.publish({
          ...this.view,
          loading: false,
          error: (error as Error).message,
        });
    } finally {
      if (serial === this.serial) {
        clearTimeout(this.timer);
        this.abort = undefined;
      }
    }
  }
  dispose() {
    this.alive = false;
    this.serial++;
    clearTimeout(this.timer);
    this.abort?.abort();
  }
}
export const locationId = (location: SourceLocation) =>
  JSON.stringify([
    location.path,
    location.kind,
    location.role,
    location.from,
    location.to,
    location.hash,
  ]);
export function locationItems(
  result: SourceNavigationResult | undefined,
): NavigationItem[] {
  return (result?.locations ?? []).map((l) => ({
    id: locationId(l),
    label: `${l.path}:${l.line}${l.column ? ":" + l.column : ""}`,
    detail: l.preview,
    keywords: `${l.kind} ${l.name} ${l.role}`,
    shortcut: l.unsaved ? "Active buffer" : undefined,
  }));
}
export interface NavigationContext {
  projectId: string;
  file: TextFile;
}
const stale = () =>
  Error("This source location changed. Refresh locations before opening it.");
/** Validate complete content before selection; opening another file uses the existing guarded save/navigation path. */
export async function openSourceLocation(
  capture: NavigationCapture,
  location: SourceLocation,
  ports: {
    context: () => NavigationContext | undefined;
    current: () => boolean;
    read: (path: string, signal: AbortSignal) => Promise<TextFile>;
    hash: (content: string) => Promise<string>;
    open: (
      path: string,
      allowed: (candidate?: TextFile | null) => boolean,
    ) => Promise<TextFile | null | undefined>;
    select: (location: SourceLocation, file: TextFile) => void;
    signal?: AbortSignal;
    deadlineMs?: number;
  },
) {
  const initial = ports.context();
  if (!initial || initial.projectId !== capture.projectId || !ports.current())
    return false;
  const start = { ...initial, file: { ...initial.file } };
  const abort = new AbortController(),
    cancel = () => abort.abort(ports.signal?.reason);
  ports.signal?.addEventListener("abort", cancel, { once: true });
  if (ports.signal?.aborted) cancel();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    abort.signal.addEventListener(
      "abort",
      () =>
        reject(abort.signal.reason ?? Error("Source navigation was canceled.")),
      { once: true },
    );
    if (abort.signal.aborted)
      reject(abort.signal.reason ?? Error("Source navigation was canceled."));
    timer = setTimeout(
      () =>
        abort.abort(
          Error("Opening the source timed out. Refresh locations and retry."),
        ),
      ports.deadlineMs ?? 15000,
    );
  });
  // Early cancellation can return before any operation races this deadline.
  void expiry.catch(() => {});
  const active = () => ports.current() && !abort.signal.aborted,
    starting = () => {
      const c = ports.context();
      return (
        active() &&
        c?.projectId === start.projectId &&
        c.file.path === start.file.path &&
        c.file.content === start.file.content
      );
    };
  try {
    const same = start.file.path === location.path,
      file = same
        ? { ...start.file }
        : await Promise.race([ports.read(location.path, abort.signal), expiry]);
    if (!starting()) return false;
    if (
      file.path !== location.path ||
      !Number.isSafeInteger(location.from) ||
      !Number.isSafeInteger(location.to) ||
      location.from < 0 ||
      location.to < location.from ||
      location.to > file.content.length
    )
      throw stale();
    const hash = await Promise.race([ports.hash(file.content), expiry]);
    if (!starting()) return false;
    if (hash !== location.hash) throw stale();
    const spelling =
      location.kind === "command" ? "\\" + location.name : location.name;
    if (file.content.slice(location.from, location.to) !== spelling)
      throw stale();
    if (!same) {
      const opened = await Promise.race([
        ports.open(
          location.path,
          (candidate) =>
            starting() &&
            (!candidate ||
              (candidate.path === location.path &&
                candidate.content === file.content)),
        ),
        expiry,
      ]);
      if (!active()) return false;
      if (
        !opened ||
        opened.path !== location.path ||
        opened.content !== file.content
      )
        throw stale();
    }
    const current = ports.context();
    if (!active()) return false;
    if (
      current?.projectId !== capture.projectId ||
      current.file.path !== location.path ||
      current.file.content !== file.content
    )
      throw stale();
    ports.select(location, current.file);
    return true;
  } finally {
    clearTimeout(timer);
    ports.signal?.removeEventListener("abort", cancel);
    abort.abort();
  }
}
