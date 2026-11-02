import { Store } from "./store";
import {
  indexSources,
  type ProjectIntelligence,
  type SourceText,
} from "../shared/project-intelligence";
export class Intelligence {
  private cache = new Map<string, ProjectIntelligence>();
  constructor(private store: Store) {}
  get(id: string) {
    const project = this.store.project(id),
      cached = this.cache.get(id);
    if (cached?.generation === project.generation) return cached;
    const sources: SourceText[] = [],
      warnings: string[] = [];
    let bytes = 0;
    for (const file of project.files.filter(
      (f) =>
        !f.deleted &&
        f.kind === "text" &&
        /\.(tex|bib|bbl|sty|cls)$/i.test(f.path),
    )) {
      if (bytes + file.size > 16 * 1024 * 1024) {
        warnings.push(
          "Reference index reached its 16 MB source limit. Some files are not indexed.",
        );
        continue;
      }
      bytes += file.size;
      sources.push({
        path: file.path,
        content: this.store.readText(id, file.path).content,
      });
    }
    const result = indexSources(sources, project.generation);
    result.warnings.push(...warnings);
    this.cache.delete(id);
    this.cache.set(id, result);
    if (this.cache.size > 16)
      this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
}
