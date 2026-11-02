import type { CompileJob } from "../shared/types";
import type { PreviewBuildState } from "../shared/preview-builds";
export interface PreviewCompileView {
  runId: string;
  requestId?: string;
  phase:
    | "idle"
    | "restoring"
    | "starting"
    | "running"
    | "stopping"
    | "finished"
    | "uncertain";
  job?: CompileJob;
  stale?: boolean;
  cancelled?: boolean;
  error?: string;
}
export const previewCompileBusy = (v: PreviewCompileView) =>
  !["idle", "finished"].includes(v.phase);
export async function previewTextHash(text: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
interface Ports {
  start: (run: string, text: string, request: string) => Promise<CompileJob>;
  read: (run: string, request?: string) => Promise<PreviewBuildState>;
  cancel: (run: string, request: string) => Promise<PreviewBuildState>;
  hash: (text: string) => Promise<string>;
  requestId: () => string;
  notify: (view: PreviewCompileView) => void;
}
/** One captured preview request; stale reads and lost start/cancel responses cannot retarget it. */
export class PreviewCompileController {
  view: PreviewCompileView = { runId: "", phase: "idle" };
  private epoch = 0;
  private serial = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private text = "";
  private hash = "";
  private stopRequested = false;
  constructor(
    private ports: Ports,
    private pollMs = 700,
  ) {}
  private emit(change: Partial<PreviewCompileView>) {
    this.view = { ...this.view, ...change };
    this.ports.notify(this.view);
  }
  private current(epoch: number, serial: number) {
    return epoch === this.epoch && serial === this.serial;
  }
  clear() {
    this.epoch++;
    this.serial++;
    clearTimeout(this.timer);
    this.stopRequested = false;
    this.text = "";
    this.hash = "";
    this.view = { runId: "", phase: "idle" };
    this.ports.notify(this.view);
  }
  dispose() {
    this.epoch++;
    this.serial++;
    clearTimeout(this.timer);
  }
  private result(state: PreviewBuildState) {
    const job = state.job ?? undefined,
      active = job && ["queued", "running"].includes(job.status);
    this.emit({
      requestId: state.requestId,
      job,
      stale: !!state.textHash && state.textHash !== this.hash,
      cancelled: state.cancelled || job?.status === "cancelled",
      phase: active
        ? this.stopRequested || state.cancelled || job.cancelRequested
          ? "stopping"
          : "running"
        : "finished",
      error: state.unavailable
        ? "This saved preview output is unavailable. Compile a new preview."
        : undefined,
    });
    if (active) this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.read(), this.pollMs);
  }
  private failed(error: unknown) {
    clearTimeout(this.timer);
    this.emit({
      phase: "uncertain",
      error:
        (error as Error).message ||
        "Preview status could not be confirmed. Retry status or stop the preview build.",
    });
  }
  async open(runId: string, text: string) {
    this.clear();
    this.text = text;
    this.emit({ runId, phase: "restoring" });
    const epoch = this.epoch,
      serial = ++this.serial;
    try {
      const [state, hash] = await Promise.all([
        this.ports.read(runId),
        this.ports.hash(text),
      ]);
      if (!this.current(epoch, serial)) return;
      this.hash = hash;
      if (!state.requestId) this.emit({ phase: "idle" });
      else this.result(state);
    } catch (e) {
      if (this.current(epoch, serial)) this.failed(e);
    }
  }
  async begin(runId: string, text: string) {
    if (previewCompileBusy(this.view)) return;
    this.clear();
    this.text = text;
    const requestId = this.ports.requestId();
    this.emit({ runId, requestId, phase: "starting" });
    const epoch = this.epoch,
      serial = ++this.serial;
    try {
      const hash = await this.ports.hash(text);
      if (!this.current(epoch, serial) || this.stopRequested) return;
      this.hash = hash;
      const job = await this.ports.start(runId, text, requestId);
      if (!this.current(epoch, serial)) return;
      this.result({
        runId,
        requestId,
        textHash: this.hash,
        cancelled: false,
        job,
      });
    } catch (e) {
      if (this.current(epoch, serial)) this.failed(e);
    }
  }
  private async read() {
    const epoch = this.epoch,
      serial = ++this.serial,
      { runId, requestId } = this.view;
    try {
      const state = await this.ports.read(runId, requestId);
      if (!this.current(epoch, serial)) return;
      this.result(state);
    } catch (e) {
      if (this.current(epoch, serial)) this.failed(e);
    }
  }
  async retry() {
    if (this.view.phase !== "uncertain") return;
    if (this.stopRequested) return this.stop();
    const epoch = this.epoch,
      serial = ++this.serial,
      { runId, requestId } = this.view;
    this.emit({
      error: undefined,
      phase: requestId ? "starting" : "restoring",
    });
    try {
      const hash = await this.ports.hash(this.text);
      if (!this.current(epoch, serial)) return;
      this.hash = hash;
      const state = await this.ports.read(runId, requestId);
      if (!this.current(epoch, serial)) return;
      if (state.job || state.cancelled || state.unavailable || !requestId) {
        this.result(state);
        return;
      }
      // An explicit Retry reuses the exact request ID and text. A lost success cannot start a second build.
      const job = await this.ports.start(runId, this.text, requestId);
      if (this.current(epoch, serial))
        this.result({
          runId,
          requestId,
          textHash: this.hash,
          cancelled: false,
          job,
        });
    } catch (e) {
      if (this.current(epoch, serial)) this.failed(e);
    }
  }
  async stop() {
    if (!previewCompileBusy(this.view)) return;
    this.stopRequested = true;
    clearTimeout(this.timer);
    const epoch = this.epoch,
      serial = ++this.serial,
      { runId } = this.view;
    this.emit({ phase: "stopping", error: undefined });
    try {
      let requestId = this.view.requestId;
      if (!requestId) {
        const state = await this.ports.read(runId);
        if (!this.current(epoch, serial)) return;
        requestId = state.requestId;
        if (!requestId) {
          this.emit({ phase: "finished", cancelled: true });
          return;
        }
      }
      const state = await this.ports.cancel(runId, requestId);
      if (this.current(epoch, serial)) this.result(state);
    } catch (e) {
      if (this.current(epoch, serial)) this.failed(e);
    }
  }
}
