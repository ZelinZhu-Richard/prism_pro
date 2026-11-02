import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Archive,
  ArchiveRestore,
  Pencil,
  Check,
  X,
} from "lucide-react";
import type { ConversationInfo } from "../../shared/chats";
import type { Conversation } from "../../shared/types";
import type { ChatSearchPage } from "../../shared/chat-search";
import { api } from "../api";
import "./chat-search.css";
export function ConversationList({
  projectId,
  items,
  activeId,
  locked,
  onSelect,
  onEdit,
  onRefresh,
}: {
  projectId: string;
  items: ConversationInfo[];
  activeId: string;
  locked: boolean;
  onSelect: (id: string, runId?: string) => void;
  onEdit: (
    item: Conversation,
    change: { title?: string; archived?: boolean },
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [editing, setEditing] = useState(""),
    [title, setTitle] = useState(""),
    [pending, setPending] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState<{ key: string; page: ChatSearchPage }>(),
    [searchError, setSearchError] = useState(""),
    [searching, setSearching] = useState(false),
    [retry, setRetry] = useState(0);
  const searchKey = JSON.stringify([projectId, query, archived]),
    identity = useRef(searchKey),
    sequence = useRef(0);
  identity.current = searchKey;
  const visible = items.filter((c) => !!c.archivedAt === archived),
    searchingQuery = !!query.trim(),
    page = result?.key === searchKey ? result.page : undefined,
    metadata = items
      .map((c) => `${c.id}:${c.revision}:${c.turns}:${c.updated}`)
      .join("|");
  async function search(cursor?: string) {
    const key = identity.current,
      request = ++sequence.current;
    setSearching(true);
    setSearchError("");
    try {
      const response = await api<ChatSearchPage>(
        `/projects/${projectId}/chat-search?${new URLSearchParams({ q: query, archived: archived ? "1" : "0", ...(cursor ? { cursor } : {}) })}`,
      );
      if (request !== sequence.current || key !== identity.current) return;
      setResult((old) => ({
        key,
        page:
          cursor && old?.key === key
            ? { ...response, hits: [...old.page.hits, ...response.hits] }
            : response,
      }));
    } catch (e) {
      if (request === sequence.current && key === identity.current)
        setSearchError((e as Error).message);
    } finally {
      if (request === sequence.current && key === identity.current)
        setSearching(false);
    }
  }
  useEffect(() => {
    sequence.current++;
    setResult(undefined);
    setSearchError("");
    setSearching(searchingQuery);
    if (!searchingQuery) return;
    const timer = setTimeout(() => void search(), 300);
    return () => {
      clearTimeout(timer);
      sequence.current++;
    };
  }, [searchKey, metadata, retry]);
  async function change(
    c: Conversation,
    update: { title?: string; archived?: boolean },
  ) {
    if (pending) return;
    setPending(c.id);
    setError("");
    try {
      await onEdit(c, update);
      setEditing("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending("");
    }
  }
  return (
    <div className="chat-library">
      <label className="chat-search">
        <span>Search chats</span>
        <input
          type="search"
          aria-label="Search chats"
          aria-describedby="chat-search-help"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a title, prompt or reply…"
          maxLength={400}
        />
        <small id="chat-search-help">
          Titles and saved messages · this project
        </small>
      </label>
      <div className="chat-library-tools">
        <button
          aria-pressed={archived}
          onClick={() => {
            setArchived((v) => !v);
            setEditing("");
          }}
        >
          {archived
            ? "Back to chats"
            : `Archived (${items.filter((c) => c.archivedAt).length})`}
        </button>
        <button
          disabled={!!pending}
          onClick={async () => {
            setPending("refresh");
            setError("");
            try {
              await onRefresh();
              setRetry((v) => v + 1);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setPending("");
            }
          }}
        >
          {pending === "refresh" ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && (
        <p className="history-error" role="alert">
          {error}
        </p>
      )}
      <div className="chat-list">
        {searchingQuery ? (
          <div
            className="chat-search-results"
            aria-label="Chat search results"
            aria-busy={searching}
          >
            <p className="chat-search-status" role="status">
              {searching
                ? page
                  ? "Loading more matches…"
                  : "Searching saved chats…"
                : page
                  ? `${page.total} ${page.total === 1 ? "match" : "matches"}${page.nextCursor ? ` · ${page.hits.length} shown` : ""}`
                  : ""}
            </p>
            {searchError && (
              <div className="chat-search-error" role="alert">
                <p>{searchError}</p>
                <button
                  className="subtle"
                  onClick={() =>
                    page?.nextCursor
                      ? void search(page.nextCursor)
                      : setRetry((v) => v + 1)
                  }
                >
                  Retry search
                </button>
              </div>
            )}
            {page?.hits.map((hit) => (
              <div
                className="chat-search-hit"
                key={`${hit.conversation.id}:${hit.runId ?? "title"}`}
              >
                <button
                  disabled={
                    locked || !!pending || !!hit.conversation.archivedAt
                  }
                  onClick={() => onSelect(hit.conversation.id, hit.runId)}
                  aria-label={`Open ${hit.field === "title" ? "conversation" : hit.field + " match"} in ${hit.conversation.title}`}
                >
                  <strong>{hit.conversation.title}</strong>
                  <small>
                    {hit.field === "title"
                      ? "Title"
                      : hit.field === "prompt"
                        ? "Your prompt"
                        : "Assistant reply"}{" "}
                    ·{" "}
                    {new Date(hit.created).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                  <span className="chat-search-snippet">
                    {hit.snippet.before}
                    <mark>{hit.snippet.match}</mark>
                    {hit.snippet.after}
                  </span>
                </button>
                {hit.conversation.archivedAt && (
                  <button
                    className="chat-restore-match"
                    disabled={locked || !!pending}
                    onClick={async () => {
                      setPending(hit.conversation.id);
                      setError("");
                      try {
                        await onEdit(hit.conversation, { archived: false });
                        onSelect(hit.conversation.id, hit.runId);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setPending("");
                      }
                    }}
                  >
                    Restore &amp; open{" "}
                    {hit.field === "title" ? "chat" : "match"}
                  </button>
                )}
              </div>
            ))}
            {page?.total === 0 && (
              <p className="sidebar-empty">
                No saved titles, prompts or replies match. Try different words
                or {archived ? "go back to chats" : "search Archived"}.
              </p>
            )}
            {page?.nextCursor && (
              <button
                className="subtle chat-search-more"
                disabled={searching}
                onClick={() => void search(page.nextCursor)}
              >
                More matches
              </button>
            )}
          </div>
        ) : visible.length ? (
          visible.map((c) => (
            <div className="chat-library-row" key={c.id}>
              {editing === c.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void change(c, { title });
                  }}
                >
                  <label>
                    <span className="chat-title-label">Conversation title</span>
                    <input
                      aria-label="Conversation title"
                      autoFocus
                      value={title}
                      maxLength={200}
                      disabled={locked || !!pending}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditing("");
                        }
                      }}
                    />
                  </label>
                  <button
                    className="icon-button"
                    aria-label="Save conversation title"
                    disabled={locked || !!pending || !title.trim()}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Cancel renaming conversation"
                    disabled={!!pending}
                    onClick={() => setEditing("")}
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    className="chat-open"
                    aria-pressed={activeId === c.id}
                    disabled={locked || !!pending || !!c.archivedAt}
                    onClick={() => onSelect(c.id)}
                    title={c.title}
                  >
                    <MessageSquare size={15} />
                    <span>
                      {c.title}
                      <small>
                        {c.turns} {c.turns === 1 ? "turn" : "turns"} ·{" "}
                        {new Date(c.updated).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </small>
                    </span>
                  </button>
                  <div className="chat-row-actions">
                    <button
                      className="icon-button"
                      aria-label={`Rename ${c.title}`}
                      disabled={locked || !!pending}
                      onClick={() => {
                        setEditing(c.id);
                        setTitle(c.title);
                        setError("");
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${c.archivedAt ? "Restore" : "Archive"} ${c.title}`}
                      disabled={locked || !!pending}
                      onClick={() =>
                        void change(c, { archived: !c.archivedAt })
                      }
                    >
                      {c.archivedAt ? (
                        <ArchiveRestore size={14} />
                      ) : (
                        <Archive size={14} />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        ) : (
          <p className="sidebar-empty">
            {archived
              ? "No archived conversations."
              : "Your saved conversations will appear here."}
          </p>
        )}
      </div>
      {archived && (
        <p className="field-help chat-archive-help">
          Restore a conversation to read it and continue with its saved context.
          Archiving keeps its replies and native CLI session.
        </p>
      )}
    </div>
  );
}
