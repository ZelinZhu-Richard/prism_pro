import type { SourceDraft } from "../shared/source-recovery";
import type { TextFile } from "../shared/types";
/** A deferred editor event belongs to both its project and its exact file. */
export function visibleSource(
  project: string,
  path: string,
  activeProject: string | undefined,
  file: TextFile | null,
) {
  return project === activeProject && path === file?.path ? file : undefined;
}
// Source text only. Provider keys, chats and paid requests never enter this journal.
const prefix = "prism:source-draft:v1:";
export interface DraftStorage {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const browserDraftStorage: DraftStorage = {
  get length() {
    return localStorage.length;
  },
  key: (i) => localStorage.key(i),
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
};
export class DraftPersistenceError extends Error {
  constructor(public draft: SourceDraft) {
    super(
      "Browser draft storage is full or unavailable. Keep this tab open and save or download your text; Leaf will try the backend recovery copy.",
    );
  }
}
export class SourceDrafts {
  private sequences = new Map<string, number>();
  constructor(
    private storage: DraftStorage,
    private client: string,
    private now = Date.now,
  ) {}
  private key(project: string, path: string) {
    return prefix + JSON.stringify([this.client, project, path]);
  }
  owns(draft: SourceDraft) {
    return draft.id === this.key(draft.project, draft.path);
  }
  write(
    project: string,
    path: string,
    revision: number,
    text: string,
    saved: string,
  ) {
    const id = this.key(project, path);
    if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
      throw Error(
        "Draft recovery is limited to 2 MiB per file. Download your text before closing Leaf.",
      );
    const sequence = (this.sequences.get(id) ?? 0) + 1;
    this.sequences.set(id, sequence);
    const draft: SourceDraft = {
      id,
      project,
      path,
      revision,
      text,
      updated: this.now(),
      sequence,
      ...(text === saved ? { cleared: true } : {}),
    };
    try {
      if (draft.cleared) this.storage.removeItem(id);
      else this.storage.setItem(id, JSON.stringify(draft));
    } catch {
      throw new DraftPersistenceError(draft);
    }
    return draft;
  }
  list(project: string, path?: string): SourceDraft[] {
    const result: SourceDraft[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const id = this.storage.key(i);
      if (!id?.startsWith(prefix)) continue;
      try {
        const d = JSON.parse(this.storage.getItem(id)!);
        if (
          d.id === id &&
          d.project === project &&
          (!path || d.path === path) &&
          typeof d.path === "string" &&
          typeof d.text === "string" &&
          Number.isInteger(d.revision) &&
          Number.isSafeInteger(d.sequence) &&
          Number.isFinite(d.updated) &&
          d.text.length <= 2 * 1024 * 1024
        )
          result.push(d);
      } catch {
        /* Unrecognized records stay untouched. */
      }
    }
    return result.sort((a, b) => b.updated - a.updated);
  }
  saved(project: string, path: string, snapshot: string, revision: number) {
    const id = this.key(project, path),
      raw = this.storage.getItem(id);
    if (!raw) return;
    const d: SourceDraft = JSON.parse(raw);
    return this.write(project, path, revision, d.text, snapshot);
  }
  discard(draft: SourceDraft) {
    const raw = this.storage.getItem(draft.id);
    const current: SourceDraft | undefined = raw ? JSON.parse(raw) : undefined;
    if (
      current &&
      (
        [
          "id",
          "project",
          "path",
          "sequence",
          "revision",
          "text",
          "updated",
          "cleared",
        ] as const
      ).some((key) => current[key] !== draft[key])
    )
      throw Error(
        "This draft changed in another view. Refresh before removing it.",
      );
    this.storage.removeItem(draft.id);
    this.sequences.set(
      draft.id,
      Math.max(this.sequences.get(draft.id) ?? 0, draft.sequence + 1),
    );
    return {
      ...draft,
      text: "",
      cleared: true,
      sequence: draft.sequence + 1,
      updated: this.now(),
    };
  }
}
