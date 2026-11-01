export const spellingLanguages = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
} as const;
export type SpellingLanguage = keyof typeof spellingLanguages;
export interface WritingSettings {
  language: SpellingLanguage | "off";
  codeCheck: boolean;
  words: Record<SpellingLanguage, string[]>;
  excluded: { projectId: string; path: string }[];
}
export interface WritingIssue {
  id: string;
  from: number;
  to: number;
  kind: "spelling" | "syntax";
  message: string;
  word?: string;
}
export interface WritingResult {
  issues: WritingIssue[];
  words: number;
  notice?: string;
}
export const WRITING_CHARACTERS = 1_000_000,
  WRITING_WORDS = 50_000,
  WRITING_ISSUES = 500;
export function spellingLanguage(value: unknown): value is SpellingLanguage {
  return typeof value === "string" && Object.hasOwn(spellingLanguages, value);
}
export function dictionaryWord(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter one word.");
  const word = value.trim().normalize("NFC");
  if (!word || word.length > 80 || !/^\p{L}[\p{L}\p{M}\p{N}'’.-]*$/u.test(word))
    throw new Error(
      "Use one word, up to 80 characters, without spaces or LaTeX commands.",
    );
  return word;
}
export const wordKey = (word: string) =>
  word.normalize("NFC").replaceAll("’", "'").toLocaleLowerCase("en-US");
export function writingSettings(value: unknown): WritingSettings {
  const result: WritingSettings = {
    language: "off",
    codeCheck: false,
    words: { "en-US": [], "en-GB": [] },
    excluded: [],
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  const v = value as Record<string, any>;
  if (spellingLanguage(v.language)) result.language = v.language;
  if (typeof v.codeCheck === "boolean") result.codeCheck = v.codeCheck;
  for (const language of Object.keys(spellingLanguages) as SpellingLanguage[]) {
    if (!Array.isArray(v.words?.[language])) continue;
    const seen = new Set<string>();
    for (const item of v.words[language].slice(0, 10000))
      try {
        const word = dictionaryWord(item),
          key = wordKey(word);
        if (!seen.has(key)) {
          seen.add(key);
          result.words[language].push(word);
        }
      } catch {
        /* Recover invalid old entries without accepting arbitrary markup. */
      }
  }
  if (Array.isArray(v.excluded))
    result.excluded = v.excluded
      .slice(0, 1000)
      .filter(
        (f: any) =>
          f &&
          typeof f.projectId === "string" &&
          f.projectId.length <= 80 &&
          typeof f.path === "string" &&
          f.path.length <= 500,
      )
      .map((f: any) => ({ projectId: f.projectId, path: f.path }));
  return result;
}
export function writingPatch(
  value: unknown,
): Partial<Pick<WritingSettings, "language" | "codeCheck">> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid writing preferences.");
  for (const [key, item] of Object.entries(value))
    if (
      !(key === "language" && (item === "off" || spellingLanguage(item))) &&
      !(key === "codeCheck" && typeof item === "boolean")
    )
      throw new Error("Invalid writing preference.");
  return value;
}
