import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  AppError,
  findRoots,
  safePath,
  within,
  type ImportedFile,
} from "./files";
import { absoluteLocalPath, captureDirectory } from "./project-directories";
import type { DiskDiscovery } from "./disk-discovery";
import type { Store } from "./store";
import type {
  LocalOpenResult,
  LocalOpenReview,
} from "../shared/local-projects";

type Input = {
  path?: unknown;
  mode?: unknown;
  token?: unknown;
  main?: unknown;
  projectId?: unknown;
};

export class LocalProjects {
  constructor(
    private store: Store,
    private discovery: DiskDiscovery,
  ) {}

  private inspect(input: Input) {
    if (input.mode !== "file" && input.mode !== "folder")
      throw new AppError(400, "Choose a local folder or a .tex file.");
    const value = absoluteLocalPath(input.path);
    let file =
      input.mode === "file" ? safePath(path.basename(value)) : undefined;
    if (file && !file.endsWith(".tex"))
      throw new AppError(400, "Choose an existing .tex file.");
    let folder = captureDirectory(file ? path.dirname(value) : value);
    const parent = file
      ? this.store.directories.containing(folder.path)
      : undefined;
    if (parent && file) {
      file = safePath(path.relative(parent.path, path.join(folder.path, file)));
      folder = parent;
    }

    const id = this.store.directories.existing(folder);
    if (input.projectId !== undefined && input.projectId !== id)
      throw new AppError(409, "Choose the original folder for this project.");
    if (id) {
      const existing = this.store.project(id, true),
        relink = existing.storage!.folder !== folder.path;
      if (
        file &&
        !existing.files.some(
          (f) => f.path === file && !f.deleted && f.kind === "text",
        )
      )
        throw new AppError(
          409,
          "Open the existing project and use Check disk files to review this file.",
        );
      if (file) {
        const source = this.store.directories.check(folder);
        const entry = fs.lstatSync(within(source, file), {
          throwIfNoEntry: false,
        });
        if (!entry?.isFile() || entry.nlink !== 1)
          throw new AppError(
            404,
            "This .tex file is missing or cannot be opened safely.",
          );
      }
      if (relink) this.store.directories.validateNew(folder, id);
      const token = this.token([
        folder,
        existing.id,
        existing.generation,
        existing.deletedAt,
        file,
        relink,
      ]);
      const view: LocalOpenReview = {
        folder: folder.path,
        token,
        file,
        action: relink ? "relink" : existing.deletedAt ? "restore" : "open",
        name: existing.name,
        main: existing.root,
        texFiles: [],
        files: [],
        skipped: [],
      };
      return { view, folder, existing };
    }

    const { view: captured, entries } = this.discovery.captureFolder(folder);
    const files: ImportedFile[] = entries.map((entry) => ({
      path: entry.path,
      data: entry.actual.bytes ?? Buffer.alloc(0),
      directory: entry.actual.kind === "directory",
    }));
    const texFiles = captured.added
      .filter((f) => f.kind === "text" && f.path.endsWith(".tex"))
      .map((f) => f.path);
    if (file && !texFiles.includes(file))
      throw new AppError(
        404,
        "This .tex file is missing or cannot be opened as editable text.",
      );
    const root = findRoots(files).find((candidate) =>
      texFiles.includes(candidate),
    );
    const view: LocalOpenReview = {
      folder: folder.path,
      token: this.token([captured.token, file]),
      file,
      action: "create",
      name: path.basename(folder.path),
      main: file ?? root ?? texFiles[0] ?? "",
      texFiles,
      files: captured.added,
      skipped: captured.skipped,
    };
    return { view, folder, files };
  }

  private token(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  preview(input: Input) {
    return this.inspect(input).view;
  }

  open(input: Input): LocalOpenResult {
    if (typeof input.token !== "string" || !/^[a-f0-9]{64}$/.test(input.token))
      throw new AppError(400, "Review the local project before opening it.");
    const { view, folder, existing, files } = this.inspect(input);
    if (input.token !== view.token)
      throw new AppError(
        409,
        "The folder changed since review. Check it again before opening.",
      );
    if (existing) {
      if (existing.deletedAt) this.store.trashProject(existing.id, true);
      if (view.action === "relink") {
        this.store.relocateDirectory(existing.id, existing.generation, folder);
        this.store.reconcileLinkedDirectory(existing.id);
      }
      return { project: this.store.project(existing.id), file: view.file };
    }
    const main = input.main ?? view.main;
    if (
      typeof main !== "string" ||
      (main !== "" && !view.texFiles.includes(main))
    )
      throw new AppError(400, "Choose a .tex file from the reviewed folder.");
    return {
      project: this.store.createLinked(view.name, folder, files!, main),
      file: view.file,
    };
  }

  retry(id: string, generation: unknown) {
    this.store.assertSourceOwner(id);
    if (!this.store.directories.binding(id))
      throw new AppError(
        404,
        "This project does not use a linked local folder.",
      );
    if (this.store.requireProject(id).generation !== generation)
      throw new AppError(
        409,
        "The project changed. Reopen it before retrying.",
      );
    if (this.store.project(id).storage?.recovery) this.store.reconcileDisk(id);
    return this.store.project(id);
  }
}
