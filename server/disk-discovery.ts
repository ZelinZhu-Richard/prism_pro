import fs from "node:fs";
import { createHash } from "node:crypto";
import type { Store } from "./store";
import { AppError, safePath, within, kindOf, validateTree } from "./files";
import {
  sameDisk,
  rowMark,
  DiskFiles,
  DISK_FILE_BYTES,
  DISK_RECOVERY_BYTES,
  type DiskEntry,
} from "./disk-files";
import type { DirectoryIdentity } from "./project-directories";
import type {
  DiskDiscoveryView,
  DiskImportRequest,
} from "../shared/disk-discovery";
export interface CapturedDiskFile {
  path: string;
  actual: DiskEntry;
}
class ScanChanged extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}
const folded = (s: string) => s.normalize("NFC").toLowerCase();
export function discoveredKind(
  name: string,
  actual: DiskEntry,
): "text" | "binary" | "directory" {
  if (actual.kind === "directory") return "directory";
  const bytes = actual.bytes!;
  return bytes.length <= 2 * 1024 * 1024 &&
    kindOf(name, bytes) === "text" &&
    Buffer.from(bytes.toString("utf8")).equals(bytes)
    ? "text"
    : "binary";
}
export class DiskDiscovery {
  constructor(private store: Store) {}
  private inspect(id: string, folder?: DirectoryIdentity) {
    if (!folder && this.store.directories.binding(id))
      this.store.assertDiskAvailable(id);
    const generation = folder ? 0 : this.store.requireProject(id).generation,
      disk = folder
        ? new DiskFiles(this.store.db, () => this.store.directories.check(folder))
        : this.store.disk,
      root = disk.root(id),
      rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink())
      throw new AppError(
        409,
        "Project files are unavailable. Restore the managed folder before checking disk files.",
      );
    const indexed = folder ? [] : this.store.fileList(id),
      byName = new Map(
        [...indexed]
          .sort((a, b) => Number(b.deleted) - Number(a.deleted))
          .map((f) => [folded(f.path), f]),
      ),
      observed = new Map<string, DiskEntry>(),
      spelling = new Map<string, string>(),
      entries: CapturedDiskFile[] = [],
      manifest: any[] = [],
      view: DiskDiscoveryView = {
        projectId: id,
        generation,
        folder: root,
        token: "",
        added: [],
        changed: [],
        skipped: [],
        scanned: 0,
        bytes: 0,
      };
    for (const file of [...indexed].sort(
      (a, b) => Number(a.deleted) - Number(b.deleted),
    )) {
      const parts = file.path.split("/");
      for (let n = 1; n <= parts.length; n++) {
        const name = parts.slice(0, n).join("/");
        if (!spelling.has(folded(name))) spelling.set(folded(name), name);
      }
    }
    const skip = (name: string, reason: string) => {
      if (view.skipped.length < 100) view.skipped.push({ path: name, reason });
      else
        throw new AppError(
          413,
          "More than 100 disk entries were skipped. Correct unsupported paths before checking again.",
        );
    };
    const inspect = (name: string) => {
      const target = within(disk.root(id), name),
        stat = fs.lstatSync(target, { throwIfNoEntry: false });
      if (!stat)
        throw new AppError(
          409,
          "Disk files changed while being checked. Check again; no files were changed.",
        );
      if (
        (!stat.isFile() && !stat.isDirectory()) ||
        stat.isSymbolicLink() ||
        (stat.isFile() && stat.nlink !== 1)
      )
        throw new AppError(
          409,
          "Only plain directories and regular single-link files are supported.",
        );
      if (stat.size > DISK_FILE_BYTES && stat.isFile())
        throw new AppError(413, "File exceeds 100 MiB.");
      if (stat.isFile()) {
        view.bytes += stat.size;
        if (view.bytes > DISK_RECOVERY_BYTES)
          throw new AppError(
            413,
            "Checking disk files is limited to 128 MiB per project.",
          );
      }
      const actual = disk.inspect(id, name);
      if (
        (actual.kind === "directory") !== stat.isDirectory() ||
        actual.kind === "missing"
      )
        throw new ScanChanged(
          "A disk entry changed type while checking. Check again.",
        );
      return { stat, actual };
    };
    const visit = (relative: string, depth: number) => {
      if (depth > 64)
        throw new AppError(413, "Disk folder nesting exceeds 64 levels.");
      const target = relative
          ? within(disk.root(id), relative)
          : disk.root(id),
        before = fs.lstatSync(target);
      if (!before.isDirectory() || before.isSymbolicLink())
        throw new ScanChanged("A disk folder changed type. Check again.");
      const dir = fs.opendirSync(target);
      let count = 0;
      try {
        // Recheck the visible path before reading any entries from its open handle.
        const openedPath = relative
            ? within(disk.root(id), relative)
            : disk.root(id),
          current = fs.lstatSync(openedPath);
        if (
          current.ino !== before.ino ||
          current.dev !== before.dev ||
          !current.isDirectory()
        )
          throw new ScanChanged(
            "A disk folder changed while opening. Check again.",
          );
        for (let child; (child = dir.readSync());) {
          count++;
          if (++view.scanned > 10000)
            throw new AppError(
              413,
              "Checking disk files is limited to 10,000 entries.",
            );
          const name = relative ? relative + "/" + child.name : child.name;
          // Do not stat, open or traverse hidden/protected sibling data.
          if (
            child.name.startsWith(".") ||
            child.name.toLowerCase() === "holdout"
          ) {
            skip(
              relative || "Project",
              "Hidden/protected entry left untouched",
            );
            continue;
          }
          try {
            safePath(name);
          } catch {
            skip(name, "Unsupported project path; left untouched");
            continue;
          }
          if (
            /\.[a-f0-9-]{36}\.prism-tmp$/.test(child.name) &&
            !byName.has(folded(name))
          ) {
            skip(name, "Leaf staging file left untouched");
            continue;
          }
          const expected = spelling.get(folded(name));
          if (expected && expected !== name) {
            skip(
              name,
              "Path spelling collides with an indexed path; review its existing file versions",
            );
            continue;
          }
          try {
            const { stat, actual } = inspect(name),
              old = byName.get(folded(name));
            manifest.push([name, actual.kind, actual.hash]);
            if (old)
              observed.set(old.path, { kind: actual.kind, hash: actual.hash });
            if (old && old.path !== name) {
              skip(
                name,
                "Path spelling collides with an indexed path; review its existing file versions",
              );
            } else if (!old && actual.kind === "file")
              entries.push({ path: name, actual });
            if (stat.isDirectory()) {
              const children = visit(name, depth + 1);
              if (!old && children === 0) entries.push({ path: name, actual });
            }
          } catch (e) {
            if ((e as any).statusCode === 413 || e instanceof ScanChanged)
              throw e;
            skip(
              name,
              (e as any).code
                ? "Cannot read safely (" + (e as any).code + ")"
                : (e as Error).message,
            );
          }
        }
      } finally {
        dir.closeSync();
      }
      const after = fs.lstatSync(
        relative ? within(disk.root(id), relative) : disk.root(id),
      );
      if (
        after.ino !== before.ino ||
        after.dev !== before.dev ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      )
        throw new ScanChanged(
          "Disk folder entries changed while checking. Check again; nothing was imported.",
        );
      return count;
    };
    visit("", 0);
    // Indexed paths include external deletions and recoverable Trash entries.
    for (const file of indexed) {
      try {
        const actual =
            observed.get(file.path) ?? disk.inspect(id, file.path),
          row = this.store.db
            .prepare(
              "SELECT kind,content,deleted,revision FROM files WHERE project=? AND path=?",
            )
            .get(id, file.path) as any;
        if (!row)
          throw new AppError(409, "Project index changed. Check again.");
        manifest.push([
          "indexed",
          file.path,
          file.revision,
          file.deleted,
          actual.kind,
          actual.hash,
        ]);
        if (!sameDisk(actual, rowMark(row)))
          view.changed.push({
            path: file.path,
            change:
              actual.kind === "missing"
                ? "deleted"
                : file.deleted
                  ? "restored"
                  : (row.kind === "directory") !== (actual.kind === "directory")
                    ? "type"
                    : "modified",
          });
      } catch (e) {
        skip(file.path, (e as Error).message);
      }
    }
    entries.sort((a, b) => a.path.localeCompare(b.path));
    view.added = entries.map((e) => ({
      path: e.path,
      kind: discoveredKind(e.path, e.actual),
      size: e.actual.bytes?.length ?? 0,
    }));
    validateTree([
      ...indexed
        .filter((f) => !f.deleted)
        .map((f) => ({
          path: f.path,
          directory: f.kind === "directory",
          data: Buffer.alloc(0),
        })),
      ...entries.map((e) => ({
        path: e.path,
        directory: e.actual.kind === "directory",
        data: Buffer.alloc(0),
      })),
    ]);
    if (!folder && this.store.requireProject(id).generation !== generation)
      throw new AppError(
        409,
        "Project source changed while checking disk files. Check again.",
      );
    manifest.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    view.token = createHash("sha256")
      .update(JSON.stringify([folder ?? id, generation, manifest, view.skipped]))
      .digest("hex");
    return { view, entries };
  }
  scan(id: string) {
    return this.inspect(id).view;
  }
  captureFolder(folder: DirectoryIdentity) {
    this.store.directories.validateNew(folder);
    return this.inspect("", folder);
  }
  apply(id: string, request: DiskImportRequest) {
    if (
      !request ||
      typeof request.requestId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(request.requestId) ||
      typeof request.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(request.token) ||
      !Array.isArray(request.paths) ||
      !request.paths.length ||
      request.paths.length > 1000
    )
      throw new AppError(
        400,
        "Review disk files and choose entries before importing.",
      );
    const paths = request.paths.map(safePath).sort();
    if (new Set(paths).size !== paths.length)
      throw new AppError(400, "Choose each disk entry once.");
    const signature = createHash("sha256")
      .update(JSON.stringify([id, request.token, paths]))
      .digest("hex");
    const receipt = this.store.db
      .prepare("SELECT project,signature FROM disk_imports WHERE request=?")
      .get(request.requestId) as any;
    if (receipt) {
      if (receipt.project !== id || receipt.signature !== signature)
        throw new AppError(
          409,
          "This disk import identifier belongs to another request.",
        );
      return {
        project: this.store.project(id),
        imported: paths,
        replayed: true,
      };
    }
    this.store.assertSourceOwner(id);
    const capture = this.inspect(id);
    if (capture.view.token !== request.token)
      throw new AppError(
        409,
        "Disk files or project source changed. Refresh the review; no files were imported.",
      );
    const entries = paths.map((name) =>
      capture.entries.find((e) => e.path === name),
    );
    if (entries.some((e) => !e))
      throw new AppError(
        409,
        "A chosen entry is no longer new. Refresh the review.",
      );
    return this.store.adoptDiscovered(id, {
      requestId: request.requestId,
      signature,
      generation: capture.view.generation,
      entries: entries as CapturedDiskFile[],
    });
  }
}
