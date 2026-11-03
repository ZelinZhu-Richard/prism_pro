import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { AppError, within } from "./files";

export const DISK_FILE_BYTES = 100 * 1024 * 1024;
export const DISK_RECOVERY_BYTES = 128 * 1024 * 1024;
export interface DiskMark {
  kind: "missing" | "directory" | "file";
  hash: string;
}
export interface DiskEntry extends DiskMark {
  bytes?: Buffer;
}
export interface DiskRow {
  kind: string;
  content: Uint8Array;
  deleted?: boolean | number;
  revision: number;
}
export class DiskConflict extends AppError {
  constructor(name: string, detail = "changed outside Leaf") {
    super(
      409,
      `${name}: ${detail}. Disk files were preserved. Keep your unsaved text and choose Review file versions in Leaf. Correct unsafe disk paths before retrying.`,
    );
  }
}
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export function rowMark(row?: DiskRow): DiskMark {
  return !row || row.deleted
    ? { kind: "missing", hash: "" }
    : row.kind === "directory"
      ? { kind: "directory", hash: "" }
      : { kind: "file", hash: hash(row.content) };
}
export function sameDisk(a: DiskMark, b: DiskMark) {
  return a.kind === b.kind && a.hash === b.hash;
}
function stat(file: string) {
  try {
    return fs.lstatSync(file);
  } catch (e: any) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return undefined;
    throw e;
  }
}
/** Never follow links or wait on devices/FIFOs while inspecting project files. */
export class DiskFiles {
  constructor(
    private db: DatabaseSync,
    private directory: (id: string) => string,
    private assertWritable?: (id: string, name: string) => void,
  ) {}
  root(id: string) {
    const root = this.directory(id);
    for (const dir of [
      path.dirname(path.dirname(root)),
      path.dirname(root),
      root,
    ]) {
      const s = stat(dir);
      if (s && (!s.isDirectory() || s.isSymbolicLink()))
        throw new DiskConflict(
          "Project",
          "project storage is not a plain directory",
        );
    }
    return root;
  }
  private target(id: string, name: string) {
    const root = this.root(id);
    try {
      return within(root, name);
    } catch (e) {
      if (e instanceof AppError) throw new DiskConflict(name, e.message);
      throw e;
    }
  }
  /** Metadata hint only. A changed hint must still be checked with inspect(). */
  fingerprint(id: string, name: string) {
    const entry = stat(this.target(id, name));
    if (!entry) return { key: "missing", size: 0 };
    if (
      (!entry.isFile() && !entry.isDirectory()) ||
      entry.isSymbolicLink() ||
      (entry.isFile() && (entry.nlink !== 1 || entry.size > DISK_FILE_BYTES))
    )
      throw new DiskConflict(
        name,
        "cannot be inspected as a plain project file",
      );
    return {
      key: JSON.stringify([
        entry.dev,
        entry.ino,
        entry.mode,
        entry.nlink,
        entry.uid,
        entry.gid,
        entry.size,
        entry.mtimeMs,
        entry.ctimeMs,
      ]),
      size: entry.isFile() ? entry.size : 0,
    };
  }
  inspect(id: string, name: string): DiskEntry {
    try {
      return this.inspectFile(id, name);
    } catch (e: any) {
      if (e instanceof DiskConflict) throw e;
      if (e.code === "ENOTDIR") return { kind: "missing", hash: "" };
      if (typeof e.code === "string")
        throw new DiskConflict(name, `cannot be inspected safely (${e.code})`);
      throw e;
    }
  }
  private inspectFile(id: string, name: string): DiskEntry {
    const file = this.target(id, name),
      before = stat(file);
    if (!before) return { kind: "missing", hash: "" };
    if (before.isDirectory()) return { kind: "directory", hash: "" };
    if (!before.isFile() || before.nlink !== 1 || before.size > DISK_FILE_BYTES)
      throw new DiskConflict(
        name,
        "is not a regular single-link file of at most 100 MiB",
      );
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
      const opened = fs.fstatSync(fd);
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.size > DISK_FILE_BYTES ||
        opened.ino !== before.ino ||
        opened.dev !== before.dev
      )
        throw new DiskConflict(name, "changed while being inspected");
      const bytes = Buffer.alloc(opened.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.readSync(
          fd,
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        if (!count) throw new DiskConflict(name, "changed while being read");
        offset += count;
      }
      const after = fs.fstatSync(fd),
        current = stat(file);
      if (
        !current ||
        !current.isFile() ||
        current.nlink !== 1 ||
        current.ino !== opened.ino ||
        current.dev !== opened.dev ||
        after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs ||
        after.ctimeMs !== opened.ctimeMs ||
        current.size !== after.size ||
        current.mtimeMs !== after.mtimeMs ||
        current.ctimeMs !== after.ctimeMs
      )
        throw new DiskConflict(name, "changed while being read");
      return { kind: "file", hash: hash(bytes), bytes };
    } finally {
      fs.closeSync(fd);
    }
  }
  receipt(
    id: string,
    name: string,
  ): (DiskMark & { pending: number }) | undefined {
    return this.db
      .prepare(
        "SELECT kind,hash,pending FROM file_disk_state WHERE project=? AND path=?",
      )
      .get(id, name) as (DiskMark & { pending: number }) | undefined;
  }
  acknowledge(id: string, name: string, mark: DiskMark, revision: number) {
    this.db
      .prepare(
        "INSERT INTO file_disk_state VALUES(?,?,?,?,?,0) ON CONFLICT(project,path) DO UPDATE SET kind=excluded.kind,hash=excluded.hash,revision=excluded.revision,pending=0",
      )
      .run(id, name, mark.kind, mark.hash, revision);
  }
  /** Persist the known pre-write state before source commits. Keep an earlier unfinished intent. */
  prepare(id: string, name: string, before?: DiskRow, desired?: DiskRow) {
    const actual = this.inspect(id, name),
      base = this.receipt(id, name);
    if (desired && !sameDisk(actual, rowMark(desired)))
      this.assertWritable?.(id, name);
    if (
      sameDisk(actual, rowMark(before)) ||
      (desired && sameDisk(actual, rowMark(desired)))
    ) {
      this.acknowledge(id, name, actual, before?.revision ?? -1);
    } else if (!base?.pending || !sameDisk(actual, base)) {
      throw new DiskConflict(name);
    }
    this.db
      .prepare(
        "UPDATE file_disk_state SET pending=1 WHERE project=? AND path=?",
      )
      .run(id, name);
  }
  write(id: string, name: string, row: DiskRow) {
    try {
      return this.writeFile(id, name, row);
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      if (typeof e.code === "string")
        throw new DiskConflict(name, `could not be written safely (${e.code})`);
      throw e;
    }
  }
  private writeFile(id: string, name: string, row: DiskRow) {
    const actual = this.inspect(id, name),
      desired = rowMark(row);
    if (sameDisk(actual, desired)) {
      this.acknowledge(id, name, desired, row.revision);
      return;
    }
    const base = this.receipt(id, name);
    if (!base?.pending || !sameDisk(actual, base)) throw new DiskConflict(name);
    this.assertWritable?.(id, name);
    const file = this.target(id, name);
    if (desired.kind === "missing") {
      // Unknown files in a directory must never disappear through recursive cleanup.
      if (actual.kind === "directory") fs.rmdirSync(file);
      else if (actual.kind === "file") fs.unlinkSync(file);
    } else if (desired.kind === "directory") {
      if (actual.kind !== "missing")
        throw new DiskConflict(name, "changed file type");
      fs.mkdirSync(file, { recursive: true });
    } else {
      if (actual.kind === "directory")
        throw new DiskConflict(name, "changed file type");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = file + "." + randomUUID() + ".prism-tmp";
      let created = false;
      try {
        const fd = fs.openSync(temporary, "wx", 0o600);
        created = true;
        try {
          fs.writeFileSync(fd, row.content);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        // An external edit during staging invalidates the write, leaving both
        // the committed app version and physical external bytes recoverable.
        if (!sameDisk(this.inspect(id, name), base))
          throw new DiskConflict(name, "changed while Leaf was saving");
        this.assertWritable?.(id, name);
        fs.renameSync(temporary, file);
      } finally {
        if (created) fs.rmSync(temporary, { force: true });
      }
    }
    this.acknowledge(id, name, desired, row.revision);
  }
}
