import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Store } from "./store";
import {
  AppError,
  safePath,
  within,
  validateTree,
  kindOf,
  writeZip,
} from "./files";
import { commitFileTree } from "./file-moves";
import { DISK_RECOVERY_BYTES, type DiskMark } from "./disk-files";
import {
  coversPath,
  selectionRoots,
  projectFolders,
} from "../shared/file-moves";
import {
  UPLOAD_BYTES,
  UPLOAD_ENTRIES,
  UPLOAD_FILES,
  uploadPathIssue,
  type UploadEntry,
  type UploadReview,
  type BatchResult,
  type BatchKind,
  type SavedBatch,
} from "../shared/file-batches";

type State = { revision: number; kind: string; deleted: boolean; hash: string };
type Change = { path: string; before: State | null; after: State };
type Payload = { kind: BatchKind; request: string; changes: Change[] };
type Request = { requestId?: unknown; generation?: unknown; paths?: unknown };
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const canonical = (s: string) => s.normalize("NFC").toLowerCase();
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(message: string, status = 409): never {
  throw new AppError(status, message);
}

const same = (a: State, b: State) =>
  a.revision === b.revision &&
  a.kind === b.kind &&
  a.deleted === b.deleted &&
  a.hash === b.hash;
function diskMark(state: State | null): DiskMark {
  if (!state || state.deleted) return { kind: "missing", hash: "" };
  return state.kind === "directory"
    ? { kind: "directory", hash: "" }
    : { kind: "file", hash: state.hash };
}
export class FileBatches {
  private uploads = new Map<
    string,
    { project: string; review: UploadReview; expires: number }
  >();
  constructor(public store: Store) {}
  private roots(id: string, paths: unknown, deleted?: boolean) {
    const p = this.store.project(id);
    if (!Array.isArray(paths) || !paths.length || paths.length > 200)
      fail("Select between 1 and 200 files or folders.", 400);
    const roots = selectionRoots((paths as unknown[]).map(safePath));
    for (const name of roots)
      if (
        !p.files.some(
          (f) =>
            (deleted === undefined || f.deleted === deleted) &&
            coversPath(name, f.path),
        )
      )
        fail("A selected item changed. Refresh the file list.", 404);
    return roots;
  }
  private generation(id: string, generation: unknown): number {
    this.assertAvailable(id);
    if (
      !Number.isInteger(generation) ||
      this.store.project(id).generation !== generation
    )
      fail("The project changed. Refresh the review before applying it.");
    return generation as number;
  }
  private assertAvailable(id: string) {
    if (this.store.directories.binding(id)) {
      this.store.assertSourceOwner(id);
      this.store.assertDiskAvailable(id);
    } else this.store.unlocked(id);
  }
  private requestId(value: unknown) {
    if (typeof value !== "string" || !uuid.test(value))
      fail("A valid request identifier is required.", 400);
    return value as string;
  }
  private rowState(row: any): State {
    return {
      revision: row.revision,
      kind: row.kind,
      deleted: !!row.deleted,
      hash: hash(Buffer.from(row.content)),
    };
  }
  private find(id: string, name: string) {
    return this.store.db
      .prepare("SELECT * FROM files WHERE project=? AND path=?")
      .get(id, name) as any;
  }
  private existing(
    id: string,
    requestId: string,
    request: string,
  ): BatchResult | null {
    const row = this.store.db
      .prepare("SELECT * FROM file_batches WHERE id=?")
      .get(requestId) as any;
    if (!row) return null;
    const payload = JSON.parse(row.payload) as Payload;
    if (row.project !== id || payload.request !== request)
      fail("This request identifier belongs to another file operation.");
    return {
      project: this.store.project(id),
      operationId: requestId,
      changedFiles: payload.changes.map((c) => c.path),
      replayed: true,
      undone: row.status === "undone",
    };
  }
  uploadPreview(
    id: string,
    input: { entries?: unknown; destination?: unknown },
  ): UploadReview {
    const p = this.store.project(id);
    if (typeof input.destination !== "string")
      fail("Choose an upload destination.", 400);
    const destination = input.destination ? safePath(input.destination) : "";
    if (destination && !projectFolders(p.files).includes(destination))
      fail("The destination folder no longer exists.", 404);
    if (
      !Array.isArray(input.entries) ||
      !input.entries.length ||
      input.entries.length > UPLOAD_ENTRIES
    )
      fail(`Choose between 1 and ${UPLOAD_ENTRIES} entries.`, 400);
    let bytes = 0,
      files = 0;
    const incoming: UploadEntry[] = (input.entries as any[]).map((e) => {
      if (
        !e ||
        typeof e.path !== "string" ||
        !Number.isSafeInteger(e.size) ||
        e.size < 0 ||
        (e.directory !== undefined && typeof e.directory !== "boolean")
      )
        fail("Invalid upload manifest.", 400);
      const issue = uploadPathIssue(e.path);
      if (issue.skip || issue.error)
        fail(
          issue.error || "Remove hidden files and metadata from the upload.",
          400,
        );
      safePath(e.path);
      if (e.directory && e.size !== 0)
        fail("Directories must have zero bytes.", 400);
      bytes += e.size;
      if (!e.directory) files++;
      return { path: e.path, size: e.size, directory: !!e.directory };
    });
    if (bytes > UPLOAD_BYTES || files > UPLOAD_FILES)
      fail(
        `An upload can contain at most ${UPLOAD_FILES} files and 50 MB.`,
        413,
      );
    validateTree(
      incoming.map((e) => ({
        path: e.path,
        directory: e.directory,
        data: Buffer.alloc(0),
      })),
    );
    const review: UploadReview = {
      token: randomUUID(),
      generation: p.generation,
      entries: incoming.map((e, index) => {
        const target = [destination, e.path].filter(Boolean).join("/");
        safePath(target);
        const same = p.files.find(
          (f) => canonical(f.path) === canonical(target),
        );
        let status: UploadReview["entries"][number]["status"] = "add",
          reason: string | undefined;
        if (same) {
          if (same.path !== target) {
            status = "blocked";
            reason =
              "A path with different casing or Unicode spelling already exists.";
          } else if (same.deleted) {
            status = "blocked";
            reason =
              "This path is in Trash. Restore it or choose another location.";
          } else if ((same.kind === "directory") !== !!e.directory) {
            status = "blocked";
            reason = "A file and folder have the same path.";
          } else status = e.directory ? "merge" : "replace";
        }
        const implicitFolder =
          e.directory &&
          projectFolders(p.files).find(
            (folder) => canonical(folder) === canonical(target),
          );
        if (status === "add" && implicitFolder) {
          status = implicitFolder === target ? "merge" : "blocked";
          if (status === "blocked")
            reason =
              "A folder with different casing or Unicode spelling already exists.";
        }
        if (status === "add") {
          try {
            validateTree([
              ...p.files.map((f) => ({
                path: f.path,
                directory: f.kind === "directory",
                data: Buffer.alloc(0),
              })),
              { path: target, directory: e.directory, data: Buffer.alloc(0) },
            ]);
          } catch {
            status = "blocked";
            reason =
              "This path conflicts with an existing file or folder, including Trash.";
          }
        }
        return { ...e, index, target, status, reason };
      }),
    };
    const now = Date.now();
    for (const [key, item] of this.uploads)
      if (item.expires < now) this.uploads.delete(key);
    if (this.uploads.size >= 128)
      this.uploads.delete(this.uploads.keys().next().value!);
    this.uploads.set(review.token, {
      project: id,
      review,
      expires: now + 15 * 60_000,
    });
    return review;
  }
  upload(
    id: string,
    input: { token?: unknown; indices?: unknown; requestId?: unknown },
    data: Map<number, Buffer>,
  ): BatchResult {
    this.store.linkedBatches.assertReady(id);
    const requestId = this.requestId(input.requestId);
    if (
      typeof input.token !== "string" ||
      !uuid.test(input.token) ||
      !Array.isArray(input.indices) ||
      !input.indices.length ||
      input.indices.length > UPLOAD_ENTRIES ||
      !input.indices.every(Number.isInteger)
    )
      fail("Refresh the upload review.", 400);
    const indices = [...new Set(input.indices as number[])].sort(
      (a, b) => a - b,
    );
    const request = hash(
      JSON.stringify({
        kind: "upload",
        token: input.token,
        indices,
        data: [...data].sort(([a], [b]) => a - b).map(([i, b]) => [i, hash(b)]),
      }),
    );
    const replay = this.existing(id, requestId, request);
    if (replay) return replay;
    const saved = this.uploads.get(input.token as string);
    if (!saved || saved.project !== id || saved.expires < Date.now())
      fail("The upload review expired. Refresh it and try again.");
    this.generation(id, saved.review.generation);
    const entries = indices.map(
      (i) =>
        saved.review.entries[i] ??
        fail("The upload selection is invalid.", 400),
    );
    if (entries.some((e) => e.status === "blocked" || e.status === "merge"))
      fail(
        "Remove unavailable or already merged entries from the upload.",
        400,
      );
    if (
      [...data.keys()].some((i) => !indices.includes(i)) ||
      data.size !== entries.filter((e) => !e.directory).length
    )
      fail("Upload contents do not match the reviewed selection.", 400);
    const contents = new Map<string, Buffer>(),
      changes: Change[] = [];
    for (const e of entries) {
      const bytes = e.directory ? Buffer.alloc(0) : data.get(e.index);
      if (!bytes || bytes.length !== e.size)
        fail(
          "An uploaded file has a different size. Select the files again.",
          400,
        );
      const old = this.find(id, e.target),
        before = old ? this.rowState(old) : null;
      if (
        old &&
        before!.hash === hash(bytes) &&
        old.kind === (e.directory ? "directory" : kindOf(e.target, bytes))
      )
        continue;
      contents.set(e.target, bytes);
      changes.push({
        path: e.target,
        before,
        after: {
          revision: this.store.nextFileRevision(
            id,
            e.target,
            old ? old.revision + 1 : 0,
          ),
          kind: e.directory ? "directory" : kindOf(e.target, bytes),
          deleted: false,
          hash: hash(bytes),
        },
      });
    }
    if (!changes.length)
      fail(
        "The selected files already have the same contents. Nothing was changed.",
      );
    return this.apply(
      id,
      requestId,
      { kind: "upload", request, changes },
      contents,
      saved.review.generation,
    );
  }
  statePreview(id: string, kind: "trash" | "restore", paths: unknown) {
    const roots = this.roots(id, paths, kind === "restore"),
      p = this.store.project(id);
    const files = p.files.filter(
      (f) =>
        f.deleted === (kind === "restore") &&
        roots.some((r) => coversPath(r, f.path)),
    );
    if (files.length > 5000) fail("Select at most 5,000 project entries.", 413);
    return {
      generation: p.generation,
      paths: roots,
      files,
      rootIncluded: files.some((f) => f.path === p.root),
    };
  }
  state(id: string, kind: "trash" | "restore", input: Request): BatchResult {
    this.store.linkedBatches.assertReady(id);
    const requestId = this.requestId(input.requestId),
      request = hash(
        JSON.stringify({
          kind,
          paths: input.paths,
          generation: input.generation,
        }),
      );
    const replay = this.existing(id, requestId, request);
    if (replay) return replay;
    const generation = this.generation(id, input.generation);
    const preview = this.statePreview(id, kind, input.paths),
      changes = preview.files.map((f) => {
        const row = this.store.file(id, f.path, true),
          before = this.rowState(row);
        return {
          path: f.path,
          before,
          after: {
            ...before,
            deleted: kind === "trash",
            revision: this.store.nextFileRevision(id, f.path, f.revision + 1),
          },
        };
      });
    if (kind === "trash")
      for (const folder of preview.paths)
        if (projectFolders(this.store.fileList(id)).includes(folder))
          this.assertIndexedFolder(id, folder);
    return this.apply(
      id,
      requestId,
      { kind, request, changes },
      new Map(),
      generation,
    );
  }
  private blob(hash: string) {
    const r = this.store.db
      .prepare("SELECT content FROM history_blobs WHERE hash=?")
      .get(hash) as any;
    if (!r)
      fail(
        "Saved file contents are missing. Preserve the project for recovery.",
      );
    return Buffer.from(r.content);
  }
  private assertDisk(id: string, changes: Change[]) {
    const source = this.store.projectDir(id),
      files = this.store.fileList(id),
      folders = new Set(projectFolders(files));
    for (const c of changes) {
      const target = within(source, c.path),
        old = this.find(id, c.path),
        exists = fs.existsSync(target);
      if (old && !old.deleted) {
        if (!exists)
          fail(
            "A selected file is missing on disk. Preserve external changes and reopen the project.",
          );
        const stat = fs.lstatSync(target);
        if (
          old.kind === "directory"
            ? !stat.isDirectory()
            : !stat.isFile() ||
              !fs.readFileSync(target).equals(Buffer.from(old.content))
        )
          fail(
            "A selected file changed outside Leaf. Preserve it and reopen the project.",
          );
      } else if (
        exists &&
        !(
          c.after.kind === "directory" &&
          fs.lstatSync(target).isDirectory() &&
          folders.has(c.path)
        )
      )
        fail(
          "An unindexed item already occupies an upload or restore path. Preserve it and choose another location.",
        );
      if (c.after.deleted && c.after.kind === "directory" && exists)
        this.assertIndexedFolder(id, c.path);
    }
  }
  private assertIndexedFolder(id: string, root: string) {
    const source = this.store.projectDir(id),
      files = this.store.fileList(id),
      folders = new Set(projectFolders(files)),
      pending = [root];
    while (pending.length) {
      const folder = pending.pop()!;
      for (const entry of fs.readdirSync(within(source, folder), {
        withFileTypes: true,
      })) {
        const name = folder + "/" + entry.name;
        if (
          entry.isSymbolicLink() ||
          !(
            files.some((f) => !f.deleted && f.path === name) ||
            folders.has(name)
          )
        )
          fail(
            "This folder contains disk-only items. Preserve them or add them to Leaf before moving the folder to Trash.",
          );
        if (entry.isDirectory()) pending.push(name);
      }
    }
  }
  private apply(
    id: string,
    operationId: string,
    payload: Payload,
    contents: Map<string, Buffer>,
    generation: number,
    undo = false,
  ): BatchResult {
    this.assertAvailable(id);
    const linked = !!this.store.directories.binding(id);
    const all = this.store.fileList(id),
      changed = new Map(payload.changes.map((c) => [c.path, c.after]));
    const final = all.map((f) => ({
      path: f.path,
      kind: changed.get(f.path)?.kind ?? f.kind,
      deleted: changed.get(f.path)?.deleted ?? f.deleted,
    }));
    for (const c of payload.changes)
      if (!all.some((f) => f.path === c.path))
        final.push({
          path: c.path,
          kind: c.after.kind as any,
          deleted: c.after.deleted,
        });
    validateTree(
      final.map((f) => ({
        path: f.path,
        directory: f.kind === "directory",
        data: Buffer.alloc(0),
      })),
    );
    for (const c of payload.changes)
      if (
        c.after.deleted &&
        c.after.kind === "directory" &&
        final.some((f) => !f.deleted && f.path.startsWith(c.path + "/"))
      )
        fail(
          "This folder contains files added after the operation. Restore or move those files first.",
        );
    if (!linked) this.assertDisk(id, payload.changes);
    const removedFolders = linked
      ? payload.changes.filter(
          (c) =>
            c.before?.kind === "directory" &&
            !c.before.deleted &&
            c.after.deleted,
        )
      : [];
    for (const folder of selectionRoots(removedFolders.map((c) => c.path)))
      this.assertIndexedFolder(id, folder);
    const implicitRemovals = linked
      ? projectFolders(all).filter((name) =>
          removedFolders.some((folder) => coversPath(folder.path, name)),
        )
      : [];
    if (linked) {
      const sizes = new Map(all.map((entry) => [entry.path, entry.size]));
      const bytes = payload.changes.reduce(
        (total, item) =>
          total +
          (sizes.get(item.path) ?? 0) +
          (contents.get(item.path)?.length ?? 0),
        0,
      );
      if (bytes > DISK_RECOVERY_BYTES)
        fail(
          "Local folder batches are limited to 128 MiB of affected source.",
          413,
        );
    }
    const bytes = new Map<string, Buffer>();
    for (const c of payload.changes) {
      const current = this.find(id, c.path);
      if (current)
        bytes.set(
          hash(Buffer.from(current.content)),
          Buffer.from(current.content),
        );
      const after =
        contents.get(c.path) ??
        (current && hash(Buffer.from(current.content)) === c.after.hash
          ? Buffer.from(current.content)
          : this.blob(c.after.hash));
      bytes.set(c.after.hash, after);
    }
    const mutate = () => {
      if (linked) this.store.automaticCheckpoint(id);
      for (const [key, data] of bytes)
        this.store.db
          .prepare("INSERT OR IGNORE INTO history_blobs VALUES(?,?)")
          .run(key, data);
      for (const c of payload.changes) {
        const old = this.find(id, c.path);
        if (old && hash(Buffer.from(old.content)) !== c.after.hash)
          this.store.db
            .prepare(
              "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
            )
            .run(
              id,
              c.path,
              old.revision,
              old.content,
              new Date().toISOString(),
            );
        this.store.insert(
          id,
          c.path,
          bytes.get(c.after.hash)!,
          c.after.kind,
          c.after.revision,
        );
        if (c.after.deleted)
          this.store.db
            .prepare("UPDATE files SET deleted=1 WHERE project=? AND path=?")
            .run(id, c.path);
      }
      this.store.touch(id);
      if (undo) {
        this.store.db
          .prepare("UPDATE file_batches SET status='undone' WHERE id=?")
          .run(operationId);
        for (const row of this.store.db
          .prepare(
            "SELECT id,payload FROM file_batches WHERE project=? AND status='applied'",
          )
          .all(id) as any[]) {
          const older = JSON.parse(row.payload) as Payload;
          let updated = false;
          for (const c of older.changes) {
            const restored = changed.get(c.path);
            if (
              restored &&
              c.after.hash === restored.hash &&
              c.after.kind === restored.kind &&
              c.after.deleted === restored.deleted
            ) {
              c.after.revision = restored.revision;
              updated = true;
            }
          }
          if (updated)
            this.store.db
              .prepare("UPDATE file_batches SET payload=? WHERE id=?")
              .run(JSON.stringify(older), row.id);
        }
      } else
        this.store.db
          .prepare("INSERT INTO file_batches VALUES(?,?,?,?,?)")
          .run(
            operationId,
            id,
            JSON.stringify(payload),
            "applied",
            new Date().toISOString(),
          );
      this.store.checkpoint(
        id,
        (undo
          ? "Undid "
          : payload.kind === "upload"
            ? "Uploaded "
            : payload.kind === "trash"
              ? "Trashed "
              : "Restored ") +
          payload.changes.length +
          " entries",
        true,
      );
    };
    if (linked) {
      this.store.linkedBatches.commit(
        id,
        generation,
        payload.changes.map((c) => ({
          path: c.path,
          before: diskMark(c.before),
          revision: c.before?.revision ?? null,
          after: { ...c.after, content: bytes.get(c.after.hash)! },
        })),
        implicitRemovals,
        mutate,
      );
    } else {
      this.store.automaticCheckpoint(id);
      commitFileTree(
        this.store,
        id,
        (stage) => {
          for (const c of [...payload.changes].sort(
            (a, b) => b.path.length - a.path.length,
          ))
            if (c.after.deleted) {
              const target = within(stage, c.path);
              fs.rmSync(target, {
                recursive: c.after.kind === "directory",
                force: true,
              });
            }
          for (const c of [...payload.changes].sort(
            (a, b) => a.path.length - b.path.length,
          ))
            if (!c.after.deleted) {
              const target = within(stage, c.path);
              fs.mkdirSync(path.dirname(target), { recursive: true });
              if (c.after.kind === "directory")
                fs.mkdirSync(target, { recursive: true });
              else
                fs.writeFileSync(target, bytes.get(c.after.hash)!, {
                  mode: 0o600,
                });
            }
        },
        mutate,
      );
    }
    return {
      project: this.store.project(id),
      operationId,
      changedFiles: payload.changes.map((c) => c.path),
      undone: undo || undefined,
    };
  }
  private undoable(id: string, payload: Payload) {
    return payload.changes.every((c) => {
      const current = this.find(id, c.path);
      return current && same(this.rowState(current), c.after);
    });
  }
  list(id: string): SavedBatch[] {
    this.store.requireProject(id);
    const rows = this.store.db
        .prepare(
          "SELECT * FROM file_batches WHERE project=? ORDER BY rowid DESC LIMIT 20",
        )
        .all(id) as any[],
      latest = rows.find((r) => r.status === "applied")?.id;
    return rows.map((row) => {
      const p = JSON.parse(row.payload) as Payload;
      return {
        id: row.id,
        kind: p.kind,
        count: p.changes.length,
        created: row.created,
        status: row.status,
        undoable: row.id === latest && this.undoable(id, p),
      };
    });
  }
  undo(id: string, operationId: string): BatchResult {
    this.assertAvailable(id);
    const generation = this.store.requireProject(id).generation;
    const row = this.store.db
      .prepare("SELECT * FROM file_batches WHERE id=? AND project=?")
      .get(operationId, id) as any;
    if (!row) fail("File operation not found.", 404);
    const payload = JSON.parse(row.payload) as Payload;
    if (row.status === "undone")
      return {
        project: this.store.project(id),
        operationId,
        changedFiles: payload.changes.map((c) => c.path),
        undone: true,
        replayed: true,
      };
    if (!this.undoable(id, payload))
      fail(
        "These files changed after the operation. Use project History to restore them.",
      );
    const inverse: Payload = {
      ...payload,
      changes: payload.changes.map((c) => ({
        path: c.path,
        before: c.after,
        after: {
          ...(c.before ?? { ...c.after, deleted: true }),
          revision: this.store.nextFileRevision(
            id,
            c.path,
            c.after.revision + 1,
          ),
        },
      })),
    };
    return this.apply(id, operationId, inverse, new Map(), generation, true);
  }
  download(id: string, paths: unknown, generation: unknown) {
    const p = this.store.project(id);
    if (!Number.isInteger(generation) || generation !== p.generation)
      fail("The project changed. Refresh the file selection.");
    const roots = this.roots(id, paths, false),
      files = p.files.filter(
        (f) => !f.deleted && roots.some((r) => coversPath(r, f.path)),
      );
    if (
      files.length > 5000 ||
      files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024
    )
      fail("Selected downloads are limited to 5,000 entries and 100 MB.", 413);
    return writeZip(
      files.map((f) => ({
        path: f.path,
        directory: f.kind === "directory",
        data: this.store.file(id, f.path).content,
      })),
    );
  }
}
