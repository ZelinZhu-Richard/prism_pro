import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { AppError, within } from "./files";
import { DiskConflict } from "./disk-files";

export interface DirectoryIdentity {
  path: string;
  device: string;
  inode: string;
  birthtime: string;
}
export interface LinkedDirectory extends DirectoryIdentity {
  project: string;
}
const integer = /^\d+$/;
/** Component boundaries include filesystem roots; folding matches the project path policy. */
export function directoryPathsOverlap(a: string, b: string) {
  const key = (value: string) =>
    path.resolve(value).normalize("NFC").toLowerCase();
  const inside = (base: string, target: string) => {
    const relative = path.relative(base, target);
    return (
      relative === "" ||
      (!path.isAbsolute(relative) &&
        relative !== ".." &&
        !relative.startsWith(".." + path.sep))
    );
  };
  return inside(key(a), key(b)) || inside(key(b), key(a));
}
export function absoluteLocalPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    value.length > 4096 ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    Buffer.from(value).toString("utf8") !== value
  )
    throw new AppError(
      400,
      "Enter an absolute local folder path without shell quoting.",
    );
  // Refuse protected data before any filesystem lookup. No shell expansion.
  if (
    value
      .split(path.sep)
      .some((s) => s === ".." || s.toLowerCase() === "holdout")
  )
    throw new AppError(
      400,
      "Parent and protected folder paths cannot be opened.",
    );
  return path.resolve(value);
}
export function captureDirectory(value: unknown): DirectoryIdentity {
  const requested = absoluteLocalPath(value);
  try {
    const entered = fs.lstatSync(requested, { bigint: true });
    if (!entered.isDirectory() || entered.isSymbolicLink())
      throw new AppError(
        400,
        "Choose a plain folder, not a symlink or a special file.",
      );
    const canonical = absoluteLocalPath(fs.realpathSync.native(requested)),
      s = fs.lstatSync(canonical, { bigint: true });
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      entered.dev !== s.dev ||
      entered.ino !== s.ino
    )
      throw new AppError(
        409,
        "The folder changed while opening. Review it again.",
      );
    return {
      path: canonical,
      device: s.dev.toString(),
      inode: s.ino.toString(),
      birthtime: s.birthtimeNs.toString(),
    };
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      409,
      `The folder cannot be opened safely (${typeof e.code === "string" ? e.code : "unavailable"}). No source files were changed.`,
    );
  }
}
function valid(value: DirectoryIdentity) {
  return (
    value &&
    absoluteLocalPath(value.path) === value.path &&
    [value.device, value.inode, value.birthtime].every(
      (x) => typeof x === "string" && integer.test(x),
    )
  );
}
/** Persisted authorization for one ordinary directory, never a fallback materialization path. */
export class ProjectDirectories {
  constructor(
    private db: DatabaseSync,
    private dataRoot: string,
  ) {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS project_directories(project TEXT PRIMARY KEY,path TEXT NOT NULL,device TEXT NOT NULL,inode TEXT NOT NULL,birthtime TEXT NOT NULL,UNIQUE(device,inode,birthtime))",
    );
  }
  binding(id: string): LinkedDirectory | undefined {
    return this.db
      .prepare("SELECT * FROM project_directories WHERE project=?")
      .get(id) as LinkedDirectory | undefined;
  }
  check(value: DirectoryIdentity): string {
    try {
      if (!valid(value)) throw Error("Invalid folder identity");
      const actual = captureDirectory(value.path);
      if (
        actual.path !== value.path ||
        actual.device !== value.device ||
        actual.inode !== value.inode ||
        actual.birthtime !== value.birthtime
      )
        throw Error("Folder identity changed");
      return actual.path;
    } catch {
      throw new DiskConflict(
        "Project",
        "the opened local folder is missing, moved, replaced, symlinked or unreadable; reopen the original folder before writing",
      );
    }
  }
  directory(id: string): string {
    const linked = this.binding(id);
    return linked
      ? this.check(linked)
      : path.join(this.dataRoot, "projects", id, "files");
  }
  existing(value: DirectoryIdentity): string | undefined {
    this.check(value);
    return (
      this.db
        .prepare(
          "SELECT project FROM project_directories WHERE device=? AND inode=? AND birthtime=?",
        )
        .get(value.device, value.inode, value.birthtime) as
        { project: string } | undefined
    )?.project;
  }
  containing(directory: string) {
    for (const binding of this.db
      .prepare("SELECT * FROM project_directories")
      .all() as unknown as LinkedDirectory[]) {
      const relative = path.relative(binding.path, directory);
      if (
        relative === "" ||
        relative === ".." ||
        relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative)
      )
        continue;
      try {
        this.check(binding);
        return binding;
      } catch {}
    }
  }
  validateNew(value: DirectoryIdentity, id?: string) {
    const selected = this.check(value),
      data = fs.realpathSync.native(this.dataRoot);
    if (directoryPathsOverlap(selected, data))
      throw new AppError(
        400,
        "Choose a source folder separate from Leaf’s application data.",
      );
    const existing = this.existing(value);
    if (existing && existing !== id)
      throw new AppError(
        409,
        "This local folder is already open in another project. Open that project instead.",
      );
    for (const other of this.db
      .prepare("SELECT * FROM project_directories WHERE project<>?")
      .all(id ?? "") as unknown as LinkedDirectory[]) {
      let available = false;
      try {
        this.check(other);
        available = true;
      } catch {}
      if (available && directoryPathsOverlap(selected, other.path))
        throw new AppError(
          409,
          "This folder overlaps another opened local project. Use that project or choose a separate folder.",
        );
    }
  }
  bind(id: string, value: DirectoryIdentity) {
    this.validateNew(value, id);
    this.db
      .prepare("INSERT INTO project_directories VALUES(?,?,?,?,?)")
      .run(id, value.path, value.device, value.inode, value.birthtime);
  }
  relocate(id: string, value: DirectoryIdentity) {
    const old = this.binding(id);
    if (
      !old ||
      old.device !== value.device ||
      old.inode !== value.inode ||
      old.birthtime !== value.birthtime
    )
      throw new AppError(
        409,
        "Choose the original local folder. A replacement folder cannot silently take over this project.",
      );
    this.validateNew(value, id);
    this.db
      .prepare("UPDATE project_directories SET path=? WHERE project=?")
      .run(value.path, id);
    this.directory(id);
  }
  assertWritable(id: string, name: string) {
    const linked = this.binding(id);
    if (!linked) return;
    const root = this.check(linked),
      target = within(root, name);
    let parent = path.dirname(target);
    while (parent !== root && !fs.existsSync(parent))
      parent = path.dirname(parent);
    // Only the selected folder's existing ancestors; never create them on inspection.
    if (parent !== root && !parent.startsWith(root + path.sep))
      throw new DiskConflict(
        name,
        "the write destination escapes the opened folder",
      );
    try {
      const existing = fs.lstatSync(parent);
      if (!existing.isDirectory() || existing.isSymbolicLink())
        throw Error("Unsafe parent");
      if (parent !== root)
        fs.accessSync(root, fs.constants.W_OK | fs.constants.X_OK);
      fs.accessSync(parent, fs.constants.W_OK | fs.constants.X_OK);
    } catch {
      throw new DiskConflict(
        name,
        "the local destination folder is read-only or not writable",
      );
    }
    this.check(linked);
  }
  describe(id: string) {
    const linked = this.binding(id);
    if (!linked) return undefined;
    try {
      this.check(linked);
      let writable = true;
      try {
        fs.accessSync(linked.path, fs.constants.W_OK | fs.constants.X_OK);
      } catch {
        writable = false;
      }
      return {
        kind: "linked" as const,
        folder: linked.path,
        available: true,
        writable,
      };
    } catch {
      return {
        kind: "linked" as const,
        folder: typeof linked.path === "string" ? linked.path : "",
        available: false,
        writable: false,
      };
    }
  }
  /** The legacy full-tree swap is not allowed to rename a user-selected root. */
  assertManagedTree(id: string) {
    if (this.binding(id))
      throw new AppError(
        409,
        "This operation still requires managed project storage. The opened local folder was not changed.",
      );
  }
}
