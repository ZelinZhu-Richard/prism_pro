import { useEffect, useRef, useState } from "react";
import { WritingClient } from "./writing-client";
import {
  writingSettings,
  type WritingIssue,
  type WritingResult,
} from "../shared/writing-checks";
export type CheckedWriting = WritingResult & {
  source: string;
  path: string;
  projectId: string;
};
export function useWritingChecks(
  projectId: string | undefined,
  path: string | undefined,
  source: string | undefined,
  value: unknown,
  locked: boolean,
) {
  const client = useRef<WritingClient | null>(null);
  if (!client.current) client.current = new WritingClient();
  const settings = writingSettings(value),
    key = JSON.stringify(settings),
    [result, setResult] = useState<
      CheckedWriting & { settingsKey: string; ignoreKey: string }
    >(),
    [status, setStatus] = useState(""),
    [retry, setRetry] = useState(0),
    [ignored, setIgnored] = useState<Record<string, string[]>>({});
  const language = settings.language,
    ignore = ignored[language] ?? [],
    ignoreKey = JSON.stringify(ignore),
    eligible = !!path && /\.(tex|ltx)$/i.test(path),
    excluded = settings.excluded.some(
      (f) => f.projectId === projectId && f.path === path,
    ),
    enabled = settings.language !== "off" || settings.codeCheck;
  useEffect(() => {
    client.current?.reset();
    return () => client.current?.reset();
  }, [projectId]);
  useEffect(() => {
    setResult(undefined);
    if (!projectId || source === undefined || !eligible) {
      setStatus("Open a .tex or .ltx file to check its writing.");
      return;
    }
    if (!enabled) {
      setStatus("Choose a dictionary or enable LaTeX checks to begin.");
      return;
    }
    if (excluded) {
      setStatus("Checks are excluded for this file.");
      return;
    }
    if (locked) {
      setStatus(
        "Checks paused while the assistant or a file operation owns the source.",
      );
      return;
    }
    const abort = new AbortController();
    let current = true;
    setStatus("Checking locally…");
    const timer = setTimeout(() => {
      void client
        .current!.run<WritingResult>(
          {
            type: "analyze",
            input: {
              source,
              language: settings.language,
              codeCheck: settings.codeCheck,
              words:
                settings.language === "off"
                  ? []
                  : settings.words[settings.language],
              ignored: ignore,
            },
          },
          abort.signal,
        )
        .then((data) => {
          if (current) {
            setResult({
              ...data,
              source,
              path: path!,
              projectId,
              settingsKey: key,
              ignoreKey,
            });
            setStatus(
              data.issues.length
                ? `${data.issues.length} ${data.issues.length === 1 ? "issue" : "issues"} found locally`
                : "No issues found by the enabled checks.",
            );
          }
        })
        .catch((error) => {
          if (current && error.name !== "AbortError") setStatus(error.message);
        });
    }, 600);
    return () => {
      current = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [projectId, path, source, key, locked, retry, ignoreKey]);
  return {
    result:
      result?.settingsKey === key &&
      result?.ignoreKey === ignoreKey &&
      result?.projectId === projectId &&
      result?.path === path &&
      result?.source === source &&
      !locked &&
      !excluded
        ? result
        : undefined,
    status,
    eligible,
    excluded,
    enabled,
    retry: () => setRetry((n) => n + 1),
    ignore: (word: string) =>
      setIgnored((old) => ({
        ...old,
        [language]: [...(old[language] ?? []), word],
      })),
    suggest: (issue: WritingIssue, signal: AbortSignal) =>
      language === "off" || !issue.word
        ? Promise.resolve([])
        : client.current!.run<string[]>(
            {
              type: "suggest",
              language,
              words: settings.words[language],
              word: issue.word,
            },
            signal,
          ),
  };
}
