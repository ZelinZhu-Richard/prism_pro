import { createHash } from "node:crypto";
import type { Store } from "./store";
import { AppError, safePath, kindOf } from "./files";
import { rowMark, sameDisk } from "./disk-files";
import type {
  DiskReview,
  DiskResolution,
  SourceVersion,
} from "../shared/source-recovery";

export class SourceRecovery {
  constructor(private store: Store) {}
  review(id: string, name: string): DiskReview {
    const project = this.store.requireProject(id);
    safePath(name);
    const row = this.store.db
      .prepare("SELECT * FROM files WHERE project=? AND path=?")
      .get(id, name) as any;
    if (!row)
      throw new AppError(
        404,
        "This file is no longer indexed. Download your draft before choosing another destination.",
      );
    const actual = this.store.disk.inspect(id, name),
      desired = rowMark(row);
    const version = (
      kind: string,
      data?: Uint8Array,
      hash?: string,
    ): SourceVersion => {
      if (kind === "missing" || kind === "directory") return { kind };
      const bytes = Buffer.from(data ?? []);
      return bytes.length <= 2 * 1024 * 1024 &&
        kindOf(name, bytes) === "text" &&
        Buffer.from(bytes.toString("utf8")).equals(bytes)
        ? {
            kind: "text",
            content: bytes.toString("utf8"),
            size: bytes.length,
            hash,
          }
        : { kind: "binary", size: bytes.length, hash };
    };
    const saved = version(desired.kind, row.content, desired.hash),
      disk = version(actual.kind, actual.bytes, actual.hash);
    return {
      path: name,
      revision: row.revision,
      generation: project.generation,
      token: createHash("sha256")
        .update(
          JSON.stringify([
            id,
            name,
            project.generation,
            row.revision,
            desired,
            { kind: actual.kind, hash: actual.hash },
          ]),
        )
        .digest("hex"),
      changed: !sameDisk(actual, desired),
      editable:
        disk.kind === "text" ||
        (disk.kind === "missing" && row.kind === "text"),
      saved,
      disk,
    };
  }
  resolve(id: string, payload: any): DiskResolution {
    const name = safePath(payload.path);
    if (
      typeof payload.token !== "string" ||
      !["disk", "editor"].includes(payload.action)
    )
      throw new AppError(
        400,
        "Review the file versions before resolving them.",
      );
    if (
      payload.action === "editor" &&
      (typeof payload.content !== "string" ||
        Buffer.byteLength(payload.content) > 2 * 1024 * 1024)
    )
      throw new AppError(
        400,
        "The edited source must be text of at most 2 MiB.",
      );
    this.store.assertSourceOwner(id, name);
    const review = this.review(id, name);
    if (payload.token !== review.token)
      throw new AppError(
        409,
        "The file changed again. Refresh the comparison; your edited text is kept.",
      );
    if (
      payload.action === "editor" &&
      !["text", "missing"].includes(review.disk.kind)
    )
      throw new AppError(
        409,
        "This disk path is no longer editable text. Keep the disk version and download your draft.",
      );
    if (
      payload.action === "editor" &&
      review.disk.kind === "missing" &&
      this.store.db
        .prepare("SELECT kind FROM files WHERE project=? AND path=?")
        .get(id, name)?.kind !== "text"
    )
      throw new AppError(
        409,
        "The missing path was not editable text. Download your draft and choose another destination.",
      );
    // Import physical bytes first without rewriting them. Each side has a durable
    // source checkpoint before an explicitly chosen editor replacement can save.
    this.store.reconcileDisk(id, name, true);
    if (payload.action === "editor") {
      const current = this.store.file(id, name, true);
      if (current.deleted) this.store.trash(id, name, true);
      const file = this.store.readText(id, name);
      if (file.content !== payload.content) {
        this.store.checkpoint(id, "Before saving recovered text", true);
        this.store.save(id, name, payload.content, file.revision);
      }
    }
    const file = this.store
      .fileList(id)
      .find((f) => f.path === name && !f.deleted && f.kind === "text");
    return {
      project: this.store.project(id),
      file: file ? this.store.readText(id, name) : null,
    };
  }
}
