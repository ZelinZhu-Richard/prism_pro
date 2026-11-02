import type { Store } from "./store";
import { AppError, safePath } from "./files";
import type { SourceDraft } from "../shared/source-recovery";
export class SourceDraftStore {
  constructor(private store: Store) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS source_drafts(id TEXT PRIMARY KEY,project TEXT NOT NULL,path TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS source_drafts_project ON source_drafts(project)",
    );
  }
  list(project: string): SourceDraft[] {
    this.store.requireProject(project);
    return (
      this.store.db
        .prepare(
          "SELECT payload FROM source_drafts WHERE project=? ORDER BY json_extract(payload,'$.updated') DESC",
        )
        .all(project) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  save(project: string, draft: SourceDraft): SourceDraft {
    this.store.requireProject(project);
    if (
      !draft ||
      draft.project !== project ||
      typeof draft.id !== "string" ||
      draft.id.length > 1400 ||
      !draft.id.startsWith("prism:source-draft:v1:") ||
      !Number.isSafeInteger(draft.sequence) ||
      draft.sequence < 1 ||
      !Number.isSafeInteger(draft.revision) ||
      draft.revision < 0 ||
      typeof draft.text !== "string" ||
      Buffer.byteLength(draft.text) > 2 * 1024 * 1024 ||
      !Number.isSafeInteger(draft.updated) ||
      (draft.cleared !== undefined && typeof draft.cleared !== "boolean")
    )
      throw new AppError(400, "Invalid source recovery draft.");
    safePath(draft.path);
    const value: SourceDraft = {
      id: draft.id,
      project,
      path: draft.path,
      sequence: draft.sequence,
      revision: draft.revision,
      text: draft.cleared ? "" : draft.text,
      updated: draft.updated,
      ...(draft.cleared ? { cleared: true } : {}),
    };
    return this.store.transaction(() => {
      const old = this.store.db
        .prepare("SELECT project,payload FROM source_drafts WHERE id=?")
        .get(value.id) as { project: string; payload: string } | undefined;
      if (old) {
        if (old.project !== project)
          throw new AppError(409, "This draft belongs to a different project.");
        const current: SourceDraft = JSON.parse(old.payload);
        if (current.path !== value.path)
          throw new AppError(409, "This draft belongs to a different file.");
        if (current.sequence > value.sequence) return current;
        if (current.sequence === value.sequence) {
          if (JSON.stringify(current) !== JSON.stringify(value))
            throw new AppError(
              409,
              "This draft sequence has already been saved with different text.",
            );
          return current;
        }
      }
      const active = this.list(project).filter(
        (d) => !d.cleared && d.id !== value.id,
      );
      if (
        !value.cleared &&
        (active.length >= 100 ||
          active.reduce((n, d) => n + Buffer.byteLength(d.text), 0) +
            Buffer.byteLength(value.text) >
            20 * 1024 * 1024)
      )
        throw new AppError(
          413,
          "Source recovery storage is full for this project. Review existing drafts; your browser copy is kept.",
        );
      this.store.db
        .prepare(
          "INSERT INTO source_drafts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,payload=excluded.payload",
        )
        .run(
          value.id,
          project,
          value.path,
          value.sequence,
          JSON.stringify(value),
        );
      return value;
    });
  }
}
