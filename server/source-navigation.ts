import { createHash } from "node:crypto";
import type { Store } from "./store";
import { AppError, safePath } from "./files";
import {
  sourceOccurrences,
  SOURCE_LOCATION_LIMIT,
  validSourceSymbol,
  type SourceLocation,
  type SourceNavigationRequest,
  type SourceNavigationResult,
} from "../shared/source-navigation";

const PROJECT_BYTES = 16 * 1024 * 1024,
  PROJECT_OCCURRENCES = 50000;
interface IndexedSymbols {
  generation: number;
  locations: SourceLocation[];
  warnings: string[];
}
/** Read indexed source only. Observing disk changes remains a separate workflow. */
export class SourceNavigation {
  private cache = new Map<string, IndexedSymbols>();
  constructor(private store: Store) {}
  private locations(
    path: string,
    revision: number,
    content: string,
    unsaved = false,
  ) {
    const parsed = sourceOccurrences({ path, content }),
      hash = createHash("sha256").update(content).digest("hex");
    return {
      locations: parsed.occurrences.map((o) => ({
        ...o,
        path,
        revision,
        hash,
        ...(unsaved ? { unsaved: true } : {}),
      })),
      warnings: [
        ...parsed.warnings.map((w) => `${path}: ${w}`),
        ...(parsed.limited
          ? [
              `${path}: Some source locations are unavailable because scanning reached its limit.`,
            ]
          : []),
      ],
    };
  }
  private index(id: string): IndexedSymbols {
    const project = this.store.project(id),
      old = this.cache.get(id);
    if (old?.generation === project.generation) return old;
    if (project.files.length > 10000)
      throw new AppError(
        413,
        "Source navigation is limited to 10,000 indexed entries.",
      );
    const locations: SourceLocation[] = [],
      warnings: string[] = [];
    let bytes = 0;
    for (const file of project.files) {
      if (
        file.deleted ||
        file.kind !== "text" ||
        !/\.(?:tex|sty|cls|bib|bbl)$/i.test(file.path)
      )
        continue;
      if (file.size > 2 * 1024 * 1024 || bytes + file.size > PROJECT_BYTES) {
        if (warnings.length < 100)
          warnings.push(
            `${file.path}: Source exceeds the 2 MiB file or 16 MiB project navigation limit.`,
          );
        continue;
      }
      const row = this.store.file(id, file.path),
        raw = Buffer.from(row.content),
        content = raw.toString("utf8");
      if (!Buffer.from(content).equals(raw)) {
        if (warnings.length < 100)
          warnings.push(`${file.path}: Non-UTF-8 source was not indexed.`);
        continue;
      }
      bytes += raw.length;
      const result = this.locations(file.path, file.revision, content),
        remaining = PROJECT_OCCURRENCES - locations.length;
      locations.push(...result.locations.slice(0, remaining));
      warnings.push(
        ...result.warnings.slice(0, Math.max(0, 100 - warnings.length)),
      );
      if (locations.length === PROJECT_OCCURRENCES) {
        warnings.push(
          "Project navigation reached its 50,000-location limit. Some files or locations are unavailable.",
        );
        break;
      }
    }
    if (this.store.requireProject(id).generation !== project.generation)
      throw new AppError(
        409,
        "The project changed during navigation. Retry to refresh its source locations.",
      );
    const result = { generation: project.generation, locations, warnings };
    this.cache.delete(id);
    this.cache.set(id, result);
    if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
  find(id: string, request: SourceNavigationRequest): SourceNavigationResult {
    this.store.requireProject(id);
    if (
      !request ||
      !["definitions", "references"].includes(request.mode) ||
      !validSourceSymbol(request)
    )
      throw new AppError(
        400,
        "Choose a literal command, environment, label or citation name.",
      );
    let current: ReturnType<SourceNavigation["locations"]> | undefined;
    if (request.current !== undefined) {
      const overlay = request.current;
      if (
        !overlay ||
        typeof overlay.content !== "string" ||
        Buffer.byteLength(overlay.content) > 2 * 1024 * 1024 ||
        Buffer.from(overlay.content).toString("utf8") !== overlay.content ||
        !Number.isSafeInteger(overlay.revision) ||
        overlay.revision < 0
      )
        throw new AppError(
          400,
          "The active source must be valid UTF-8 text of at most 2 MiB with its revision.",
        );
      const name = safePath(overlay.path),
        file = this.store.file(id, name);
      if (file.kind !== "text" || !/\.(?:tex|sty|cls|bib|bbl)$/i.test(name))
        throw new AppError(
          400,
          "Choose an indexed LaTeX or bibliography text file.",
        );
      const saved = Buffer.from(file.content).toString("utf8");
      current = this.locations(
        name,
        overlay.revision,
        overlay.content,
        overlay.content !== saved || overlay.revision !== file.revision,
      );
      if (file.revision !== overlay.revision)
        current.warnings.push(
          "The active buffer and saved source have different revisions. Its visible text is used here; review file versions before editing.",
        );
    }
    const index = this.index(id),
      role = request.mode === "definitions" ? "definition" : "reference",
      matches = [
        ...index.locations.filter((l) => l.path !== request.current?.path),
        ...(current?.locations ?? []),
      ]
        .filter(
          (l) =>
            l.kind === request.kind &&
            l.name === request.name &&
            l.role === role,
        )
        .sort(
          (a, b) =>
            Number(b.unsaved ?? false) - Number(a.unsaved ?? false) ||
            a.path.localeCompare(b.path) ||
            a.from - b.from,
        ),
      warnings = [...index.warnings, ...(current?.warnings ?? [])];
    if (matches.length > SOURCE_LOCATION_LIMIT)
      warnings.push("Showing the first 2,000 matching locations.");
    return {
      projectId: id,
      generation: index.generation,
      mode: request.mode,
      kind: request.kind,
      name: request.name,
      total: matches.length,
      locations: matches.slice(0, SOURCE_LOCATION_LIMIT),
      warnings,
    };
  }
}
