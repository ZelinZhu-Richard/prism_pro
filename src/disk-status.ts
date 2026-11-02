import type { DiskStatus } from "../shared/disk-status";
import type { Project, TextFile } from "../shared/types";
/** Include an open older source revision without treating our newer save ack as a conflict. */
export function noticedDiskChanges(
  status: DiskStatus | undefined,
  project: Project | null,
  doc: TextFile | null,
) {
  const changes =
    status?.projectId === project?.id ? [...(status?.changes ?? [])] : [];
  const indexed = project?.files.find((f) => f.path === doc?.path);
  if (
    doc &&
    indexed &&
    (indexed.deleted || indexed.revision > doc.revision) &&
    !changes.some((c) => c.path === doc.path)
  )
    changes.push({
      path: doc.path,
      change: indexed.deleted ? "deleted" : "modified",
    });
  return changes;
}
export interface DiskMonitorView {
  status?: DiskStatus;
  error?: string;
  checking?: boolean;
}
export class DiskMonitor {
  view: DiskMonitorView = {};
  private alive = true;
  private serial = 0;
  private retryAt = 0;
  private flight?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private projectId: string,
    private generation: number,
    private d: {
      read: (signal: AbortSignal) => Promise<DiskStatus>;
      notify: (view: DiskMonitorView) => void;
      now?: () => number;
      deadlineMs?: number;
    },
  ) {}
  private current(serial: number) {
    return this.alive && this.serial === serial;
  }
  private publish(view: DiskMonitorView) {
    if (this.alive) {
      this.view = view;
      this.d.notify(view);
    }
  }
  private failed(message: string) {
    this.retryAt = (this.d.now?.() ?? Date.now()) + 30000;
    this.publish({ ...this.view, error: message, checking: false });
  }
  async check(force = false) {
    if (
      !this.alive ||
      this.flight ||
      (!force && (this.d.now?.() ?? Date.now()) < this.retryAt)
    )
      return;
    const serial = ++this.serial,
      abort = new AbortController();
    this.flight = abort;
    this.publish({ ...this.view, checking: true });
    this.timer = setTimeout(() => {
      if (!this.current(serial)) return;
      this.pause();
      this.failed(
        "Disk checking timed out. The last observation is kept; retry when the local backend is available.",
      );
    }, this.d.deadlineMs ?? 15000);
    try {
      const status = await this.d.read(abort.signal);
      if (!this.current(serial)) return;
      if (
        status.projectId !== this.projectId ||
        status.generation < this.generation
      )
        throw Error(
          "Disk checking returned an older project version. Retry to refresh it.",
        );
      this.retryAt = 0;
      this.publish({ status, checking: false });
    } catch (e) {
      if (this.current(serial)) this.failed((e as Error).message);
    } finally {
      if (this.current(serial)) {
        clearTimeout(this.timer);
        this.flight = undefined;
      }
    }
  }
  updateGeneration(value: number) {
    if (value === this.generation) return;
    this.generation = value;
    this.pause();
  }
  resolved(path: string) {
    if (this.view.status)
      this.publish({
        ...this.view,
        status: {
          ...this.view.status,
          changes: this.view.status.changes.filter((c) => c.path !== path),
        },
      });
  }
  pause() {
    this.serial++;
    clearTimeout(this.timer);
    this.flight?.abort();
    this.flight = undefined;
    if (this.view.checking) this.publish({ ...this.view, checking: false });
  }
  dispose() {
    this.alive = false;
    this.pause();
  }
}
