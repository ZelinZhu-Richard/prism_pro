import {
  defaultWorkspaceLayout,
  savedWorkspaceLayout,
  sameWorkspaceLayout,
  validateLayoutAcknowledgment,
  workspaceLayoutPatch,
  type WorkspaceLayout,
  type SavedWorkspaceLayout,
} from "../shared/workspace-layout";
export interface LayoutView {
  value: WorkspaceLayout;
  ready: boolean;
  phase: "saved" | "unsaved" | "saving" | "error";
  error?: string;
}
export class LayoutSession {
  view: LayoutView = {
    value: { ...defaultWorkspaceLayout },
    ready: false,
    phase: "saved",
  };
  private saved: SavedWorkspaceLayout = {
    value: { ...defaultWorkspaceLayout },
    revision: 0,
  };
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private disposed = false;
  private recovering = false;
  private edits = 0;
  constructor(
    private ports: {
      read: (signal: AbortSignal) => Promise<SavedWorkspaceLayout>;
      save: (
        value: SavedWorkspaceLayout,
        signal: AbortSignal,
      ) => Promise<SavedWorkspaceLayout>;
      notify: (view: LayoutView) => void;
      delayMs?: number;
      timeoutMs?: number;
    },
  ) {}
  private publish(view: LayoutView) {
    this.view = view;
    if (!this.disposed) this.ports.notify(view);
  }
  load(initial: unknown) {
    if (this.view.ready) return;
    this.saved = savedWorkspaceLayout(initial);
    this.publish({
      value: { ...this.saved.value },
      ready: true,
      phase: "saved",
    });
  }
  edit(patch: Partial<WorkspaceLayout>) {
    if (!this.view.ready) return;
    const next = { ...this.view.value, ...workspaceLayoutPatch(patch) };
    if (sameWorkspaceLayout(next, this.view.value)) return;
    this.edits++;
    clearTimeout(this.timer);
    this.publish({
      value: next,
      ready: true,
      phase:
        this.pending || this.recovering
          ? "saving"
          : sameWorkspaceLayout(next, this.saved.value)
            ? "saved"
            : "unsaved",
    });
    if (!sameWorkspaceLayout(next, this.saved.value))
      this.timer = setTimeout(
        () => void this.flush(),
        this.ports.delayMs ?? 200,
      );
  }
  private async bounded<T>(call: (signal: AbortSignal) => Promise<T>) {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(
          Error(
            "Saving view settings timed out. Retry checks the saved layout before writing again.",
          ),
        );
      }, this.ports.timeoutMs ?? 5000);
    });
    try {
      return await Promise.race([call(abort.signal), expiry]);
    } finally {
      clearTimeout(timer);
    }
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.recovering) return;
    if (this.pending) {
      await this.pending;
      return;
    }
    if (
      !this.view.ready ||
      sameWorkspaceLayout(this.view.value, this.saved.value)
    )
      return;
    const value = {
      revision: this.saved.revision,
      value: { ...this.view.value },
    };
    this.publish({ ...this.view, phase: "saving", error: undefined });
    const save = (async () => {
      try {
        const ack = validateLayoutAcknowledgment(
          await this.bounded((signal) => this.ports.save(value, signal)),
        );
        if (
          ack.revision < value.revision ||
          !sameWorkspaceLayout(ack.value, value.value)
        )
          throw Error(
            "The saved layout differs from this view. Retry to check its current version.",
          );
        this.saved = { revision: ack.revision, value: { ...ack.value } };
        this.publish({
          ...this.view,
          phase: sameWorkspaceLayout(this.view.value, this.saved.value)
            ? "saved"
            : "unsaved",
          error: undefined,
        });
      } catch (e) {
        this.publish({
          ...this.view,
          phase: "error",
          error: (e as Error).message,
        });
      }
    })();
    this.pending = save;
    await save;
    this.pending = undefined;
    if (this.view.phase === "unsaved")
      this.timer = setTimeout(() => void this.flush(), 0);
  }
  async retry(useSaved = false) {
    if (this.recovering) return;
    this.recovering = true;
    clearTimeout(this.timer);
    if (this.pending) await this.pending;
    const editing = this.edits;
    this.publish({ ...this.view, phase: "saving", error: undefined });
    try {
      const remote = validateLayoutAcknowledgment(
        await this.bounded((signal) => this.ports.read(signal)),
      );
      this.saved = { revision: remote.revision, value: { ...remote.value } };
      const value =
        useSaved && editing === this.edits
          ? { ...remote.value }
          : this.view.value;
      this.publish({
        value,
        ready: true,
        phase: sameWorkspaceLayout(value, remote.value) ? "saved" : "unsaved",
      });
    } catch (e) {
      this.publish({
        ...this.view,
        phase: "error",
        error: (e as Error).message,
      });
    } finally {
      this.recovering = false;
    }
    if (this.view.phase === "unsaved") await this.flush();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    void this.flush();
  }
}
