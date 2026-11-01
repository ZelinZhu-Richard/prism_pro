import type { WritingRequest, WritingResponse } from "./writing-protocol";
export interface WritingWorker {
  postMessage: (data: WritingRequest & { id: number }) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<WritingResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
type Job = {
  id: number;
  request: WritingRequest;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  remove?: () => void;
  timer?: ReturnType<typeof setTimeout>;
};
const cancelled = () =>
  new DOMException("Writing check superseded.", "AbortError");
// One running task and one latest queued task. A cancelled caller never receives late results.
export class WritingClient {
  private worker?: WritingWorker;
  private active?: Job;
  private queued?: Job;
  private sequence = 0;
  constructor(
    private factory: () => WritingWorker = () =>
      new Worker(new URL("./writing-checks.worker.ts", import.meta.url), {
        type: "module",
      }),
    private timeout = 8000,
  ) {}
  run<T>(request: WritingRequest, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(cancelled());
    return new Promise((resolve, reject) => {
      const job: Job = { id: ++this.sequence, request, resolve, reject };
      const abort = () => {
        job.reject(cancelled());
        job.resolve = () => {};
        job.reject = () => {};
        if (this.queued === job) this.queued = undefined;
        job.remove?.();
      };
      signal?.addEventListener("abort", abort, { once: true });
      job.remove = () => signal?.removeEventListener("abort", abort);
      if (this.active) {
        if (this.queued) this.finish(this.queued, undefined, cancelled());
        this.queued = job;
      } else this.start(job);
    });
  }
  private start(job: Job) {
    this.active = job;
    try {
      if (!this.worker) {
        const worker = this.factory();
        this.worker = worker;
        worker.onmessage = ({ data }) => {
          if (this.worker === worker && this.active?.id === data.id)
            this.complete(
              data.result,
              data.error ? new Error(data.error) : undefined,
            );
        };
        worker.onerror = () => {
          if (this.worker === worker)
            this.fail(
              new Error("Local writing checks stopped. Retry the checks."),
            );
        };
      }
      job.timer = setTimeout(
        () =>
          this.fail(
            new Error("Writing checks timed out. Retry or exclude this file."),
          ),
        this.timeout,
      );
      this.worker.postMessage({ ...job.request, id: job.id });
    } catch (error) {
      this.fail(
        error instanceof Error
          ? error
          : new Error("Local writing checks are unavailable."),
      );
    }
  }
  private finish(job: Job, value?: unknown, error?: Error) {
    clearTimeout(job.timer);
    job.remove?.();
    error ? job.reject(error) : job.resolve(value);
  }
  private complete(value?: unknown, error?: Error) {
    const active = this.active;
    this.active = undefined;
    if (active) this.finish(active, value, error);
    const next = this.queued;
    this.queued = undefined;
    if (next) this.start(next);
  }
  private fail(error: Error) {
    this.worker?.terminate();
    this.worker = undefined;
    this.complete(undefined, error);
  }
  reset() {
    this.worker?.terminate();
    this.worker = undefined;
    for (const job of [this.active, this.queued])
      if (job) this.finish(job, undefined, cancelled());
    this.active = undefined;
    this.queued = undefined;
  }
}
