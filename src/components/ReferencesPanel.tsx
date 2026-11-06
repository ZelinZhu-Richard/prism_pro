import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  searchCitations,
  type CitationEntry,
  type ProjectIntelligence,
} from "../../shared/project-intelligence";
import type { BibliographyUpdates } from "../../shared/bibliography-updates";
import { api } from "../api";

function ReferenceEntry({
  entry,
  actions,
}: {
  entry: CitationEntry;
  actions?: ReactNode;
}) {
  return (
    <article>
      <div className="reference-heading">
        <strong>{entry.key}</strong>
        <span>{entry.type}</span>
      </div>
      <p className="reference-title">
        {entry.title || "No title in the bibliography entry"}
      </p>
      <p className="field-help">
        {[entry.author, entry.year, entry.journal].filter(Boolean).join(" · ")}
      </p>
      {actions && <div className="reference-actions">{actions}</div>}
    </article>
  );
}

export function ReferencesPanel({
  projectId,
  generation,
  checkedAt,
  knownChanges,
  index,
  error,
  onRefresh,
  canInsert,
  onInsert,
  onOpen,
  onReview,
}: {
  projectId: string;
  generation: number;
  checkedAt?: number;
  knownChanges: ReadonlySet<string>;
  index?: ProjectIntelligence;
  error?: string;
  onRefresh: () => void;
  canInsert: boolean;
  onInsert: (key: string) => Promise<void>;
  onOpen: (path: string) => void;
  onReview: (path: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [updates, setUpdates] = useState<BibliographyUpdates>();
  const [diskError, setDiskError] = useState("");
  const [actionError, setActionError] = useState("");
  const [working, setWorking] = useState(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const readUpdates = useCallback(
    async (refresh = false) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      try {
        const result = await api<BibliographyUpdates>(
          `/projects/${projectId}/bibliography-updates${refresh ? "?refresh=1" : ""}`,
          "GET",
          undefined,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(5000),
            ]),
          },
        );
        if (controller.signal.aborted) return;
        if (result.projectId !== projectId || result.generation !== generation)
          throw Error(
            "Bibliography versions changed. Refresh references to check again.",
          );
        setUpdates(result);
        setDiskError("");
      } catch (e) {
        if (!controller.signal.aborted) setDiskError((e as Error).message);
      }
    },
    [projectId, generation],
  );
  useEffect(() => {
    void readUpdates();
    return () => request.current?.abort();
  }, [readUpdates, checkedAt]);
  async function act(action: () => Promise<void>) {
    if (working) return;
    setWorking(true);
    setActionError("");
    try {
      await action();
    } catch (e) {
      if (mounted.current) {
        setActionError((e as Error).message);
        void readUpdates(true);
      }
    } finally {
      if (mounted.current) setWorking(false);
    }
  }
  const observed = updates?.generation === generation ? updates : undefined;
  const files = new Map(observed?.files.map((file) => [file.path, file]));
  const pending = [...new Set([...knownChanges, ...files.keys()])];
  const saved = (index?.citations ?? []).filter(
    (entry) => !pending.includes(entry.path),
  );
  const entries = searchCitations(saved, query);
  return (
    <div className="references-panel">
      <p className="modal-intro">
        Search your project's citation keys, titles, authors, years, and
        journals. Choose a reference to insert it at the captured cursor or
        complete the current citation.
      </p>
      {(error || diskError || actionError) && (
        <p role="alert" className="history-error">
          {actionError || error || diskError}
        </p>
      )}
      <div className="reference-search-heading">
        <label htmlFor="reference-search">Search bibliography</label>
        <button
          className="subtle"
          onClick={() => {
            setActionError("");
            onRefresh();
            void readUpdates(true);
          }}
        >
          Refresh references
        </button>
      </div>
      <input
        id="reference-search"
        aria-label="Search bibliography"
        autoFocus
        placeholder="Author, title, year, journal, or key…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p role="status" className="field-help">
        {index
          ? `${entries.length} of ${saved.length} references`
          : error
            ? "Reference index unavailable"
            : "Loading project references…"}
      </p>
      {pending.length > 0 && (
        <section
          className="reference-updates"
          aria-label="Bibliography updates"
        >
          <h3>Bibliography updates</h3>
          <p className="field-help">
            Preview changed files below. Review their versions before using the
            updated citations.
          </p>
          <ul>
            {pending.slice(0, 32).map((path) => {
              const file = files.get(path);
              return (
                <li key={path}>
                  <code>{path}</code>
                  <button
                    disabled={working}
                    onClick={() => void act(() => onReview(path))}
                  >
                    Review {path}
                  </button>
                  <small>
                    {file?.message ??
                      (file?.kind === "deleted"
                        ? "Removed on disk"
                        : file?.kind === "updated"
                          ? `${file.total} citations in disk version`
                          : "Changed on disk")}
                  </small>
                </li>
              );
            })}
          </ul>
          {observed?.warnings.map((warning) => (
            <p className="field-help" key={warning}>
              {warning}
            </p>
          ))}
          <div
            className="reference-results"
            aria-label="Pending citation previews"
          >
            {searchCitations(
              [...files.values()].flatMap((file) => file.citations),
              query,
            )
              .slice(0, 200)
              .map((entry, index) => (
                <ReferenceEntry key={index} entry={entry} />
              ))}
          </div>
        </section>
      )}
      <div className="reference-results">
        {entries.slice(0, 200).map((entry) => (
          <ReferenceEntry
            key={entry.key}
            entry={entry}
            actions={
              <>
                <button onClick={() => onOpen(entry.path)}>
                  {entry.path}:{entry.line}
                </button>
                <button
                  disabled={
                    !canInsert ||
                    working ||
                    (/\.bib$/i.test(entry.path) && (!observed || !!diskError))
                  }
                  onClick={() => void act(() => onInsert(entry.key))}
                >
                  Insert citation
                </button>
              </>
            }
          />
        ))}
      </div>
      {entries.length > 200 && (
        <p className="field-help">
          Showing the first 200 results. Refine your search to find a specific
          reference.
        </p>
      )}
      {index && !entries.length && !pending.length && (
        <p className="field-help">
          {query
            ? "No matching references. Try another search term."
            : "Add a .bib file or a LaTeX bibliography to see references here."}
        </p>
      )}
      {!canInsert && (
        <p className="field-help">
          Open an editable source file to insert a citation.
        </p>
      )}
      {index?.warnings.map((warning, i) => (
        <p className="field-help" key={i}>
          {warning}
        </p>
      ))}
    </div>
  );
}
