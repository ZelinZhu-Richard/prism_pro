import {
  draftKey,
  DRAFT_LIMIT,
  type DraftKey,
  type ChatDraft,
  type DraftWrite,
} from "../shared/chat-drafts";
export interface DraftView {
  key?: DraftKey;
  text: string;
  status: "loading" | "saved" | "unsaved" | "saving" | "error" | "conflict";
  error?: string;
  remote?: ChatDraft;
}
interface Entry {
  key: DraftKey;
  text: string;
  saved: string;
  revision: number;
  loaded: boolean;
  error?: string;
  remote?: ChatDraft;
  request?: DraftWrite;
  loading?: Promise<void>;
  saving?: Promise<ChatDraft>;
  timer?: ReturnType<typeof setTimeout>;
  resolving?: boolean;
}
export interface DraftPorts {
  load: (key: DraftKey) => Promise<ChatDraft>;
  save: (key: DraftKey, write: DraftWrite) => Promise<ChatDraft>;
  notify: (view: DraftView) => void;
  requestId: () => string;
}
/** Per-conversation queues keep late responses and ambiguous retries off other composers. */
export class DraftController {
  private entries = new Map<string, Entry>();
  active?: DraftKey;
  constructor(
    private ports: DraftPorts,
    private delay = 400,
  ) {}
  private entry(key: DraftKey) {
    const id = draftKey(key);
    let e = this.entries.get(id);
    if (!e) {
      e = { key: { ...key }, text: "", saved: "", revision: 0, loaded: false };
      this.entries.set(id, e);
    }
    return e;
  }
  isActive(key: DraftKey) {
    return !!this.active && draftKey(this.active) === draftKey(key);
  }
  private publish() {
    const e = this.active ? this.entry(this.active) : undefined;
    this.ports.notify({
      key: e?.key,
      text: e?.text ?? "",
      status: !e
        ? "loading"
        : e.remote
          ? "conflict"
          : e.error
            ? "error"
            : !e.loaded
              ? "loading"
              : e.saving
                ? "saving"
                : this.dirty(e)
                  ? "unsaved"
                  : "saved",
      error: e?.error,
      remote: e?.remote,
    });
  }
  private dirty(e: Entry) {
    return e.text !== e.saved || !!e.request;
  }
  unsaved() {
    return [...this.entries.values()].some(
      (e) => this.dirty(e) || !!e.saving || !!e.remote,
    );
  }
  private validate(key: DraftKey, result: ChatDraft) {
    if (
      result.projectId !== key.projectId ||
      result.conversationId !== key.conversationId ||
      typeof result.text !== "string" ||
      result.text.length > DRAFT_LIMIT ||
      !Number.isSafeInteger(result.revision) ||
      result.revision < 0
    )
      throw new Error(
        "The saved draft response did not match this conversation. Your local text has been kept.",
      );
    return result;
  }
  async open(key?: DraftKey) {
    this.active = key ? { ...key } : undefined;
    this.publish();
    if (key) await this.load(this.entry(key));
  }
  private async load(e: Entry, refresh = false) {
    if (e.loading) return e.loading;
    if (e.loaded && !refresh) return;
    const pending = (async () => {
      try {
        const result = this.validate(
          e.key,
          await Promise.resolve().then(() => this.ports.load(e.key)),
        );
        if (result.revision < e.revision) return;
        if (
          this.dirty(e) &&
          result.text !== e.text &&
          (result.revision !== e.revision || (!e.loaded && !!result.text))
        ) {
          e.remote = result;
          e.error =
            "This draft changed in another window. Your text is kept here.";
        } else if (!this.dirty(e) || result.text === e.text) {
          e.text = result.text;
          e.saved = result.text;
          e.revision = result.revision;
          e.request = undefined;
          e.remote = undefined;
          e.error = undefined;
        } else {
          e.saved = result.text;
          e.revision = result.revision;
        }
        e.loaded = true;
      } catch (error) {
        e.error =
          error instanceof Error
            ? error.message
            : "The draft could not be loaded.";
        throw error;
      } finally {
        e.loading = undefined;
        this.publish();
      }
    })();
    e.loading = pending;
    return pending;
  }
  edit(text: string) {
    if (!this.active) return;
    const e = this.entry(this.active);
    e.text = text;
    clearTimeout(e.timer);
    this.publish();
    if (!e.remote)
      e.timer = setTimeout(
        () => void this.flush(e.key).catch(() => {}),
        this.delay,
      );
  }
  async refresh() {
    if (!this.active) return;
    const e = this.entry(this.active);
    if (e.saving) await e.saving.catch(() => {});
    await this.load(e, true);
  }
  async flush(key = this.active): Promise<ChatDraft | undefined> {
    if (!key) return;
    const e = this.entry(key);
    clearTimeout(e.timer);
    if (e.saving) {
      await e.saving;
      return this.flush(key);
    }
    if (!e.loaded) await this.load(e);
    if (e.remote && !e.resolving)
      throw new Error(e.error ?? "Review both chat drafts before saving.");
    if (!this.dirty(e)) {
      e.error = undefined;
      this.publish();
      return { ...e.key, text: e.saved, revision: e.revision, updated: null };
    }
    e.request ??= {
      text: e.text,
      revision: e.revision,
      requestId: this.ports.requestId(),
    };
    const request = e.request;
    e.error = undefined;
    const saving = (async () => {
      try {
        const result = this.validate(
          e.key,
          await Promise.resolve().then(() => this.ports.save(e.key, request)),
        );
        if (
          result.text !== request.text ||
          result.revision !== request.revision + 1
        )
          throw new Error(
            "The draft save could not be confirmed. Retry to keep your text.",
          );
        e.revision = result.revision;
        e.saved = request.text;
        e.request = undefined;
        e.error = undefined;
        e.remote = undefined;
        return result;
      } catch (error) {
        e.error =
          error instanceof Error
            ? error.message
            : "The draft could not be saved.";
        if ((error as { status?: number }).status === 409) {
          try {
            e.remote = this.validate(e.key, await this.ports.load(e.key));
          } catch {}
        }
        throw error;
      } finally {
        e.saving = undefined;
        this.publish();
      }
    })();
    e.saving = saving;
    this.publish();
    const result = await saving;
    return this.dirty(e) ? this.flush(key) : result;
  }
  acknowledge(key: DraftKey, text: string, revision: number) {
    const e = this.entry(key);
    if (!Number.isSafeInteger(revision) || revision <= e.revision) return;
    clearTimeout(e.timer);
    e.revision = revision;
    e.saved = "";
    e.request = undefined;
    e.remote = undefined;
    e.error = undefined;
    e.loaded = true;
    if (e.text === text) e.text = "";
    this.publish();
    if (this.dirty(e))
      e.timer = setTimeout(
        () => void this.flush(e.key).catch(() => {}),
        this.delay,
      );
  }
  async resolve(choice: "saved" | "local") {
    if (!this.active) return;
    const e = this.entry(this.active);
    if (!e.remote || e.saving) return;
    const remote = e.remote;
    if (choice === "saved") {
      e.revision = remote.revision;
      e.saved = remote.text;
      e.text = remote.text;
      e.request = undefined;
      e.remote = undefined;
      e.error = undefined;
      this.publish();
      return;
    }
    if (!e.request || e.request.revision !== remote.revision) {
      e.revision = remote.revision;
      e.saved = remote.text;
      e.request = undefined;
    }
    e.error = undefined;
    e.resolving = true;
    this.publish();
    try {
      await this.flush(e.key);
      e.remote = undefined;
    } finally {
      e.resolving = false;
      this.publish();
    }
  }
  dispose() {
    for (const e of this.entries.values()) clearTimeout(e.timer);
  }
}
