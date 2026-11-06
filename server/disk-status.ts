import fs from "node:fs";
import type { Store } from "./store";
import { AppError } from "./files";
import { DISK_RECOVERY_BYTES, rowMark, sameDisk } from "./disk-files";
import type { DiskChange, DiskStatus } from "../shared/disk-status";

interface Observation {
  row: string;
  physical: string;
  change?: DiskChange;
}
interface ProjectObservation {
  files: Map<string, Observation>;
  status: DiskStatus;
}
/** On-demand, read-only indexed-file observations. No watcher, writes or adoption. */
export class DiskObserver {
  private projects = new Map<string, ProjectObservation>();
  constructor(
    private store: Store,
    private now = Date.now,
  ) {}
  status(id: string, refresh = false): DiskStatus {
    if (this.store.directories.binding(id)) this.store.assertDiskAvailable(id);
    const project = this.store.requireProject(id),
      now = this.now(),
      previous = this.projects.get(id);
    if (
      !refresh &&
      previous &&
      previous.status.generation === project.generation &&
      now >= previous.status.checkedAt &&
      now - previous.status.checkedAt < 2000
    )
      return previous.status;
    const root = this.store.disk.root(id),
      rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink())
      throw new AppError(
        409,
        "Disk checks are unavailable. Restore the managed project folder, then retry.",
      );
    const indexed = this.store.fileList(id);
    if (indexed.length > 10000)
      throw new AppError(
        413,
        "Live disk checks are limited to 10,000 indexed entries. Use explicit file-version review.",
      );
    const files = new Map<string, Observation>(),
      changes: DiskChange[] = [];
    let bytes = 0;
    for (const file of indexed) {
      const row = JSON.stringify([file.revision, file.kind, file.deleted]),
        old = previous?.files.get(file.path);
      try {
        const physical = this.store.disk.fingerprint(id, file.path);
        bytes += physical.size;
        if (bytes > DISK_RECOVERY_BYTES)
          throw new AppError(
            413,
            "Live disk checks are limited to 128 MiB. Use explicit file-version review.",
          );
        if (old?.row === row && old.physical === physical.key) {
          files.set(file.path, old);
          if (old.change) changes.push(old.change);
          continue;
        }
        const saved = this.store.db
            .prepare("SELECT * FROM files WHERE project=? AND path=?")
            .get(id, file.path) as any,
          actual = this.store.disk.inspect(id, file.path),
          after = this.store.disk.fingerprint(id, file.path);
        if (physical.key !== after.key)
          throw new AppError(409, "The disk file changed during its check.");
        const change: DiskChange | undefined = sameDisk(actual, rowMark(saved))
          ? undefined
          : {
              path: file.path,
              change:
                actual.kind === "missing"
                  ? "deleted"
                  : file.deleted
                    ? "restored"
                    : (file.kind === "directory") !==
                        (actual.kind === "directory")
                      ? "type"
                      : "modified",
            };
        files.set(file.path, { row, physical: after.key, change });
        if (change) changes.push(change);
      } catch (e) {
        if ((e as any).statusCode === 413) throw e;
        // Unsafe/unreadable paths remain visible, and are retried on the next scan.
        changes.push({ path: file.path, change: "unsafe" });
      }
    }
    const status: DiskStatus = {
      projectId: id,
      generation: project.generation,
      checkedAt: now,
      changes,
    };
    this.projects.delete(id);
    this.projects.set(id, { files, status });
    if (this.projects.size > 4)
      this.projects.delete(this.projects.keys().next().value!);
    return status;
  }
}
