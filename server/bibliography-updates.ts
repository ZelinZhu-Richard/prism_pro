import { isUtf8 } from "node:buffer";
import type { Store } from "./store";
import type { DiskObserver } from "./disk-status";
import { rowMark, sameDisk } from "./disk-files";
import { parseBibtex } from "../shared/project-intelligence";
import type {
  BibliographyUpdate,
  BibliographyUpdates,
} from "../shared/bibliography-updates";

const MAX_FILES = 32;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_RESULTS = 500;
const excerpt = (value: string) =>
  value.slice(0, 400).replace(/[\uD800-\uDBFF]$/, "");

/** A read-only bibliography preview. Adoption goes through SourceRecovery. */
export function bibliographyUpdates(
  store: Store,
  observer: DiskObserver,
  projectId: string,
  refresh: boolean,
): BibliographyUpdates {
  const status = observer.status(projectId, refresh);
  const changes = status.changes.filter(({ path }) => /\.bib$/i.test(path));
  const indexed = new Map(
    store.fileList(projectId).map((file) => [file.path, file]),
  );
  const files: BibliographyUpdate[] = [],
    warnings: string[] = [];
  let bytes = 0,
    results = 0;
  for (const { path } of changes.slice(0, MAX_FILES)) {
    const saved = indexed.get(path);
    if (!saved) continue;
    const pending: BibliographyUpdate = {
      path,
      kind: "unavailable",
      citations: [],
      total: 0,
    };
    try {
      const actual = store.disk.inspect(
        projectId,
        path,
        Math.min(MAX_FILE, MAX_BYTES - bytes),
      );
      bytes += actual.bytes?.length ?? 0;
      if (saved.deleted && actual.kind === "missing") continue;
      if (
        !saved.deleted &&
        saved.kind === "directory" &&
        actual.kind === "directory"
      )
        continue;
      if (
        !saved.deleted &&
        saved.kind !== "directory" &&
        actual.bytes?.length === saved.size &&
        sameDisk(
          actual,
          rowMark({ ...saved, content: store.file(projectId, path).content }),
        )
      )
        continue;
      if (actual.kind === "missing") pending.kind = "deleted";
      else if (
        actual.kind === "file" &&
        actual.bytes &&
        isUtf8(actual.bytes) &&
        !actual.bytes.includes(0)
      ) {
        const notes: string[] = [];
        const entries = parseBibtex(
          { path, content: actual.bytes.toString("utf8") },
          notes,
        );
        pending.kind = "updated";
        pending.total = entries.length;
        pending.citations = entries
          .slice(0, MAX_RESULTS - results)
          .map((entry) => ({
            ...entry,
            title: excerpt(entry.title),
            author: excerpt(entry.author),
            year: excerpt(entry.year),
            journal: excerpt(entry.journal),
          }));
        results += pending.citations.length;
        if (notes.length) pending.message = notes[0];
        if (pending.citations.length < pending.total)
          warnings.push("Showing up to 500 citations from external updates.");
      } else
        pending.message =
          "The disk version is not an editable UTF-8 bibliography.";
    } catch {
      pending.message =
        "The disk version could not be previewed safely within the size limits.";
    }
    files.push(pending);
  }
  if (changes.length > MAX_FILES)
    warnings.push(
      "Showing the first 32 changed bibliography files. Use Check disk files for the rest.",
    );
  return {
    projectId,
    generation: status.generation,
    files,
    warnings: [...new Set(warnings)],
  };
}
