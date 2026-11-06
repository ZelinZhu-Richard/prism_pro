import { isUtf8 } from "node:buffer";
import type { Store } from "./store";
import type { DiskObserver } from "./disk-status";
import {
  matchingProjectFiles,
  scanLatexFileReferences,
} from "./latex-references";
import type {
  ManuscriptPreflight,
  PreflightCategory,
} from "../shared/manuscript-preflight";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SOURCES = 200;
const MAX_FINDINGS = 200;
const MAX_PATH_CHECKS = 10000;
const sourceCommands = new Set(["input", "include", "subfile"]);
const categories = new Map<string, PreflightCategory>([
  ["input", "include"],
  ["include", "include"],
  ["subfile", "include"],
  ["includegraphics", "figure"],
  ["includepdf", "figure"],
  ["bibliography", "bibliography"],
  ["addbibresource", "bibliography"],
  ["verbatiminput", "dependency"],
  ["VerbatimInput", "dependency"],
  ["lstinputlisting", "dependency"],
]);
const installedCommands = new Set([
  "usepackage",
  "RequirePackage",
  "documentclass",
  "LoadClass",
  "bibliographystyle",
]);

export function manuscriptPreflight(
  store: Store,
  observer: DiskObserver,
  id: string,
): ManuscriptPreflight {
  const project = store.project(id);
  const result: ManuscriptPreflight = {
    projectId: id,
    generation: project.generation,
    root: project.root,
    checkedAt: Date.now(),
    disk: "unavailable",
    scanned: 0,
    findings: [],
    notes: [],
  };
  try {
    const status = observer.status(id, true);
    result.checkedAt = status.checkedAt;
    result.disk = status.changes.length ? "changed" : "current";
  } catch {
    result.notes.push(
      "Leaf could not confirm disk versions. Check the project folder and file availability.",
    );
  }
  if (!project.root) {
    result.notes.push("Choose a main document to check its source paths.");
    return result;
  }
  if (project.storage && !project.storage.available) return result;
  const files = new Map(
    project.files
      .filter((f) => !f.deleted && f.kind !== "directory")
      .map((file) => [file.path, file]),
  );
  const paths = new Set(files.keys());
  if (!paths.has(project.root)) {
    result.notes.push("The main document is missing from saved project files.");
    return result;
  }
  const queued = new Set([project.root]);
  const scans = new Map<string, ReturnType<typeof scanLatexFileReferences>>();
  const notes = new Set(result.notes);
  let bytes = 0,
    read = 0;
  for (const path of queued) {
    if (read++ >= MAX_SOURCES) {
      notes.add("Source checks stop after 200 TeX files.");
      break;
    }
    const file = files.get(path)!;
    if (file.size > MAX_BYTES - bytes) {
      notes.add("Source checks are limited to 4 MiB of saved TeX source.");
      continue;
    }
    const raw = store.file(id, path).content as Buffer;
    bytes += raw.length;
    if (!isUtf8(raw) || raw.includes(0)) {
      notes.add("Some included files could not be checked as UTF-8 source.");
      continue;
    }
    const scanned = scanLatexFileReferences({
      path,
      revision: file.revision,
      content: raw.toString("utf8"),
    });
    scans.set(path, scanned);
    if (scanned.unavailable)
      notes.add("Some files exceeded the literal path parser's limits.");
    if (scanned.warnings.length)
      notes.add(
        "Some commands or paths need manual inspection. Review the build log for their actual results.",
      );
    for (const ref of scanned.references) {
      if (!sourceCommands.has(ref.command) || ref.value.length > 512) continue;
      for (const target of matchingProjectFiles(
        ref.value,
        ref.extensions,
        paths,
      ))
        queued.add(target);
    }
  }
  const graphics = new Set<string>([""]);
  let uncertainGraphics = false;
  for (const scan of scans.values()) {
    uncertainGraphics ||= scan.dynamicGraphics;
    for (const directory of scan.graphics) {
      if (graphics.size >= 64 || directory.value.length > 512)
        uncertainGraphics = true;
      else graphics.add(directory.value);
    }
  }
  if (uncertainGraphics)
    notes.add("Some graphics paths require a build to resolve.");
  const graphicsPaths = [...graphics];
  result.scanned = scans.size;
  let checked = 0;
  scanFiles: for (const [path, scan] of scans) {
    for (const ref of scan.references) {
      const category =
        categories.get(ref.command) ??
        (installedCommands.has(ref.command) && ref.value.includes("/")
          ? "dependency"
          : undefined);
      if (!category || (ref.graphics && uncertainGraphics)) continue;
      if (checked++ >= MAX_PATH_CHECKS) {
        notes.add("Source checks stop after 10,000 literal paths.");
        break scanFiles;
      }
      if (ref.value.length > 512) {
        notes.add("Some paths exceed the literal filename check limit.");
        continue;
      }
      if (
        matchingProjectFiles(
          ref.value,
          ref.extensions,
          paths,
          ref.graphics ? graphicsPaths : undefined,
        ).length
      )
        continue;
      if (result.findings.length >= MAX_FINDINGS) {
        notes.add("Showing the first 200 source path findings.");
        break scanFiles;
      }
      result.findings.push({
        severity: "warning",
        category,
        path,
        line: ref.line,
        message: `\\${ref.command} references “${ref.value}”, which was not found in the saved project files.`,
      });
    }
  }
  result.notes = [...notes];
  return result;
}
