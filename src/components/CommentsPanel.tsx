import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowLeft,
  RefreshCw,
  Check,
  Undo2,
  Trash2,
  Pencil,
  MapPin,
} from "lucide-react";
import { api, ApiError } from "../api";
import type {
  CommentPage,
  CommentThread,
  CommentState,
  CommentInfo,
} from "../../shared/comments";
export interface CommentTarget {
  path: string;
  revision: number;
  from: number;
  to: number;
  quote: string;
  line: number;
}
type Draft = { id: string; target: CommentTarget; body: string };
export function CommentsPanel({
  projectId,
  active,
  activePath,
  generation,
  locked,
  canCreate,
  request,
  onCapture,
  onNavigate,
  onChanged,
}: {
  projectId: string;
  active: boolean;
  activePath: string;
  generation: number;
  locked: boolean;
  canCreate: boolean;
  request?: { id?: string; nonce: number };
  onCapture: () => Promise<CommentTarget>;
  onNavigate: (thread: CommentInfo) => Promise<void>;
  onChanged: () => void;
}) {
  const [scope, setScope] = useState("file"),
    [state, setState] = useState<CommentState>("open"),
    [offset, setOffset] = useState(0),
    [page, setPage] = useState<CommentPage | null>(null),
    [thread, setThread] = useState<CommentThread | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [draftShown, setDraftShown] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false),
    [editing, setEditing] = useState<{
      id: string;
      body: string;
      revision: number;
    } | null>(null),
    [reply, setReply] = useState("");
  const editDrafts = useRef(
    new Map<string, { id: string; body: string; revision: number }>(),
  );
  const replyDrafts = useRef(
      new Map<string, { body: string; id: string; revision: number }>(),
    ),
    selected = useRef(""),
    sequence = useRef(0),
    listSequence = useRef(0),
    pendingRef = useRef(false),
    draftInput = useRef<HTMLTextAreaElement>(null);
  pendingRef.current = pending;
  const base = `/projects/${projectId}/comments`;
  const current = useRef({ scope, state, offset, activePath });
  current.current = { scope, state, offset, activePath };
  async function refresh(resetReplyBasis = false) {
    const n = ++listSequence.current,
      q = current.current;
    const list = await api<CommentPage>(
      base +
        `?state=${q.state}&offset=${q.offset}` +
        (q.scope === "file" && q.activePath
          ? `&path=${encodeURIComponent(q.activePath)}`
          : ""),
    );
    if (n === listSequence.current) setPage(list);
    const id = selected.current;
    if (id && !pendingRef.current) {
      const value = await api<CommentThread>(base + "/" + id);
      if (selected.current === id) {
        setThread(value);
        if (resetReplyBasis) {
          const d = replyDrafts.current.get(id);
          if (d) d.revision = value.revision;
        }
      }
    }
  }
  useEffect(() => {
    setOffset(0);
  }, [scope, state, activePath]);
  useEffect(() => {
    if (!active) return;
    let stale = false;
    setLoading(true);
    void refresh()
      .catch((e) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    const timer = setInterval(() => {
      if (!pendingRef.current) void refresh().catch(() => {});
    }, 2500);
    return () => {
      stale = true;
      ++listSequence.current;
      clearInterval(timer);
    };
  }, [active, scope, state, offset, activePath, generation]);
  useEffect(() => {
    if (draft && draftShown) draftInput.current?.focus();
  }, [draft?.id, draftShown, active]);
  async function open(id: string, navigate = true) {
    const n = ++sequence.current;
    setError("");
    setLoading(true);
    try {
      const value = await api<CommentThread>(base + "/" + id);
      if (n !== sequence.current) return;
      selected.current = id;
      setThread(value);
      setDraftShown(false);
      setEditing(
        [...editDrafts.current.entries()].find(([key]) =>
          key.startsWith(id + "/"),
        )?.[1] ?? null,
      );
      setReply(replyDrafts.current.get(id)?.body ?? "");
      if (navigate && !value.unavailable) await onNavigate(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (n === sequence.current) setLoading(false);
    }
  }
  async function compose() {
    if (locked || pending) return;
    if (draft) {
      setDraftShown(true);
      draftInput.current?.focus();
      return;
    }
    setPending(true);
    setError("");
    try {
      const target = await onCapture();
      selected.current = "";
      setThread(null);
      setEditing(null);
      setDraft({ id: crypto.randomUUID(), target, body: "" });
      setDraftShown(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (!active || !request) return;
    if (request.id) void open(request.id);
    else void compose();
  }, [request?.nonce]);
  async function mutate(
    action: string,
    extra: Record<string, unknown> = {},
    revision = thread?.revision,
  ) {
    if (!thread || locked || pending) return;
    setPending(true);
    setError("");
    const id = thread.id;
    try {
      const value = await api<CommentThread>(base + "/" + id, "POST", {
        revision,
        action,
        ...extra,
      });
      if (selected.current === id) {
        setThread(value);
        if (action === "edit") {
          setEditing(null);
          editDrafts.current.delete(id + "/" + String(extra.id));
        }
        if (action === "reply") {
          replyDrafts.current.delete(id);
          setReply("");
        }
      }
      onChanged();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function post() {
    if (!draft || locked || pending || !draft.body.trim()) return;
    const d = draft;
    setPending(true);
    setError("");
    try {
      let value: CommentThread;
      try {
        value = await api<CommentThread>(base, "POST", {
          id: d.id,
          ...d.target,
          body: d.body,
        });
      } catch (e) {
        try {
          const saved = await api<CommentThread>(base + "/" + d.id);
          if (saved.replies[0]?.body !== d.body) throw e;
          value = saved;
        } catch {
          throw e;
        }
      }
      setDraft(null);
      setDraftShown(false);
      setState("open");
      selected.current = value.id;
      setThread(value);
      setReply("");
      onChanged();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function retarget() {
    if (locked || pending) return;
    setPending(true);
    setError("");
    try {
      if (draft) {
        try {
          await api(base + "/" + draft.id);
          throw new Error(
            "This comment was already saved. Open it from the list before creating another.",
          );
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        }
        const target = await onCapture();
        setDraft({ ...draft, id: crypto.randomUUID(), target });
      } else if (thread) {
        const target = await onCapture(),
          latest = await api<CommentThread>(base + "/" + thread.id);
        const value = await api<CommentThread>(base + "/" + thread.id, "POST", {
          ...target,
          revision: latest.revision,
          action: "reattach",
          sourceRevision: target.revision,
        });
        setThread(value);
        onChanged();
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const blocked = locked || pending;
  return (
    <section
      className="comments-panel"
      hidden={!active}
      aria-label="Document comments"
    >
      <div className="comments-heading">
        <strong>Comments</strong>
        <div>
          <button
            className="icon-button"
            aria-label="Refresh comments"
            title="Refresh comments; keep drafts"
            disabled={pending}
            onClick={() => {
              setError("");
              void refresh(true).catch((e) => setError(e.message));
            }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Add comment"
            title="Comment on the selection or current line"
            disabled={blocked || !canCreate}
            onClick={() => void compose()}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      {locked && (
        <p className="comments-notice">
          Read-only while the assistant or a file operation owns the source.
        </p>
      )}
      {error && (
        <p role="alert" className="comments-error">
          {error}{" "}
          <button
            onClick={() => void refresh(true).catch((e) => setError(e.message))}
          >
            Refresh comments
          </button>
        </p>
      )}
      {loading && (
        <p role="status" className="comments-notice">
          Loading comments…
        </p>
      )}
      <div className="comments-body">
        {draft && !draftShown && (
          <button
            className="comments-text-action"
            onClick={() => setDraftShown(true)}
          >
            Resume unposted comment
          </button>
        )}
        {draft && draftShown ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void post();
            }}
          >
            <h3>New comment</h3>
            <p className="comments-location">
              {draft.target.path} · line {draft.target.line}
            </p>
            <details className="comment-quote" open>
              <summary>Selected passage</summary>
              <pre tabIndex={0}>{draft.target.quote || "Empty line"}</pre>
            </details>
            <label htmlFor="new-comment-text">Your comment</label>
            <textarea
              id="new-comment-text"
              ref={draftInput}
              value={draft.body}
              maxLength={10000}
              rows={5}
              disabled={blocked}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <div className="comments-actions">
              <button
                type="submit"
                className="primary small"
                disabled={blocked || !draft.body.trim()}
              >
                Post comment
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              className="comments-text-action"
              disabled={blocked || !canCreate}
              onClick={() => void retarget()}
            >
              Use current selection
            </button>
            <p className="field-help">
              Drafts stay in this open workspace until posted or cancelled.
            </p>
          </form>
        ) : thread ? (
          <>
            <button
              className="comments-back"
              disabled={pending}
              onClick={() => {
                selected.current = "";
                setThread(null);
                setEditing(null);
                setError("");
              }}
            >
              <ArrowLeft size={13} />
              All comments
            </button>
            <div className="comments-thread-heading">
              <h3>
                {thread.deleted
                  ? "Thread in Trash"
                  : thread.resolved
                    ? "Resolved thread"
                    : "Comment thread"}
              </h3>
              <p className="comments-location">{thread.path}</p>
            </div>
            {thread.unavailable ? (
              <p className="comments-notice">
                This file is unavailable or in file Trash. Restore it in Files
                to return to the passage.
              </p>
            ) : (
              <button
                className="comments-source"
                onClick={() =>
                  void onNavigate(thread).catch((e) => setError(e.message))
                }
              >
                <MapPin size={13} />
                {thread.anchor.status === "removed"
                  ? "Go to former location"
                  : "Go to passage"}
              </button>
            )}
            {thread.anchor.status !== "attached" && (
              <p className="comments-notice">
                {thread.anchor.status === "removed"
                  ? "The original passage was removed."
                  : "The passage has changed since this comment."}{" "}
                The original quote is kept below.
              </p>
            )}
            <details className="comment-quote">
              <summary>Original passage</summary>
              <pre tabIndex={0}>{thread.anchor.quote || "Empty line"}</pre>
            </details>
            {!thread.deleted && (
              <div className="comments-actions">
                <button
                  disabled={blocked}
                  onClick={() =>
                    void mutate(thread.resolved ? "reopen" : "resolve")
                  }
                >
                  {thread.resolved ? <Undo2 size={13} /> : <Check size={13} />}{" "}
                  {thread.resolved ? "Reopen" : "Resolve"}
                </button>
                <button
                  title="Move thread to comment Trash"
                  aria-label="Move thread to Trash"
                  disabled={blocked}
                  onClick={() => void mutate("trash")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
            {thread.deleted && (
              <button
                className="primary small"
                disabled={blocked}
                onClick={() => void mutate("restore")}
              >
                Restore thread
              </button>
            )}
            {thread.replies.map((m, i) => (
              <article
                key={m.id}
                className="comment-message"
                aria-label={`Comment ${i + 1}`}
              >
                <div className="comment-message-heading">
                  <strong>You</strong>
                  <time
                    dateTime={m.created}
                    title={new Date(m.created).toLocaleString()}
                  >
                    {new Date(m.created).toLocaleDateString()}
                  </time>
                </div>
                {m.deleted ? (
                  <>
                    <p className="comments-notice">Message in Trash</p>
                    <button
                      disabled={blocked || thread.deleted}
                      onClick={() =>
                        void mutate("restore-message", { id: m.id })
                      }
                    >
                      Restore message
                    </button>
                  </>
                ) : editing?.id === m.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void mutate(
                        "edit",
                        { id: m.id, body: editing.body },
                        editing.revision,
                      );
                    }}
                  >
                    <label htmlFor="edit-comment-text">Edit comment</label>
                    <textarea
                      id="edit-comment-text"
                      rows={4}
                      maxLength={10000}
                      value={editing.body}
                      disabled={blocked}
                      onChange={(e) => {
                        const next = { ...editing, body: e.target.value };
                        editDrafts.current.set(thread.id + "/" + next.id, next);
                        setEditing(next);
                      }}
                    />
                    {editing.revision !== thread.revision && (
                      <div className="comment-conflict" role="status">
                        <p className="comments-notice">
                          This thread changed. Your draft is kept. Compare the
                          saved comment before continuing.
                        </p>
                        <strong>Current saved comment</strong>
                        <p className="comment-message-text" tabIndex={0}>
                          {m.body}
                        </p>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => {
                            const next = {
                              ...editing,
                              revision: thread.revision,
                            };
                            editDrafts.current.set(
                              thread.id + "/" + next.id,
                              next,
                            );
                            setEditing(next);
                            setError("");
                          }}
                        >
                          Use refreshed thread
                        </button>
                      </div>
                    )}
                    <div className="comments-actions">
                      <button
                        className="primary small"
                        disabled={
                          blocked ||
                          !editing.body.trim() ||
                          editing.revision !== thread.revision
                        }
                      >
                        Save comment
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          editDrafts.current.delete(
                            thread.id + "/" + editing.id,
                          );
                          setEditing(null);
                        }}
                      >
                        Cancel edit
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="comment-message-text">{m.body}</p>
                    <div className="comment-message-actions">
                      <button
                        aria-label={`Edit comment ${i + 1}`}
                        title="Edit comment"
                        disabled={blocked || thread.deleted}
                        onClick={() => {
                          const saved = editDrafts.current.get(
                              thread.id + "/" + m.id,
                            ),
                            next =
                              saved?.id === m.id
                                ? saved
                                : {
                                    id: m.id,
                                    body: m.body,
                                    revision: thread.revision,
                                  };
                          editDrafts.current.set(
                            thread.id + "/" + next.id,
                            next,
                          );
                          setEditing(next);
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        aria-label={`Move comment ${i + 1} to Trash`}
                        title="Move message to Trash"
                        disabled={blocked || thread.deleted}
                        onClick={() =>
                          void mutate("delete-message", { id: m.id })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                      {editDrafts.current.has(thread.id + "/" + m.id) &&
                        editing?.id !== m.id && <span>Draft kept</span>}
                      {m.updated !== m.created && (
                        <span
                          title={
                            "Last changed " +
                            new Date(m.updated).toLocaleString()
                          }
                        >
                          Updated
                        </span>
                      )}
                    </div>
                  </>
                )}
              </article>
            ))}
            {!thread.deleted && (
              <button
                className="comments-text-action"
                disabled={blocked || !canCreate}
                onClick={() => void retarget()}
              >
                Reattach to current selection
              </button>
            )}
            {!thread.deleted && !thread.resolved && !editing && (
              <form
                className="comments-reply"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = replyDrafts.current.get(thread.id);
                  if (d)
                    void mutate(
                      "reply",
                      { id: d.id, body: d.body },
                      d.revision,
                    );
                }}
              >
                <label htmlFor="comment-reply">Reply</label>
                <textarea
                  id="comment-reply"
                  rows={3}
                  maxLength={10000}
                  value={reply}
                  disabled={blocked}
                  onChange={(e) => {
                    const body = e.target.value,
                      d = replyDrafts.current.get(thread.id);
                    replyDrafts.current.set(thread.id, {
                      body,
                      id: d?.id ?? crypto.randomUUID(),
                      revision: d?.revision ?? thread.revision,
                    });
                    setReply(body);
                  }}
                />
                <button
                  className="primary small"
                  disabled={blocked || !reply.trim()}
                >
                  Post reply
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <div className="comments-filters">
              <label>
                Show
                <select
                  aria-label="Comment status"
                  value={state}
                  onChange={(e) => setState(e.target.value as CommentState)}
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="trash">Trash</option>
                </select>
              </label>
              <label>
                Scope
                <select
                  aria-label="Comment scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="file">Current file</option>
                  <option value="project">Whole project</option>
                </select>
              </label>
            </div>
            {page && !page.items.length && (
              <div className="comments-empty">
                <h3>
                  {state === "open"
                    ? "No open comments"
                    : state === "resolved"
                      ? "No resolved comments"
                      : "Comment Trash is empty"}
                </h3>
                <p>
                  {state === "open"
                    ? "Select a passage, then add a comment. Your LaTeX stays unchanged."
                    : "Threads you move here remain available for recovery."}
                </p>
              </div>
            )}
            {!!page?.items.length && (
              <p className="field-help">
                Alt+Enter at a marked passage opens its thread.
              </p>
            )}
            <div className="comments-list">
              {page?.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void open(item.id)}
                  className="comment-list-item"
                >
                  <span className="comments-location">
                    {item.path}
                    {item.unavailable ? " · unavailable" : ""}
                  </span>
                  <span className="comment-list-excerpt">{item.excerpt}</span>
                  <span>
                    {item.messages}{" "}
                    {item.messages === 1 ? "message" : "messages"}
                    {item.anchor.status !== "attached"
                      ? " · passage changed"
                      : ""}
                  </span>
                </button>
              ))}
            </div>
            {page && page.total > 0 && (
              <nav className="comments-pages" aria-label="Comment pages">
                <button
                  disabled={!offset}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous
                </button>
                <span>
                  {offset + 1}–{offset + page.items.length} of {page.total}
                </span>
                <button
                  disabled={page.nextOffset === undefined}
                  onClick={() => setOffset(page.nextOffset ?? 0)}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
