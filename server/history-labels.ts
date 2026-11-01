import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Store } from "./store";
import { AppError } from "./files";
import {
  ACTIVE_LABEL_LIMIT,
  STORED_LABEL_LIMIT,
  LABEL_NAME_LIMIT,
  labelKey,
  type HistoryLabel,
  type HistoryLabelRequest,
} from "../shared/history-labels";
import type { HistoryVersion } from "../shared/types";
type Row = Record<string, any>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function labelName(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > LABEL_NAME_LIMIT ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  )
    throw new AppError(
      400,
      "Enter a label of 1–120 characters, without control characters.",
    );
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (normalized.length > LABEL_NAME_LIMIT)
    throw new AppError(
      400,
      "Enter a label of at most 120 characters after Unicode normalization.",
    );
  return normalized;
}
function seed(
  id: string,
  name: string,
  automatic: number,
  created: string,
): HistoryLabel[] {
  if (automatic) return [];
  const hash = createHash("sha256")
    .update("prism-history-label:" + id)
    .digest("hex");
  return [
    {
      id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
      name,
      created,
      updated: created,
      deletedAt: null,
    },
  ];
}
export function seedVersionLabels(
  db: DatabaseSync,
  id: string,
  name: string,
  automatic: number,
  created: string,
) {
  db.prepare("INSERT OR IGNORE INTO history_label_state VALUES(?,0,?)").run(
    id,
    JSON.stringify(seed(id, name, automatic, created)),
  );
}
export function migrateHistoryLabels(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS history_label_state(checkpoint TEXT PRIMARY KEY,revision INTEGER NOT NULL,labels TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history_label_ops(id TEXT PRIMARY KEY,project TEXT NOT NULL,checkpoint TEXT NOT NULL,signature TEXT NOT NULL,created TEXT NOT NULL);`);
  db.exec("SAVEPOINT history_label_migration");
  try {
    for (const row of db
      .prepare(
        "SELECT c.id,c.name,c.automatic,c.created FROM checkpoints c LEFT JOIN history_label_state s ON s.checkpoint=c.id WHERE s.checkpoint IS NULL",
      )
      .all() as Row[])
      seedVersionLabels(db, row.id, row.name, row.automatic, row.created);
    db.exec("RELEASE history_label_migration");
  } catch (e) {
    db.exec(
      "ROLLBACK TO history_label_migration; RELEASE history_label_migration",
    );
    throw e;
  }
}
export function labelVersion(row: Row): HistoryVersion {
  const labels: HistoryLabel[] = row.labels
      ? JSON.parse(row.labels)
      : seed(row.id, row.name, row.automatic, row.created),
    active = labels.filter((l) => !l.deletedAt);
  return {
    id: row.id,
    name: active[0]?.name ?? (row.automatic ? row.name : "Saved version"),
    created: row.created,
    automatic: active.length ? 0 : row.automatic,
    reviewAvailable: row.reviewAvailable,
    reviewOmitted: row.reviewOmitted,
    labels,
    labelRevision: row.labelRevision ?? 0,
  };
}
export class HistoryLabels {
  constructor(readonly store: Store) {}
  get(project: string, checkpoint: string): HistoryVersion {
    this.store.requireProject(project);
    const row = this.store.db
      .prepare(
        "SELECT c.id,c.name,c.created,c.automatic,s.labels,s.revision labelRevision,CASE WHEN json_extract(c.payload,'$.reviewHash') IS NOT NULL THEN 1 ELSE 0 END reviewAvailable,json_extract(c.payload,'$.reviewOmitted') reviewOmitted FROM checkpoints c LEFT JOIN history_label_state s ON s.checkpoint=c.id WHERE c.id=? AND c.project=?",
      )
      .get(checkpoint, project) as Row | undefined;
    if (!row) throw new AppError(404, "Project version not found.");
    return labelVersion(row);
  }
  change(project: string, checkpoint: string, value: unknown) {
    this.store.requireProject(project);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new AppError(400, "Invalid label request.");
    const r = value as HistoryLabelRequest;
    if (
      typeof r.id !== "string" ||
      !uuid.test(r.id) ||
      !Number.isSafeInteger(r.expectedRevision) ||
      r.expectedRevision < 0 ||
      !["add", "rename", "remove", "restore"].includes(r.action)
    )
      throw new AppError(400, "Invalid label action, identifier or revision.");
    if (
      r.action === "add"
        ? r.labelId !== undefined
        : typeof r.labelId !== "string" || !uuid.test(r.labelId)
    )
      throw new AppError(400, "Choose a label in this version.");
    const name =
      r.action === "add" || r.action === "rename"
        ? labelName(r.name)
        : undefined;
    if (name === undefined && r.name !== undefined)
      throw new AppError(400, "This action does not change the label name.");
    const signature = createHash("sha256")
      .update(
        JSON.stringify([
          project,
          checkpoint,
          r.action,
          r.expectedRevision,
          r.labelId ?? null,
          name ?? null,
        ]),
      )
      .digest("hex");
    return this.store.transaction(() => {
      const prior = this.store.db
        .prepare("SELECT signature FROM history_label_ops WHERE id=?")
        .get(r.id) as Row | undefined;
      if (prior) {
        if (prior.signature !== signature)
          throw new AppError(
            409,
            "This label action identifier was already used for another request.",
          );
        return {
          version: this.get(project, checkpoint),
          operationId: r.id,
          replayed: true,
        };
      }
      this.store.unlocked(project);
      const version = this.get(project, checkpoint);
      if (version.labelRevision !== r.expectedRevision)
        throw new AppError(
          409,
          "Labels changed in another view. Refresh labels, review the saved names, and submit again.",
        );
      const labels = structuredClone(version.labels ?? []),
        active = labels.filter((l) => !l.deletedAt),
        now = new Date().toISOString();
      const target = labels.find((l) => l.id === r.labelId);
      if (r.action !== "add" && !target)
        throw new AppError(404, "Label not found in this version.");
      if (
        r.action === "restore"
          ? !target?.deletedAt
          : r.action !== "add" && !!target?.deletedAt
      )
        throw new AppError(
          409,
          "The label state changed. Refresh labels before trying again.",
        );
      const nextName = name ?? target?.name;
      if (
        r.action !== "remove" &&
        active.some(
          (l) =>
            l.id !== target?.id && labelKey(l.name) === labelKey(nextName!),
        )
      )
        throw new AppError(
          409,
          "This version already has that label. Choose a different name.",
        );
      if (
        (r.action === "add" || r.action === "restore") &&
        active.length >= ACTIVE_LABEL_LIMIT
      )
        throw new AppError(
          413,
          "This version has 100 active labels. Remove or rename an existing label first.",
        );
      if (r.action === "add" && labels.length >= STORED_LABEL_LIMIT)
        throw new AppError(
          413,
          "This version retains 500 labels including removed ones. Rename or restore an existing label.",
        );
      if (r.action === "add")
        labels.push({
          id: r.id,
          name: name!,
          created: now,
          updated: now,
          deletedAt: null,
        });
      else {
        target!.updated = now;
        if (r.action === "rename") target!.name = name!;
        else target!.deletedAt = r.action === "remove" ? now : null;
      }
      this.store.db
        .prepare(
          "INSERT INTO history_label_state VALUES(?,?,?) ON CONFLICT(checkpoint) DO UPDATE SET revision=excluded.revision,labels=excluded.labels",
        )
        .run(checkpoint, r.expectedRevision + 1, JSON.stringify(labels));
      this.store.db
        .prepare("INSERT INTO history_label_ops VALUES(?,?,?,?,?)")
        .run(r.id, project, checkpoint, signature, now);
      return {
        version: this.get(project, checkpoint),
        operationId: r.id,
        replayed: false,
      };
    });
  }
  legacyAdd(project: string, checkpoint: string, name: string) {
    const valid = labelName(name),
      version = this.get(project, checkpoint);
    this.store.unlocked(project);
    if (
      !(version.labels ?? []).some(
        (l) => !l.deletedAt && labelKey(l.name) === labelKey(valid),
      )
    )
      this.change(project, checkpoint, {
        id: randomUUID(),
        action: "add",
        expectedRevision: version.labelRevision,
        name: valid,
      });
    return this.store.checkpoints(project);
  }
}
