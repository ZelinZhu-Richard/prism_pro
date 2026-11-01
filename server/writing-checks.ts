import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Store } from "./store";
import { AppError, safePath } from "./files";
import {
  writingSettings,
  writingPatch,
  dictionaryWord,
  spellingLanguage,
  wordKey,
  type WritingSettings,
} from "../shared/writing-checks";
export class WritingChecks {
  constructor(private store: Store) {}
  settings() {
    return writingSettings(this.store.setting("writing", {}));
  }
  private save(value: WritingSettings) {
    this.store.setSetting("writing", value);
    return value;
  }
  update(input: unknown) {
    try {
      return this.save({ ...this.settings(), ...writingPatch(input) });
    } catch (e) {
      throw new AppError(400, (e as Error).message);
    }
  }
  word(input: { language?: unknown; word?: unknown; action?: unknown }) {
    if (
      !spellingLanguage(input.language) ||
      !["add", "remove"].includes(String(input.action))
    )
      throw new AppError(400, "Choose a dictionary and word action.");
    let word: string;
    try {
      word = dictionaryWord(input.word);
    } catch (e) {
      throw new AppError(400, (e as Error).message);
    }
    const settings = this.settings(),
      list = settings.words[input.language],
      key = wordKey(word),
      existing = list.findIndex((w) => wordKey(w) === key);
    if (input.action === "remove") {
      if (existing >= 0) list.splice(existing, 1);
    } else if (existing < 0) {
      if (list.length >= 10000)
        throw new AppError(
          413,
          "A personal dictionary is limited to 10,000 words.",
        );
      list.push(word);
      list.sort((a, b) => a.localeCompare(b));
    }
    return this.save(settings);
  }
  exclude(projectId: string, input: { path?: unknown; excluded?: unknown }) {
    const name = safePath(input.path);
    if (
      !this.store
        .project(projectId)
        .files.some(
          (file) => file.path === name && !file.deleted && file.kind === "text",
        )
    )
      throw new AppError(
        404,
        "Open an existing text file to change its writing checks.",
      );
    if (typeof input.excluded !== "boolean")
      throw new AppError(400, "Choose whether to exclude this file.");
    const settings = this.settings();
    settings.excluded = settings.excluded.filter(
      (f) => f.projectId !== projectId || f.path !== name,
    );
    if (input.excluded) {
      if (settings.excluded.length >= 1000)
        throw new AppError(413, "At most 1,000 files can be excluded.");
      settings.excluded.push({ projectId, path: name });
    }
    return this.save(settings);
  }
  dictionary(language: unknown, part: unknown) {
    if (!spellingLanguage(language) || !["aff", "dic"].includes(String(part)))
      throw new AppError(404, "Dictionary not found.");
    return fs.readFileSync(
      fileURLToPath(
        new URL(
          `../vendor/dictionaries/${language}/index.${part}`,
          import.meta.url,
        ),
      ),
      "utf8",
    );
  }
}
