import { useEffect, useState } from "react";
import { api } from "../api";
import type {
  ArchivedReview,
  ArchivedThread,
} from "../../shared/history-recovery";
export function HistoricalReview({
  projectId,
  versionId,
  active,
  initialPath,
  onFile,
}: {
  projectId: string;
  versionId: string;
  active: boolean;
  initialPath: string;
  onFile: (path: string) => void;
}) {
  const [path, setPath] = useState(initialPath),
    [offset, setOffset] = useState(0),
    [view, setView] = useState<ArchivedReview>(),
    [threadId, setThreadId] = useState(""),
    [thread, setThread] = useState<ArchivedThread>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const base = `/projects/${projectId}/checkpoints/${versionId}/review`;
  useEffect(() => {
    setPath(initialPath);
    setOffset(0);
  }, [initialPath]);
  useEffect(() => {
    if (!active) return;
    let stale = false;
    setLoading(true);
    setError("");
    setThreadId("");
    void api<ArchivedReview>(
      `${base}?offset=${offset}${path ? "&path=" + encodeURIComponent(path) : ""}`,
    )
      .then((v) => {
        if (!stale) setView(v);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [base, path, offset, active]);
  useEffect(() => {
    setThread(undefined);
    if (!threadId) return;
    let stale = false;
    void api<ArchivedThread>(`${base}/${encodeURIComponent(threadId)}`)
      .then((v) => {
        if (!stale) setThread(v);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [base, threadId]);
  return (
    <section
      className="historical-review"
      hidden={!active}
      aria-label="Saved review state"
    >
      <p className="field-help">
        Read-only comments and pending tracked changes from the selected
        version. Current discussion stays unchanged.
      </p>
      {error && (
        <p className="history-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading saved review…</p>}
      {!loading && view && !view.available ? (
        <p className="field-help">{view.reason}</p>
      ) : (
        !loading &&
        view?.available && (
          <>
            <label className="historical-review-file">
              Review file
              <select
                aria-label="Saved review file"
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setOffset(0);
                  onFile(e.target.value);
                }}
              >
                <option value="">All saved comments</option>
                {view.paths.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                {path && !view.paths.includes(path) && (
                  <option value={path}>{path} · no saved review</option>
                )}
              </select>
            </label>
            <h3>Saved comments</h3>
            <div className="historical-thread-list">
              {view.threads.map((t) => (
                <button
                  key={t.id}
                  aria-pressed={threadId === t.id}
                  onClick={() => setThreadId(t.id)}
                >
                  <strong>{t.path}</strong>
                  <span>
                    {t.deleted ? "In Trash" : t.resolved ? "Resolved" : "Open"}{" "}
                    · {t.messages} {t.messages === 1 ? "message" : "messages"}
                  </span>
                  <p>{t.excerpt}</p>
                </button>
              ))}
              {!view.threads.length && (
                <p className="field-help">No saved comments for this file.</p>
              )}
            </div>
            {view.total > 25 && (
              <div className="history-controls">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 25))}
                >
                  Previous comments
                </button>
                <span>
                  {offset + 1}–{Math.min(offset + 25, view.total)} of{" "}
                  {view.total}
                </span>
                <button
                  disabled={view.nextOffset === undefined}
                  onClick={() => setOffset(view.nextOffset!)}
                >
                  Next comments
                </button>
              </div>
            )}
            {threadId && !thread && <p role="status">Loading saved thread…</p>}
            {thread && (
              <section
                className="historical-thread"
                aria-label="Saved comment thread"
              >
                <h3>{thread.path}</h3>
                <p className="field-help">
                  {thread.deleted
                    ? "Thread was in Trash"
                    : thread.resolved
                      ? "Thread was resolved"
                      : "Thread was open"}{" "}
                  · passage {thread.anchorStatus}
                </p>
                <details>
                  <summary>Original saved passage</summary>
                  <pre tabIndex={0}>{thread.quote}</pre>
                </details>
                {thread.messages.map((m, i) => (
                  <article key={m.id} aria-label={`Saved message ${i + 1}`}>
                    <strong>You</strong>
                    <span>{m.deleted ? " · Message was in Trash" : ""}</span>
                    <p>{m.body}</p>
                  </article>
                ))}
              </section>
            )}
            <h3>Saved tracked changes</h3>
            {!path ? (
              <p className="field-help">
                Choose a file to inspect its pending changes.
              </p>
            ) : !view.tracked?.hunks.length ? (
              <p className="field-help">
                No pending changes were saved for this file.
              </p>
            ) : (
              <>
                {view.tracked.deleted && (
                  <p className="field-help">
                    This file was in Trash in the selected version.
                  </p>
                )}
                {view.tracked.limited && (
                  <p className="field-help">
                    The large rewrite is grouped as one exact change.
                  </p>
                )}
                {view.tracked.hunks.map((h) => (
                  <details
                    key={h.id}
                    open={h.id === 0}
                    className="historical-tracked"
                  >
                    <summary>
                      Change {h.id + 1} · saved line {h.line}
                    </summary>
                    {h.before && (
                      <>
                        <span>Removed</span>
                        <pre className="tracking-removed" tabIndex={0}>
                          {h.before}
                        </pre>
                      </>
                    )}
                    {h.after && (
                      <>
                        <span>Added</span>
                        <pre tabIndex={0}>{h.after}</pre>
                      </>
                    )}
                  </details>
                ))}
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
