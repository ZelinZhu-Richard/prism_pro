import nspell from "nspell";
import { checkWriting } from "../shared/latex-checks";
import {
  dictionaryWord,
  spellingLanguage,
  wordKey,
  type SpellingLanguage,
} from "../shared/writing-checks";
import type { WritingRequest, WritingResponse } from "./writing-protocol";
const scope = globalThis as unknown as {
  onmessage:
    ((event: MessageEvent<WritingRequest & { id: number }>) => void) | null;
  postMessage: (message: WritingResponse) => void;
};
const bundles = new Map<SpellingLanguage, { aff: string; dic: string }>();
let cached: { key: string; spell: ReturnType<typeof nspell> } | undefined;
async function dictionary(language: SpellingLanguage, words: string[]) {
  if (!spellingLanguage(language))
    throw new Error("Choose English (US) or English (UK).");
  const key = JSON.stringify([language, words]);
  if (cached?.key === key) return cached.spell;
  let bundle = bundles.get(language);
  if (!bundle) {
    const [aff, dic] = await Promise.all(
      ["aff", "dic"].map(async (part) => {
        const response = await fetch(
          `/api/writing/dictionary/${language}/${part}`,
          { headers: { "X-Prism-Request": "1" }, credentials: "same-origin" },
        );
        if (!response.ok)
          throw new Error(
            "The local dictionary could not be loaded. Retry the checks.",
          );
        return response.text();
      }),
    );
    bundle = { aff, dic };
    bundles.set(language, bundle);
  }
  const spell = nspell(bundle.aff, bundle.dic);
  for (const word of words) spell.add(dictionaryWord(word));
  cached = { key, spell };
  return spell;
}
scope.onmessage = async ({ data }) => {
  try {
    let result: WritingResponse["result"];
    if (data.type === "analyze") {
      const { source, language, codeCheck, words, ignored } = data.input;
      const spell =
        language === "off" ? undefined : await dictionary(language, words);
      const accepted = new Set(words.map(wordKey));
      result = checkWriting(
        source,
        codeCheck,
        spell
          ? (word) =>
              accepted.has(wordKey(word)) ||
              spell.correct(word.replaceAll("’", "'"))
          : undefined,
        ignored,
      );
    } else {
      const word = dictionaryWord(data.word);
      // Hunspell suggestions grow quickly with input length. Bound this optional work.
      if (word.length > 32) result = [];
      else {
        const spell = await dictionary(data.language, data.words);
        result = [...new Set(spell.suggest(word.replaceAll("’", "'")))]
          .filter((s) => {
            try {
              return dictionaryWord(s) === s && !s.includes(".");
            } catch {
              return false;
            }
          })
          .slice(0, 8);
      }
    }
    scope.postMessage({ id: data.id, result });
  } catch (error) {
    scope.postMessage({
      id: data.id,
      error:
        error instanceof Error
          ? error.message
          : "Writing checks failed. Retry the checks.",
    });
  }
};
