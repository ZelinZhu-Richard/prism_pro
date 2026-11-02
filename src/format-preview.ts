import type { FormatJob } from "../shared/formatting";
import type { SourceEdit } from "./source-actions";
export interface FormatTarget {
  projectId: string;
  path: string;
  revision: number;
  content: string;
  from: number;
  to: number;
}
export interface FormatPreviewView {
  phase:
    "idle" | "starting" | "running" | "stopping" | "uncertain" | "finished";
  requestId?: string;
  job?: FormatJob;
  error?: string;
}
export function checkedFormatEdit(
  target: FormatTarget,
  job: FormatJob,
  live: {
    projectId?: string;
    path?: string;
    revision?: number;
    content?: string;
    locked: boolean;
  },
): SourceEdit {
  if (live.locked)
    throw Error(
      "This source is read-only. Finish or stop the active operation before applying formatting.",
    );
  if (
    job.status !== "succeeded" ||
    job.text === undefined ||
    job.projectId !== target.projectId ||
    job.path !== target.path ||
    job.revision !== target.revision ||
    live.projectId !== target.projectId ||
    live.path !== target.path ||
    live.revision !== target.revision ||
    live.content !== target.content
  )
    throw Error(
      "The source changed after this preview. Your current text is kept. Close this window and preview formatting again.",
    );
  return {
    from: 0,
    to: target.content.length,
    text: job.text,
    selection: {
      anchor: Math.min(target.from, job.text.length),
      head: Math.min(target.to, job.text.length),
    },
  };
}
export class FormatPreview {
  private alive = true;
  private timer?: ReturnType<typeof setTimeout>;
  private wantStop = false;
  private retiredId?: string;
  view: FormatPreviewView = { phase: "idle" };
  constructor(
    private dependencies: {
      create: (id: string, target: FormatTarget) => Promise<FormatJob>;
      read: (id: string) => Promise<FormatJob>;
      cancel: (id: string) => Promise<{
        id: string;
        status: FormatJob["status"];
        cancelRequested?: boolean;
      }>;
      id: () => string;
      notify: (view: FormatPreviewView) => void;
    },
  ) {}
  private publish(view: FormatPreviewView) {
    if (this.alive) {
      this.view = view;
      this.dependencies.notify(view);
    }
  }
  private current(id: string) {
    return this.alive && this.view.requestId === id;
  }
  private pending(id: string) {
    return this.current(id) && this.view.phase !== "finished";
  }
  private accept(id: string, job: FormatJob) {
    if (!this.current(id) || this.retiredId === id || job.id !== id) return;
    this.publish({
      requestId: id,
      job,
      phase:
        job.status === "running"
          ? this.wantStop || job.cancelRequested
            ? "stopping"
            : "running"
          : "finished",
    });
    if (job.status === "running") {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.refresh(), 400);
    }
  }
  async start(target: FormatTarget) {
    if (!this.alive || !["idle", "finished"].includes(this.view.phase)) return;
    const id = this.dependencies.id();
    this.wantStop = false;
    this.retiredId = undefined;
    clearTimeout(this.timer);
    this.publish({ phase: "starting", requestId: id });
    try {
      const job = await this.dependencies.create(id, target);
      if (!this.current(id)) return;
      this.accept(id, job);
      if (this.wantStop && job.status === "running") await this.stop();
    } catch (e) {
      if (this.current(id) && !this.wantStop)
        this.publish({
          ...this.view,
          phase: "uncertain",
          error:
            (e as Error).message +
            " Check the request or stop it before starting another preview. Your source is kept.",
        });
    }
  }
  async refresh() {
    const id = this.view.requestId;
    if (!id || !this.alive) return;
    clearTimeout(this.timer);
    try {
      this.accept(id, await this.dependencies.read(id));
    } catch (e) {
      if (this.pending(id))
        this.publish({
          ...this.view,
          phase: "uncertain",
          error:
            (e as Error).message +
            " Your source is kept; check again or stop the request.",
        });
    }
  }
  async stop() {
    const id = this.view.requestId;
    if (!id || !this.alive || this.view.phase === "finished") return;
    this.wantStop = true;
    clearTimeout(this.timer);
    this.publish({ ...this.view, phase: "stopping", error: undefined });
    try {
      const result = await this.dependencies.cancel(id);
      if (!this.current(id)) return;
      if (result.status === "cancelled") {
        this.retiredId = id;
        this.publish({
          ...this.view,
          phase: "finished",
          job: this.view.job
            ? { ...this.view.job, status: "cancelled", text: undefined }
            : undefined,
        });
      } else await this.refresh();
    } catch (e) {
      if (this.pending(id))
        this.publish({
          ...this.view,
          phase: "uncertain",
          error:
            (e as Error).message +
            " Stop was not confirmed. Check the request or try Stop again.",
        });
    }
  }
  dispose() {
    const id = this.view.requestId,
      active = !["idle", "finished"].includes(this.view.phase);
    this.alive = false;
    clearTimeout(this.timer);
    if (id && active) void this.dependencies.cancel(id).catch(() => {});
  }
}
