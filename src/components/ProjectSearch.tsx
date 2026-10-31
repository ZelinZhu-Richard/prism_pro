import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import { ChevronDown, LoaderCircle, Search, Undo2 } from "lucide-react";
import { api } from "../api";
import { Modal } from "./Modal";
import { defaultSearch } from "../../shared/search";
import type {
  SearchOptions,
  SearchFile,
  SearchMatch,
  SearchResult,
  ReplacementPreview,
  ReplacementFile,
} from "../../shared/search";

type Props = {
  projectId: string;
  generation: number;
  active: boolean;
  locked: boolean;
  prepare: () => Promise<void>;
  onOpen: (file: SearchFile, match: SearchMatch) => Promise<void>;
  onChanged: (paths: string[]) => Promise<void>;
};
export function ProjectSearch(props: Props) {
  const [options, setOptions] = useState<SearchOptions>({ ...defaultSearch });
  const [replacement, setReplacement] = useState("");
  const [expand, setExpand] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [review, setReview] = useState<ReplacementPreview | null>(null);
  const [recent, setRecent] = useState<ReplacementPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const query = useRef<HTMLInputElement>(null),
    request = useRef(0);
  const base = `/projects/${props.projectId}`;
  useEffect(() => {
    let stale = false;
    void api<ReplacementPreview[]>(`${base}/replacements`)
      .then((items) => {
        if (!stale) setRecent(items);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
      request.current++;
    };
  }, [base]);
  useEffect(() => {
    if (props.active) query.current?.focus();
  }, [props.active]);
  function update(change: Partial<SearchOptions>) {
    setOptions((current) => ({ ...current, ...change }));
    setResult(null);
    setError("");
    setNotice("");
  }
  async function search(preview = false) {
    if (busy || !options.query || (preview && props.locked)) return;
    const token = ++request.current;
    const trigger = document.activeElement as HTMLElement | null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await props.prepare();
      if (preview) {
        const next = await api<ReplacementPreview>(
          `${base}/replacements/preview`,
          "POST",
          {
            ...options,
            replacement,
            expand: options.regex && expand,
          },
        );
        if (token === request.current) {
          if (next.files.length) setReview(next);
          else
            setNotice(
              "No files would change. Adjust the query or replacement.",
            );
        }
      } else {
        const next = await api<SearchResult>(`${base}/search`, "POST", options);
        if (token === request.current) setResult(next);
      }
    } catch (e) {
      if (token === request.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === request.current) {
        setBusy(false);
        requestAnimationFrame(() => {
          if (
            token === request.current &&
            document.activeElement === document.body &&
            trigger?.isConnected
          )
            trigger.focus();
        });
      }
    }
  }
  async function changed(next: ReplacementPreview) {
    setReview(next);
    setResult(null);
    await props.onChanged(next.selectedPaths ?? []);
    setRecent(await api<ReplacementPreview[]>(`${base}/replacements`));
    setNotice(
      next.status === "undone"
        ? "Replacement undone."
        : "Replacement applied. Undo is available below.",
    );
  }
  return (
    <section
      className="project-content-search"
      hidden={!props.active}
      aria-label="Project content search"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label htmlFor="project-search-query">Search project</label>
        <div className="project-search-query">
          <input
            ref={query}
            id="project-search-query"
            value={options.query}
            maxLength={2000}
            placeholder="Find in all text files…"
            disabled={busy}
            onChange={(e) => update({ query: e.target.value })}
          />
          <button
            className="icon-button"
            aria-label="Run project search"
            title="Search"
            disabled={busy || !options.query}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Search size={16} />
            )}
          </button>
        </div>
        <div className="project-search-options" aria-label="Search options">
          {(
            [
              ["caseSensitive", "Match case", "Aa"],
              ["wholeWord", "Whole word", "Word"],
              ["regex", "Regular expression", ".*"],
            ] as const
          ).map(([key, label, text]) => (
            <button
              type="button"
              key={key}
              aria-label={label}
              title={label}
              aria-pressed={options[key]}
              disabled={busy}
              onClick={() => update({ [key]: !options[key] })}
            >
              {text}
            </button>
          ))}
        </div>
        <details className="project-search-filters">
          <summary>Files to include or exclude</summary>
          <label>
            Include
            <input
              aria-label="Include file patterns"
              value={options.include}
              maxLength={500}
              disabled={busy}
              placeholder="e.g. **/*.tex, *.bib"
              onChange={(e) => update({ include: e.target.value })}
            />
          </label>
          <label>
            Exclude
            <input
              aria-label="Exclude file patterns"
              value={options.exclude}
              maxLength={500}
              disabled={busy}
              placeholder="e.g. styles/**"
              onChange={(e) => update({ exclude: e.target.value })}
            />
          </label>
          <p>
            Comma-separated patterns. Use *, **, or ?. Empty includes all text
            files.
          </p>
        </details>
        <details className="project-search-replace">
          <summary>Replace across files</summary>
          <label>
            Replace with
            <textarea
              aria-label="Project replacement text"
              value={replacement}
              maxLength={200000}
              rows={2}
              spellCheck={false}
              disabled={busy}
              onChange={(e) => setReplacement(e.target.value)}
            />
          </label>
          {options.regex && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={expand}
                disabled={busy}
                onChange={(e) => setExpand(e.target.checked)}
              />
              Expand capture groups
            </label>
          )}
          <p>
            {options.regex && expand
              ? "Supports $1…$99, $<name>, $& and $$. Backslashes stay literal."
              : "Replacement is literal, including LaTeX backslashes and dollar signs."}
          </p>
          <button
            type="button"
            className="subtle"
            disabled={props.locked || busy || !options.query}
            onClick={() => void search(true)}
          >
            Preview replacement
          </button>
          {props.locked && (
            <p>Replacement is read-only while the assistant works.</p>
          )}
        </details>
      </form>
      {error && (
        <p role="alert" className="project-search-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="project-search-notice">
          {notice}
        </p>
      )}
      <div
        className="project-search-results"
        aria-live="polite"
        aria-busy={busy}
      >
        {result ? (
          <>
            <p className="project-search-summary">
              {result.truncated ? "First " : ""}
              {result.total} {result.total === 1 ? "match" : "matches"} in{" "}
              {result.files.length}{" "}
              {result.files.length === 1 ? "file" : "files"}
            </p>
            {result.generation !== props.generation && (
              <p className="project-search-notice">
                Files changed. Search again for current locations.
              </p>
            )}
            {result.truncated && (
              <p className="project-search-notice">
                Limited to 1,000 matches. Narrow the query or included files.
              </p>
            )}
            {result.warnings.map((warning) => (
              <p className="project-search-notice" key={warning}>
                {warning}
              </p>
            ))}
            {!result.total && (
              <p className="sidebar-empty">
                No matches. Try another query or adjust the file filters.
              </p>
            )}
            {result.files.map((file) => (
              <details key={file.path} open className="project-search-file">
                <summary>
                  <ChevronDown size={13} />
                  <span title={file.path}>{file.path}</span>
                  <small>{file.count}</small>
                </summary>
                <ul>
                  {file.matches.map((match, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        aria-label={`Open ${file.path} at line ${match.line}, column ${match.column}`}
                        title={`Line ${match.line}, column ${match.column}`}
                        onClick={() =>
                          void props
                            .onOpen(file, match)
                            .catch((e) => setError(e.message))
                        }
                      >
                        <small>{match.line}</small>
                        <code>
                          {match.prefix}
                          <mark>{match.text || "(empty match)"}</mark>
                          {match.clipped ? "…" : ""}
                          {match.suffix}
                        </code>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </>
        ) : (
          <p className="sidebar-empty">
            Search source, bibliography, and other project text. Results open
            the exact location in Code view.
          </p>
        )}
      </div>
      {recent.length > 0 && (
        <details className="project-search-history">
          <summary>Recent replacements</summary>
          {recent.map((item) => (
            <button key={item.id} onClick={() => setReview(item)}>
              <span>
                {item.options.query} → {item.replacement || "(delete)"}
              </span>
              <small>
                {item.status === "undone" ? "Undone" : "Applied"} ·{" "}
                {new Date(item.created).toLocaleString()}
              </small>
            </button>
          ))}
        </details>
      )}
      {review && (
        <ReplacementReview
          preview={review}
          locked={props.locked}
          prepare={props.prepare}
          onChanged={changed}
          onClose={() => setReview(null)}
        />
      )}
    </section>
  );
}

function ReplacementReview({
  preview,
  locked,
  prepare,
  onChanged,
  onClose,
}: {
  preview: ReplacementPreview;
  locked: boolean;
  prepare: () => Promise<void>;
  onChanged: (next: ReplacementPreview) => Promise<void>;
  onClose: () => void;
}) {
  const visibleFiles =
    preview.status === "pending"
      ? preview.files
      : preview.files.filter((file) =>
          preview.selectedPaths?.includes(file.path),
        );
  const [selected, setSelected] = useState(
    () => new Set(preview.selectedPaths ?? preview.files.map((f) => f.path)),
  );
  const [path, setPath] = useState(visibleFiles[0]?.path ?? "");
  const [contents, setContents] = useState<ReplacementFile | null>(null);
  const [acting, setActing] = useState(false),
    [error, setError] = useState("");
  const actionButton = useRef<HTMLButtonElement>(null);
  const base = `/projects/${preview.projectId}/replacements/${preview.id}`;
  useEffect(() => {
    if (!visibleFiles.some((file) => file.path === path))
      setPath(visibleFiles[0]?.path ?? "");
  }, [preview.status]);
  useEffect(() => {
    let stale = false;
    setContents(null);
    setError("");
    if (path)
      void api<ReplacementFile>(`${base}/file?path=${encodeURIComponent(path)}`)
        .then((file) => {
          if (!stale) setContents(file);
        })
        .catch((e) => {
          if (!stale) setError(e.message);
        });
    return () => {
      stale = true;
    };
  }, [base, path]);
  const diff = useMemo(() => {
    if (!contents || contents.before.length + contents.after.length > 200000)
      return null;
    const parts = diffLines(contents.before, contents.after, {
      timeout: 100,
      maxEditLength: 2000,
    });
    if (!parts) return null;
    let remaining = 800;
    return {
      truncated:
        parts.reduce((n, part) => n + (part.count ?? 0), 0) > remaining,
      lines: parts.flatMap((part) => {
        const lines = part.value.split("\n");
        if (lines.at(-1) === "") lines.pop();
        return lines.slice(0, Math.max(0, remaining)).map((text) => {
          remaining--;
          return {
            text,
            kind: part.added ? "add" : part.removed ? "remove" : "same",
          };
        });
      }),
    };
  }, [contents]);
  async function apply(undo = false) {
    if (acting || locked) return;
    setActing(true);
    setError("");
    try {
      await prepare();
      const next = await api<ReplacementPreview>(
        `${base}/${undo ? "undo" : "apply"}`,
        "POST",
        undo ? {} : { paths: [...selected] },
      );
      await onChanged(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
      requestAnimationFrame(() => actionButton.current?.focus());
    }
  }
  const chosenCount = preview.files
    .filter((file) => selected.has(file.path))
    .reduce((n, file) => n + file.count, 0);
  return (
    <Modal
      title={
        preview.status === "pending"
          ? "Review replacement"
          : "Project replacement"
      }
      wide
      className="replacement-modal"
      dismissible={!acting}
      onClose={onClose}
    >
      <p className="modal-intro">
        {preview.status === "pending"
          ? "Choose files and inspect the changes before applying. Previewing does not change source or project history."
          : preview.status === "applied"
            ? "These changes were applied. Undo restores all selected files together if they have not changed since."
            : "This replacement was undone."}
      </p>
      <div className="replacement-query">
        <span>
          Find <code>{preview.options.query}</code>
        </span>
        <span>
          Replace <code>{preview.replacement || "(delete matches)"}</code>
        </span>
      </div>
      {error && (
        <p role="alert" className="project-search-error">
          {error}
        </p>
      )}
      {preview.warnings.map((warning) => (
        <p className="field-help" key={warning}>
          {warning}
        </p>
      ))}
      <div className="replacement-grid">
        <div className="replacement-files" aria-label="Replacement files">
          {preview.status === "pending" && (
            <label className="check-label">
              <input
                type="checkbox"
                disabled={acting}
                checked={selected.size === preview.files.length}
                onChange={(e) =>
                  setSelected(
                    new Set(
                      e.target.checked ? preview.files.map((f) => f.path) : [],
                    ),
                  )
                }
              />
              Select all files
            </label>
          )}
          {visibleFiles.map((file) => (
            <div
              key={file.path}
              className={path === file.path ? "selected" : ""}
            >
              <input
                type="checkbox"
                aria-label={`Replace in ${file.path}`}
                checked={selected.has(file.path)}
                disabled={acting || preview.status !== "pending"}
                onChange={(e) =>
                  setSelected((old) => {
                    const next = new Set(old);
                    e.target.checked
                      ? next.add(file.path)
                      : next.delete(file.path);
                    return next;
                  })
                }
              />
              <button
                disabled={acting}
                aria-pressed={path === file.path}
                onClick={() => setPath(file.path)}
              >
                <span>{file.path}</span>
                <small>
                  {file.count} {file.count === 1 ? "match" : "matches"}
                </small>
              </button>
            </div>
          ))}
        </div>
        <section className="replacement-source" aria-label="Replacement diff">
          <div className="replacement-diff-heading">
            <strong>{path}</strong>
            {contents && (
              <span>
                <a
                  href={`/api${base}/download?path=${encodeURIComponent(path)}&version=before`}
                  download
                >
                  Original
                </a>
                <a
                  href={`/api${base}/download?path=${encodeURIComponent(path)}&version=after`}
                  download
                >
                  Replacement
                </a>
              </span>
            )}
          </div>
          {!contents ? (
            <p className="field-help">Loading source…</p>
          ) : !diff ? (
            <p className="field-help">
              This diff is too large for an inline preview. Download the
              original and replacement above to review the full source.
            </p>
          ) : (
            <>
              <p className="replacement-legend">
                − Removed · + Added
                {diff.truncated
                  ? " · First 800 lines; download for full source"
                  : ""}
              </p>
              <pre
                className="replacement-diff"
                tabIndex={0}
                aria-label={`Changes to ${path}`}
              >
                {diff.lines.map((line, i) => (
                  <span key={i} className={line.kind}>
                    <b>
                      {line.kind === "add"
                        ? "+"
                        : line.kind === "remove"
                          ? "−"
                          : " "}
                    </b>
                    {line.text || " "}
                  </span>
                ))}
              </pre>
            </>
          )}
        </section>
      </div>
      <div className="replacement-actions">
        <span role="status">
          {acting
            ? "Saving replacement…"
            : preview.status === "pending"
              ? `${chosenCount} ${chosenCount === 1 ? "match" : "matches"} in ${selected.size} selected ${selected.size === 1 ? "file" : "files"}`
              : preview.status === "applied"
                ? "Applied · backed up in project history"
                : "Undone · original text restored"}
        </span>
        <button
          ref={preview.status === "undone" ? actionButton : undefined}
          disabled={acting}
          onClick={onClose}
        >
          {preview.status === "pending" ? "Cancel" : "Close"}
        </button>
        {preview.status === "pending" && (
          <button
            ref={actionButton}
            className="primary"
            disabled={acting || locked || !selected.size || !contents}
            onClick={() => void apply()}
          >
            Apply to {selected.size} {selected.size === 1 ? "file" : "files"}
          </button>
        )}
        {preview.status === "applied" && (
          <button
            ref={actionButton}
            className="primary"
            disabled={acting || locked}
            onClick={() => void apply(true)}
          >
            <Undo2 size={15} />
            Undo replacement
          </button>
        )}
      </div>
      {locked && (
        <p className="field-help">
          Files are read-only while the assistant works. Stop the run before
          applying or undoing a replacement.
        </p>
      )}
    </Modal>
  );
}
