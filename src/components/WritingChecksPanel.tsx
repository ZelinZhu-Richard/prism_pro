import { useEffect, useState, type KeyboardEvent } from "react";
import { api } from "../api";
import {
  spellingLanguages,
  dictionaryWord,
  type WritingSettings,
  type WritingIssue,
  type SpellingLanguage,
} from "../../shared/writing-checks";
import type { CheckedWriting } from "../use-writing-checks";
export function WritingChecksPanel({
  settings,
  projectId,
  path,
  source,
  eligible,
  excluded,
  result,
  status,
  locked,
  onSaved,
  onRetry,
  onIgnore,
  onSuggest,
  onReplace,
  onLocate,
  onAsk,
  initialIssue,
}: {
  settings: WritingSettings;
  projectId: string;
  path?: string;
  source?: string;
  eligible: boolean;
  excluded: boolean;
  result?: CheckedWriting;
  status: string;
  locked: boolean;
  onSaved: (settings: WritingSettings) => void;
  onRetry: () => void;
  onIgnore: (word: string) => void;
  onSuggest: (issue: WritingIssue, signal: AbortSignal) => Promise<string[]>;
  onReplace: (
    result: CheckedWriting,
    issue: WritingIssue,
    replacement: string,
  ) => Promise<void>;
  onLocate: (issue: WritingIssue) => void;
  onAsk: (issue: WritingIssue) => void;
  initialIssue?: string;
}) {
  const [tab, setTab] = useState<"issues" | "dictionary">("issues"),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(initialIssue ?? ""),
    [suggestions, setSuggestions] = useState<string[]>([]),
    [suggesting, setSuggesting] = useState(false),
    [dictionaryLanguage, setDictionaryLanguage] = useState<SpellingLanguage>(
      settings.language === "off" ? "en-US" : settings.language,
    ),
    [query, setQuery] = useState(""),
    [newWord, setNewWord] = useState(""),
    [filter, setFilter] = useState("all");
  const current =
      result?.source === source &&
      result?.path === path &&
      result?.projectId === projectId
        ? result
        : undefined,
    issue = current?.issues.find((i) => i.id === selected),
    language = settings.language,
    visible = (current?.issues ?? []).filter(
      (i) => filter === "all" || i.kind === filter,
    );
  useEffect(() => {
    setSuggestions([]);
    if (!issue?.word || !current || language === "off") return;
    const abort = new AbortController();
    let alive = true;
    setSuggesting(true);
    void onSuggest(issue, abort.signal)
      .then((values) => {
        if (alive) setSuggestions(values);
      })
      .catch((e) => {
        if (alive && e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (alive) setSuggesting(false);
      });
    return () => {
      alive = false;
      abort.abort();
    };
  }, [issue?.id, current?.source, language, JSON.stringify(settings.words)]);
  async function change(url: string, method: string, body: unknown) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      onSaved(await api<WritingSettings>(url, method, body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  function addWord(word: string, lang: SpellingLanguage) {
    void change("/settings/writing/words", "POST", {
      language: lang,
      word,
      action: "add",
    });
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "issues"
        : event.key === "End"
          ? "dictionary"
          : tab === "issues"
            ? "dictionary"
            : "issues";
    setTab(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#writing-${next}-tab`)
      ?.focus();
  }
  return (
    <div className="writing-panel">
      <p className="modal-intro">
        Check the active LaTeX file with bundled dictionaries and optional
        syntax hints. Everything runs locally; these checks do not use AI.
      </p>
      <div className="writing-options">
        <label className="field-label">
          Spelling dictionary
          <select
            className="text-input"
            value={language}
            disabled={pending}
            onChange={(e) =>
              void change("/settings/writing", "PUT", {
                language: e.target.value,
              })
            }
          >
            <option value="off">Off</option>
            {Object.entries(spellingLanguages).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="writing-toggle">
          <input
            type="checkbox"
            checked={settings.codeCheck}
            disabled={pending}
            onChange={(e) =>
              void change("/settings/writing", "PUT", {
                codeCheck: e.target.checked,
              })
            }
          />
          LaTeX checks
        </label>
      </div>
      <div className="writing-file">
        <span title={path}>{path ?? "No source file open"}</span>
        {eligible && (
          <label className="writing-toggle">
            <input
              type="checkbox"
              checked={excluded}
              disabled={pending}
              onChange={(e) =>
                void change(
                  `/projects/${projectId}/writing/exclusion`,
                  "POST",
                  { path, excluded: e.target.checked },
                )
              }
            />
            Exclude this file
          </label>
        )}
      </div>
      <p className="field-help">
        Preferences save automatically. Checks apply to the active file.
      </p>
      <div className="writing-tabs" role="tablist" aria-label="Writing tools">
        <button
          role="tab"
          tabIndex={tab === "issues" ? 0 : -1}
          onKeyDown={tabKey}
          aria-selected={tab === "issues"}
          aria-controls="writing-issues"
          id="writing-issues-tab"
          onClick={() => setTab("issues")}
        >
          Issues
        </button>
        <button
          role="tab"
          tabIndex={tab === "dictionary" ? 0 : -1}
          onKeyDown={tabKey}
          aria-selected={tab === "dictionary"}
          aria-controls="writing-dictionary"
          id="writing-dictionary-tab"
          onClick={() => setTab("dictionary")}
        >
          Personal dictionary
        </button>
      </div>
      {error && (
        <p role="alert" className="history-error">
          {error}
        </p>
      )}
      {tab === "issues" ? (
        <section
          role="tabpanel"
          aria-labelledby="writing-issues-tab"
          id="writing-issues"
        >
          <div className="writing-status">
            <p role="status">{status}</p>
            <button
              className="subtle"
              onClick={onRetry}
              disabled={!eligible || excluded || pending}
            >
              Retry checks
            </button>
            {!!current?.issues.length && (
              <label className="writing-filter">
                Show
                <select
                  className="text-input"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All issues</option>
                  <option value="spelling">Spelling</option>
                  <option value="syntax">LaTeX</option>
                </select>
              </label>
            )}
          </div>
          {current?.notice && <p className="field-help">{current.notice}</p>}
          <div className="writing-findings" aria-label="Writing issues">
            {visible.map((item) => (
              <div className="writing-finding" key={item.id}>
                <button
                  className="writing-finding-title"
                  aria-expanded={selected === item.id}
                  onClick={() => {
                    setSelected(selected === item.id ? "" : item.id);
                  }}
                >
                  <span>{item.message}</span>
                  <span>
                    Line{" "}
                    {current!.source.slice(0, item.from).split("\n").length} ·{" "}
                    {item.kind === "syntax" ? "LaTeX" : "Spelling"}
                  </span>
                </button>
                {selected === item.id && (
                  <div className="writing-finding-body">
                    <p className="writing-excerpt">
                      {current!.source.slice(
                        Math.max(0, item.from - 45),
                        item.from,
                      )}
                      <mark>{current!.source.slice(item.from, item.to)}</mark>
                      {current!.source.slice(item.to, item.to + 45)}
                    </p>
                    {item.word && (
                      <>
                        <p className="field-help">
                          {suggesting
                            ? "Finding local suggestions…"
                            : suggestions.length
                              ? "Replace with:"
                              : "No local suggestions. You can edit the source directly."}
                        </p>
                        <div className="writing-suggestions">
                          {suggestions.map((word) => (
                            <button
                              className="subtle"
                              key={word}
                              disabled={locked || pending}
                              onClick={async () => {
                                setPending(true);
                                setError("");
                                try {
                                  await onReplace(current!, item, word);
                                } catch (e) {
                                  setError((e as Error).message);
                                } finally {
                                  setPending(false);
                                }
                              }}
                            >
                              {word}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="writing-actions">
                      <button onClick={() => onLocate(item)}>
                        Show in source
                      </button>
                      {item.word && language !== "off" ? (
                        <>
                          <button
                            disabled={pending}
                            onClick={() => onIgnore(item.word!)}
                          >
                            Ignore for this session
                          </button>
                          <button
                            disabled={pending}
                            onClick={() => addWord(item.word!, language)}
                          >
                            Add to dictionary
                          </button>
                        </>
                      ) : (
                        <button disabled={locked} onClick={() => onAsk(item)}>
                          Ask AI…
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {locked && (
            <p className="field-help">
              Source changes are unavailable while an assistant or file
              operation is active.
            </p>
          )}
          <details className="writing-help">
            <summary>How local checks work</summary>
            <p className="field-help">
              LaTeX hints are heuristic and cannot expand custom commands;
              compile for authoritative errors. Math, citations, paths, code and
              unknown command arguments are skipped by spelling checks.
              Corrections use the editor's normal Undo. Ignore applies to this
              dictionary for this browser session. Checks support up to
              1,000,000 source characters and 50,000 prose words; at most 500
              findings are shown. Visual mode uses this list; inline markers
              appear in Code mode.
            </p>
          </details>
        </section>
      ) : (
        <section
          role="tabpanel"
          aria-labelledby="writing-dictionary-tab"
          id="writing-dictionary"
        >
          <label className="field-label">
            Dictionary to manage
            <select
              className="text-input"
              value={dictionaryLanguage}
              onChange={(e) =>
                setDictionaryLanguage(e.target.value as SpellingLanguage)
              }
            >
              {Object.entries(spellingLanguages).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <form
            className="writing-add"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const word = dictionaryWord(newWord);
                addWord(word, dictionaryLanguage);
                setNewWord("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label className="field-label">
              New word
              <input
                className="text-input"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                maxLength={80}
                placeholder="A name or technical term"
              />
            </label>
            <button className="subtle" disabled={pending || !newWord.trim()}>
              Add word
            </button>
          </form>
          <label className="field-label">
            Search saved words
            <input
              className="text-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a personal dictionary entry"
            />
          </label>
          <p className="field-help">
            {settings.words[dictionaryLanguage].length} saved words · stored
            locally across projects and restarts
          </p>
          <ul className="writing-word-list">
            {settings.words[dictionaryLanguage]
              .filter((w) =>
                w.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
              )
              .slice(0, 100)
              .map((word) => (
                <li key={word}>
                  <span>{word}</span>
                  <button
                    aria-label={`Remove ${word} from dictionary`}
                    disabled={pending}
                    onClick={() =>
                      void change("/settings/writing/words", "POST", {
                        language: dictionaryLanguage,
                        word,
                        action: "remove",
                      })
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
          </ul>
          <p className="field-help">
            Showing up to 100 matching words. Search to narrow a longer
            dictionary. English (UK) uses the bundled -ise variant. This is
            spelling and basic LaTeX checking; grammar services are separate.
          </p>
        </section>
      )}
    </div>
  );
}
