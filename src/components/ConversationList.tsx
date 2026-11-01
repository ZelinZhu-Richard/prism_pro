import { useState } from "react";
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
export function ConversationList({
  items,
  activeId,
  locked,
  onSelect,
  onEdit,
  onRefresh,
}: {
  items: ConversationInfo[];
  activeId: string;
  locked: boolean;
  onSelect: (id: string) => void;
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
    [error, setError] = useState("");
  const visible = items.filter(
    (c) =>
      !!c.archivedAt === archived &&
      c.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
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
          aria-label="Search chat titles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a conversation…"
        />
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
        {visible.length ? (
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
                    <span className="sr-only">Conversation title</span>
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
            {query
              ? "No conversation titles match."
              : archived
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
