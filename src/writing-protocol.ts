import type { SpellingLanguage, WritingResult } from "../shared/writing-checks";
export interface WritingInput {
  source: string;
  language: SpellingLanguage | "off";
  codeCheck: boolean;
  words: string[];
  ignored: string[];
}
export type WritingRequest =
  | { type: "analyze"; input: WritingInput }
  | {
      type: "suggest";
      language: SpellingLanguage;
      words: string[];
      word: string;
    };
export type WritingResponse = {
  id: number;
  result?: WritingResult | string[];
  error?: string;
};
