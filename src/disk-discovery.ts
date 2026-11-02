import type {
  DiscoveredFile,
  DiskDiscoveryView,
  DiskImportRequest,
  DiskImportResult,
} from "../shared/disk-discovery";
export function diskSelection(
  previous: ReadonlySet<string> | undefined,
  entries: DiscoveredFile[],
) {
  const names = new Set(entries.map((e) => e.path));
  return new Set(
    previous
      ? [...previous].filter((name) => names.has(name)).slice(0, 1000)
      : entries.slice(0, 1000).map((e) => e.path),
  );
}
export interface DiskCheckView {
  phase: "checking" | "ready" | "importing" | "uncertain" | "failed" | "done";
  scan?: DiskDiscoveryView;
  request?: DiskImportRequest;
  result?: DiskImportResult;
  error?: string;
}
export class DiskCheck {
  view: DiskCheckView = { phase: "checking" };
  private alive = true;
  private serial = 0;
  private flight?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private d: {
      scan: (signal: AbortSignal) => Promise<DiskDiscoveryView>;
      import: (
        request: DiskImportRequest,
        signal: AbortSignal,
      ) => Promise<DiskImportResult>;
      applied: (result: DiskImportResult) => Promise<void>;
      id: () => string;
      notify: (view: DiskCheckView) => void;
      deadlineMs?: number;
    },
  ) {}
  private publish(view: DiskCheckView) {
    if (this.alive) {
      this.view = view;
      this.d.notify(view);
    }
  }
  private current(serial: number) {
    return this.alive && this.serial === serial;
  }
  private begin() {
    this.flight?.abort();
    clearTimeout(this.timer);
    const serial = ++this.serial,
      abort = new AbortController();
    this.flight = abort;
    this.timer = setTimeout(() => {
      if (!this.current(serial)) return;
      this.serial++;
      abort.abort();
      this.publish({
        ...this.view,
        phase: this.view.phase === "importing" ? "uncertain" : "failed",
        error:
          this.view.phase === "importing"
            ? "Import confirmation timed out. Retry the same request to confirm its result."
            : "Checking disk files timed out. Your files are unchanged; try again.",
      });
    }, this.d.deadlineMs ?? 15000);
    return { serial, signal: abort.signal };
  }
  private finish(serial: number) {
    if (this.current(serial)) {
      clearTimeout(this.timer);
      this.flight = undefined;
    }
  }
  async check() {
    if (!this.alive || ["importing", "uncertain"].includes(this.view.phase))
      return;
    const { serial, signal } = this.begin();
    this.publish({ phase: "checking", scan: this.view.scan });
    try {
      const scan = await this.d.scan(signal);
      if (this.current(serial)) this.publish({ phase: "ready", scan });
    } catch (e) {
      if (this.current(serial))
        this.publish({
          ...this.view,
          phase: "failed",
          error: (e as Error).message,
        });
    } finally {
      this.finish(serial);
    }
  }
  async import(paths: string[]) {
    if (!this.alive || !["ready", "uncertain"].includes(this.view.phase))
      return;
    const request = this.view.request ?? {
      requestId: this.d.id(),
      token: this.view.scan!.token,
      paths: [...paths].sort(),
    };
    if (!request.paths.length) return;
    const { serial, signal } = this.begin();
    let confirmed = false;
    this.publish({
      ...this.view,
      phase: "importing",
      request,
      error: undefined,
    });
    try {
      const result = await this.d.import(request, signal);
      confirmed = true;
      if (!this.current(serial)) return;
      await this.d.applied(result);
      if (this.current(serial))
        this.publish({
          ...this.view,
          phase: "done",
          request: undefined,
          result,
          error: undefined,
        });
    } catch (e) {
      if (this.current(serial)) {
        const status = (e as { status?: number }).status;
        const rejected =
          !confirmed && [400, 403, 404, 409, 413].includes(status ?? 0);
        this.publish({
          ...this.view,
          phase: rejected ? "failed" : "uncertain",
          request: rejected ? undefined : request,
          error:
            (e as Error).message +
            (rejected
              ? ""
              : " Import may have completed. Retry confirms the same request without duplicating it."),
        });
      }
    } finally {
      this.finish(serial);
    }
  }
  dispose() {
    this.alive = false;
    this.serial++;
    clearTimeout(this.timer);
    this.flight?.abort();
  }
}
