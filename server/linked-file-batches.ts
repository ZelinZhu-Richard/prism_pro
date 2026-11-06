import fs from "node:fs";
import path from "node:path";
import {
  DiskConflict,
  rowMark,
  sameDisk,
  type DiskMark,
  type DiskRow,
} from "./disk-files";
import { within } from "./files";
import type { Store } from "./store";

const missing: DiskMark = { kind: "missing", hash: "" };
const directory: DiskMark = { kind: "directory", hash: "" };
type Transition = {
  path: string;
  before: DiskMark;
  revision: number | null;
  after: DiskRow;
};
type Step = {
  path: string;
  before: DiskMark;
  after: DiskMark;
  revision: number;
  directoryIdentity?: string;
};
type Plan = {
  version: 1;
  generation: number;
  steps: Step[];
};
type Pending = { payload: string };
const order = (a: Step, b: Step) =>
  a.path.length - b.path.length || a.path.localeCompare(b.path);

/** A linked root stays in place. Commit source/history and replay individual paths. */
export class LinkedFileBatches {
  constructor(private store: Store) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS linked_file_batches(project TEXT PRIMARY KEY,payload TEXT NOT NULL)",
    );
  }

  private pending(id: string) {
    return this.store.db
      .prepare("SELECT payload FROM linked_file_batches WHERE project=?")
      .get(id) as Pending | undefined;
  }

  hasPending(id: string) {
    return !!this.pending(id);
  }

  assertReady(id: string) {
    if (this.hasPending(id))
      throw new DiskConflict(
        "Project",
        "a local folder operation needs recovery",
      );
  }

  private stat(id: string, name: string) {
    try {
      return fs.lstatSync(within(this.store.projectDir(id), name), {
        bigint: true,
        throwIfNoEntry: false,
      });
    } catch (error: any) {
      if (error.code === "ENOTDIR") return undefined;
      if (error instanceof DiskConflict) throw error;
      throw new DiskConflict(name, "the local path cannot be inspected safely");
    }
  }

  private identity(id: string, name: string) {
    const entry = this.stat(id, name);
    return entry?.isDirectory()
      ? `${entry.dev}:${entry.ino}:${entry.birthtimeNs}`
      : undefined;
  }

  private matches(id: string, name: string, mark: DiskMark) {
    const entry = this.stat(id, name);
    if (mark.kind === "missing") return !entry;
    if (mark.kind === "directory") return !!entry?.isDirectory();
    return (
      !!entry?.isFile() && sameDisk(this.store.disk.inspect(id, name), mark)
    );
  }

  commit(
    id: string,
    generation: number,
    transitions: Transition[],
    implicitRemovals: string[],
    mutate: () => void,
  ) {
    this.store.transaction(() => {
      this.assertReady(id);
      if (this.store.requireProject(id).generation !== generation)
        throw new DiskConflict(
          "Project",
          "changed before the local folder operation",
        );
      const revision = this.store.db.prepare(
        "SELECT revision FROM files WHERE project=? AND path=?",
      );
      const steps = new Map<string, Step>();
      for (const item of transitions) {
        if ((revision.get(id, item.path)?.revision ?? null) !== item.revision)
          throw new DiskConflict(item.path, "the reviewed revision changed");
        steps.set(item.path, {
          path: item.path,
          before: item.before,
          after: rowMark(item.after),
          revision: item.after.revision,
        });
      }
      for (const folder of implicitRemovals)
        if (!steps.has(folder))
          steps.set(folder, {
            path: folder,
            before: directory,
            after: missing,
            revision: -1,
          });
      for (const step of steps.values()) {
        if (step.after.kind === "missing") continue;
        let parent = path.posix.dirname(step.path);
        while (parent !== ".") {
          const planned = steps.get(parent);
          if (planned) {
            if (planned.after.kind !== "directory")
              throw new DiskConflict(
                parent,
                "an operation destination needs a directory",
              );
            break;
          }
          const entry = this.stat(id, parent);
          if (entry?.isDirectory()) break;
          if (entry)
            throw new DiskConflict(parent, "a destination parent is occupied");
          steps.set(parent, {
            path: parent,
            before: missing,
            after: directory,
            revision: -1,
          });
          parent = path.posix.dirname(parent);
        }
      }
      const sorted = [...steps.values()].sort(order);
      if (sorted.length > 10000)
        throw new DiskConflict(
          "Project",
          "the local operation exceeds 10,000 paths",
        );
      for (const step of sorted) {
        if (!this.matches(id, step.path, step.before))
          throw new DiskConflict(step.path);
        if (!sameDisk(step.before, step.after)) {
          this.store.directories.assertWritable(id, step.path);
          if (step.before.kind === "directory") {
            step.directoryIdentity = this.identity(id, step.path);
            if (!step.directoryIdentity) throw new DiskConflict(step.path);
          }
        }
      }
      const plan: Plan = {
        version: 1,
        generation: -1,
        steps: [
          ...sorted.filter((step) => step.after.kind === "missing").reverse(),
          ...sorted.filter((step) => step.after.kind !== "missing"),
        ],
      };
      mutate();
      plan.generation = this.store.requireProject(id).generation;
      this.store.db
        .prepare("INSERT INTO linked_file_batches VALUES(?,?)")
        .run(id, JSON.stringify(plan));
    });
    this.recover(id);
  }

  recover(id: string) {
    if (!this.pending(id)) return;
    // Replays for separate local server processes must not interleave. Source
    // and the intent are already committed. A crash here rolls back receipts,
    // and matching paths can be recognized by their final state on restart.
    this.store.transaction(() => this.replay(id));
  }

  private replay(id: string) {
    const pending = this.pending(id);
    if (!pending) return;
    this.store.projectDir(id);
    let plan: Plan;
    try {
      plan = JSON.parse(pending.payload);
    } catch {
      throw new DiskConflict(
        "Project",
        "local folder operation metadata is unreadable",
      );
    }
    if (
      plan?.version !== 1 ||
      !Array.isArray(plan.steps) ||
      plan.generation !== this.store.requireProject(id).generation
    )
      throw new DiskConflict(
        "Project",
        "local folder operation metadata changed",
      );
    const find = this.store.db.prepare(
      "SELECT kind,content,deleted,revision FROM files WHERE project=? AND path=?",
    );
    const rows = plan.steps.map((step): DiskRow => {
      const row =
        step.revision >= 0
          ? (find.get(id, step.path) as unknown as DiskRow | undefined)
          : {
              kind: "directory",
              content: Buffer.alloc(0),
              deleted: step.after.kind === "missing",
              revision: -1,
            };
      if (
        !row ||
        row.revision !== step.revision ||
        !sameDisk(rowMark(row), step.after)
      )
        throw new DiskConflict(
          step.path,
          "local folder operation source changed",
        );
      return row;
    });
    const assertBefore = (step: Step) => {
      if (
        !this.matches(id, step.path, step.before) ||
        (step.directoryIdentity &&
          this.identity(id, step.path) !== step.directoryIdentity)
      )
        throw new DiskConflict(
          step.path,
          "changed during local folder operation recovery",
        );
    };
    for (const step of plan.steps)
      if (!this.matches(id, step.path, step.after)) assertBefore(step);
    for (const [i, step] of plan.steps.entries()) {
      if (!this.matches(id, step.path, step.after)) {
        assertBefore(step);
        this.store.disk.write(id, step.path, rows[i], step.before);
      } else if (step.revision >= 0) {
        this.store.disk.acknowledge(id, step.path, step.after, step.revision);
      }
    }
    for (const step of plan.steps)
      if (!this.matches(id, step.path, step.after))
        throw new DiskConflict(
          step.path,
          "changed during local folder operation recovery",
        );
    this.store.db
      .prepare("DELETE FROM linked_file_batches WHERE project=?")
      .run(id);
  }
}
