import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { Store } from "./store";
import { AppError, safePath, within } from "./files";
import type {
  SearchOptions,
  SearchResult,
  ReplacementFile,
  ReplacementPreview,
} from "../shared/search";
type RecordData = Omit<ReplacementPreview, "files"> & {
  files: (ReplacementFile & { matches?: unknown })[];
};
export class ProjectSearch {
  private workers = new Set<Worker>();
  private closed = false;
  constructor(
    private store: Store,
    private timeout = 2000,
  ) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS replacements(id TEXT PRIMARY KEY,project TEXT,state TEXT,created TEXT,payload TEXT)",
    );
  }
  options(body: any): SearchOptions {
    if (
      !body ||
      typeof body.query !== "string" ||
      !body.query ||
      body.query.length > 2000
    )
      throw new AppError(400, "Enter a search query of 1–2,000 characters.");
    for (const key of ["include", "exclude"])
      if (
        body[key] !== undefined &&
        (typeof body[key] !== "string" ||
          body[key].length > 500 ||
          body[key].split(",").length > 10)
      )
        throw new AppError(
          400,
          "Use up to 10 file patterns, with at most 500 characters.",
        );
    return {
      query: body.query,
      regex: body.regex === true,
      caseSensitive: body.caseSensitive === true,
      wholeWord: body.wholeWord === true,
      include: body.include ?? "",
      exclude: body.exclude ?? "",
    };
  }
  private async execute(data: unknown): Promise<any> {
    if (this.closed)
      throw new AppError(503, "Project search is shutting down.");
    if (this.workers.size >= 2)
      throw new AppError(
        429,
        "Two project searches are already running. Try again shortly.",
      );
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./search-worker.mjs", import.meta.url),
        { workerData: data, resourceLimits: { maxOldGenerationSizeMb: 256 } },
      );
      this.workers.add(worker);
      let settled = false;
      const finish = (error?: Error, result?: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.workers.delete(worker);
        void worker.terminate();
        error ? reject(error) : resolve(result);
      };
      const timer = setTimeout(
        () =>
          finish(
            new AppError(
              422,
              "Search exceeded two seconds. Simplify the regular expression or narrow the included files.",
            ),
          ),
        this.timeout,
      );
      worker.once("message", (message) =>
        message.error
          ? finish(new AppError(422, message.error))
          : finish(undefined, message.result),
      );
      worker.once("error", () =>
        finish(
          new AppError(
            422,
            "Search exceeded its memory limit or could not run. Narrow the query and try again.",
          ),
        ),
      );
      worker.once("exit", () =>
        finish(new AppError(503, "Search was interrupted. Try again.")),
      );
    });
  }
  private async scan(
    id: string,
    options: SearchOptions,
    preview = false,
    replacement = "",
    expand = false,
  ) {
    const project = this.store.project(id),
      warnings: string[] = [];
    const candidates = project.files.filter(
      (f) => !f.deleted && f.kind === "text",
    );
    const { paths } = await this.execute({
      files: candidates,
      options,
      selectOnly: true,
    });
    if (this.store.project(id).generation !== project.generation)
      throw new AppError(
        409,
        "The project changed while searching. Search again for current results.",
      );
    const files: { path: string; revision: number; content: string }[] = [];
    let bytes = 0;
    for (const name of paths as string[]) {
      const file = candidates.find((f) => f.path === name)!;
      if (file.size > 2 * 1024 * 1024) {
        warnings.push(
          `${file.path}: skipped because it exceeds the 2 MB editable-file limit.`,
        );
        continue;
      }
      const source = this.store.file(id, file.path);
      if (!isUtf8(source.content)) {
        warnings.push(
          `${file.path}: skipped because it is not valid UTF-8. Its original bytes are preserved; convert the file explicitly before searching or replacing.`,
        );
        continue;
      }
      bytes += file.size;
      if (bytes > 32 * 1024 * 1024)
        throw new AppError(
          413,
          "The search scope exceeds 32 MB. Refine the included files or exclusions.",
        );
      files.push({
        path: file.path,
        revision: source.revision,
        content: source.content.toString("utf8"),
      });
    }
    const result = (await this.execute({
      files,
      options,
      preview,
      replacement,
      expand,
    })) as Omit<SearchResult, "files"> & {
      files: (ReplacementFile & { matches: any[] })[];
    };
    if (this.store.project(id).generation !== project.generation)
      throw new AppError(
        409,
        "The project changed while searching. Search again for current results.",
      );
    return { ...result, generation: project.generation, warnings };
  }
  search(id: string, body: unknown) {
    return this.scan(id, this.options(body));
  }
  async preview(id: string, body: any) {
    const options = this.options(body);
    if (
      typeof body.replacement !== "string" ||
      body.replacement.length > 200000
    )
      throw new AppError(
        400,
        "Replacement text must contain at most 200,000 characters.",
      );
    const result = await this.scan(
      id,
      options,
      true,
      body.replacement,
      body.expand === true,
    );
    if (this.closed)
      throw new AppError(503, "Project search is shutting down.");
    const record: RecordData = {
      id: randomUUID(),
      projectId: id,
      status: "pending",
      created: new Date().toISOString(),
      options,
      replacement: body.replacement,
      expand: body.expand === true,
      total: result.files.reduce((n, f) => n + f.count, 0),
      files: result.files.map(({ matches, ...f }) => f),
      warnings: result.warnings,
    };
    this.store.db
      .prepare("DELETE FROM replacements WHERE state='pending' AND created<?")
      .run(new Date(Date.now() - 30 * 60000).toISOString());
    const pending = this.store.db
      .prepare(
        "SELECT id FROM replacements WHERE state='pending' ORDER BY created DESC LIMIT -1 OFFSET 15",
      )
      .all() as { id: string }[];
    for (const old of pending)
      this.store.db.prepare("DELETE FROM replacements WHERE id=?").run(old.id);
    this.save(record);
    return this.summary(record);
  }
  private save(record: RecordData) {
    this.store.db
      .prepare(
        "INSERT INTO replacements VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,payload=excluded.payload",
      )
      .run(
        record.id,
        record.projectId,
        record.status,
        record.created,
        JSON.stringify(record),
      );
  }
  private record(projectId: string, id: string) {
    this.store.requireProject(projectId);
    const row = this.store.db
      .prepare("SELECT payload FROM replacements WHERE id=? AND project=?")
      .get(id, projectId) as { payload: string } | undefined;
    if (!row)
      throw new AppError(
        404,
        "Replacement preview was not found. Generate a new preview.",
      );
    const record = JSON.parse(row.payload) as RecordData;
    if (
      record.status === "pending" &&
      Date.now() - Date.parse(record.created) > 30 * 60000
    )
      throw new AppError(
        409,
        "This preview expired. Generate a fresh preview before replacing.",
      );
    return record;
  }
  private summary(record: RecordData): ReplacementPreview {
    return {
      ...record,
      files: record.files.map(({ path, count, revision }) => ({
        path,
        count,
        revision,
      })),
    };
  }
  get(project: string, id: string) {
    return this.summary(this.record(project, id));
  }
  list(project: string) {
    this.store.requireProject(project);
    return (
      this.store.db
        .prepare(
          "SELECT payload FROM replacements WHERE project=? AND state!='pending' ORDER BY rowid DESC LIMIT 20",
        )
        .all(project) as { payload: string }[]
    ).map((r) => this.summary(JSON.parse(r.payload)));
  }
  file(project: string, id: string, path: string) {
    safePath(path);
    const file = this.record(project, id).files.find((f) => f.path === path);
    if (!file)
      throw new AppError(
        404,
        "This file is not part of the replacement preview.",
      );
    return file;
  }
  apply(project: string, id: string, paths: unknown, undo = false) {
    const record = this.record(project, id);
    if (record.status === (undo ? "undone" : "applied")) {
      this.store.unlocked(project);
      for (const name of record.selectedPaths ?? [])
        this.store.materializeFile(project, name);
      return this.summary(record);
    }
    if (record.status !== (undo ? "applied" : "pending"))
      throw new AppError(
        409,
        "This replacement is no longer available for that action.",
      );
    if (
      !undo &&
      (!Array.isArray(paths) ||
        !paths.length ||
        paths.some((p) => typeof p !== "string") ||
        new Set(paths).size !== paths.length)
    )
      throw new AppError(400, "Choose at least one distinct previewed file.");
    const selected = undo ? record.selectedPaths! : (paths as string[]);
    if (selected.some((p) => !record.files.some((f) => f.path === p)))
      throw new AppError(400, "Only previewed files can be selected.");
    const files = record.files.filter((f) => selected.includes(f.path));
    this.store.transaction(() => {
      this.store.unlocked(project);
      if (
        this.store
          .runs(project)
          .some((r) =>
            ["generating", "typing", "paused", "preview"].includes(r.status),
          )
      )
        throw new AppError(
          409,
          "Stop the active AI request before replacing project text.",
        );
      for (const file of files) {
        this.store.unlocked(project, file.path);
        within(this.store.projectDir(project), file.path);
        const current = this.store.readText(project, file.path);
        if (
          current.revision !== (undo ? file.appliedRevision : file.revision) ||
          !this.store
            .file(project, file.path)
            .content.equals(Buffer.from(undo ? file.after : file.before))
        )
          throw new AppError(
            409,
            `The file ${file.path} changed. ${undo ? "Undo was cancelled without changing any files." : "Generate a fresh preview."}`,
          );
        if (
          Buffer.byteLength(undo ? file.before : file.after) >
          2 * 1024 * 1024
        )
          throw new AppError(
            413,
            "Replacement exceeds the editable-file limit.",
          );
      }
      this.store.checkpoint(
        project,
        undo
          ? "Before undoing project replacement"
          : "Before project replacement",
        true,
      );
      for (const file of files) {
        const current = this.store.readText(project, file.path),
          revision = current.revision + 1;
        this.store.db
          .prepare(
            "INSERT INTO versions(project,path,revision,content,created) VALUES(?,?,?,?,?)",
          )
          .run(
            project,
            file.path,
            current.revision,
            Buffer.from(current.content),
            new Date().toISOString(),
          );
        this.store.insert(
          project,
          file.path,
          Buffer.from(undo ? file.before : file.after),
          "text",
          revision,
        );
        if (!undo) file.appliedRevision = revision;
      }
      this.store.touch(project);
      record.status = undo ? "undone" : "applied";
      record.selectedPaths = selected;
      this.save(record);
      this.store.checkpoint(
        project,
        undo ? "Project replacement undone" : "Project replacement",
        true,
      );
    });
    for (const file of files) this.store.materializeFile(project, file.path);
    return this.summary(record);
  }
  async close() {
    this.closed = true;
    await Promise.all([...this.workers].map((w) => w.terminate()));
  }
}
