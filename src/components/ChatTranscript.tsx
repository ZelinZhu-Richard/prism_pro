import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  FileText,
} from "lucide-react";
import { api } from "../api";
const ChatMarkdown = lazy(() =>
  import("./ChatMarkdown").then((module) => ({ default: module.ChatMarkdown })),
);
import {
  chatStatus,
  mergeTurns,
  type TurnPage,
  type ProposalSummary,
} from "../../shared/chats";
import { providerNames } from "../../shared/catalog";
import type { AiRun } from "../../shared/types";
export function ChatTranscript({
  projectId,
  conversationId,
  revision,
  target,
  live,
  text,
  busy,
  draft,
  typing,
  paused,
  proposals,
  onReview,
  onReuse,
  onFile,
  children,
  welcome,
}: {
  projectId: string;
  conversationId: string;
  revision: string;
  target?: { runId: string; nonce: number };
  live: AiRun | null;
  text: string;
  busy: boolean;
  draft: boolean;
  typing: boolean;
  paused: boolean;
  proposals: ProposalSummary[];
  onReview: (proposal: ProposalSummary) => void;
  onReuse: (prompt: string) => void;
  onFile: (path: string) => void;
  children?: ReactNode;
  welcome: ReactNode;
}) {
  const [page, setPage] = useState<TurnPage>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [atBottom, setAtBottom] = useState(true),
    [browsing, setBrowsing] = useState(false),
    [highlight, setHighlight] = useState("");
  type LoadKind = "latest" | "earlier" | "newer" | "refresh" | "match";
  const content = useRef<HTMLDivElement>(null),
    body = useRef<HTMLDivElement>(null),
    request = useRef(0),
    identity = useRef(""),
    pinned = useRef(true),
    pageRef = useRef<TurnPage | undefined>(undefined),
    browseRef = useRef(false),
    retry = useRef<{ cursor?: string; kind: LoadKind }>({ kind: "latest" }),
    position = useRef<"bottom" | "top" | "match" | null>(null);
  identity.current = projectId + "/" + conversationId;
  pageRef.current = page;
  const active = live?.conversationId === conversationId ? live : null;
  async function load(cursor?: string, kind: LoadKind = "latest") {
    const id = ++request.current,
      key = identity.current;
    retry.current = { cursor, kind };
    if (kind !== "refresh") {
      browseRef.current = kind !== "latest";
      setBrowsing(browseRef.current);
      pinned.current = kind === "latest";
    }
    setLoading(true);
    setError("");
    try {
      const params = cursor
        ? "?" +
          new URLSearchParams({
            [kind === "match"
              ? "around"
              : kind === "newer"
                ? "after"
                : "before"]: cursor,
          })
        : "";
      const result = await api<TurnPage>(
        `/projects/${projectId}/conversations/${conversationId}/turns${params}`,
      );
      if (id !== request.current || key !== identity.current) return;
      setPage(result);
      if (kind !== "refresh") {
        setHighlight(kind === "match" ? cursor! : "");
        position.current =
          kind === "latest" ? "bottom" : kind === "match" ? "match" : "top";
        setAtBottom(kind === "latest");
      }
    } catch (e) {
      if (id === request.current && key === identity.current)
        setError((e as Error).message);
    } finally {
      if (id === request.current && key === identity.current) setLoading(false);
    }
  }
  useEffect(() => {
    request.current++;
    setPage(undefined);
    setHighlight("");
    if (conversationId) void load(target?.runId, target ? "match" : "latest");
    else {
      setLoading(false);
      setError("");
    }
    return () => {
      request.current++;
    };
  }, [projectId, conversationId, target?.nonce]);
  useEffect(() => {
    if (conversationId && pageRef.current && !browseRef.current)
      void load(undefined, "refresh");
  }, [revision]);
  const turns = mergeTurns(
    page?.turns ?? [],
    browsing ? null : active,
    text,
    busy,
  );
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    if (position.current === "match") {
      const match = content.current?.querySelector<HTMLElement>(
        '[data-search-match="true"]',
      );
      if (match) {
        match.focus({ preventScroll: true });
        el.scrollTop = match.offsetTop - content.current!.offsetTop;
      }
    } else if (position.current === "top") el.scrollTop = 0;
    else if (position.current === "bottom" || pinned.current)
      el.scrollTop = el.scrollHeight;
    position.current = null;
  }, [page, text, busy, draft, typing, paused, conversationId]);
  useEffect(() => {
    const el = body.current,
      inner = content.current;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinned.current && !browseRef.current) {
        el.scrollTop = el.scrollHeight;
        setAtBottom(true);
      }
    });
    observer.observe(inner);
    observer.observe(el);
    return () => observer.disconnect();
  }, [projectId, conversationId]);
  useEffect(() => {
    if (!busy || !active?.id) return;
    pinned.current = true;
    setAtBottom(true);
    position.current = "bottom";
    if (browseRef.current) void load();
    else if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [active?.id]);
  return (
    <div className="chat-transcript">
      {conversationId && (
        <div className="chat-history-nav">
          <span role="status">
            {page
              ? `${highlight ? "Search match · " : ""}${page.turns.length} of ${page.total} saved turns`
              : "Loading conversation…"}
          </span>
          <div>
            {browsing && (
              <button disabled={loading} onClick={() => void load()}>
                Return to latest
              </button>
            )}
            <button
              disabled={loading || !page?.nextBefore}
              onClick={() => void load(page?.nextBefore, "earlier")}
            >
              <ChevronLeft size={13} />
              Earlier
            </button>
            <button
              disabled={loading || !page?.nextAfter}
              onClick={() => void load(page?.nextAfter, "newer")}
            >
              Newer
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
      <div
        className="assistant-content"
        ref={body}
        aria-label="Conversation messages"
        onScroll={(e) => {
          const el = e.currentTarget;
          const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
          pinned.current = bottom && !browseRef.current;
          setAtBottom(bottom);
        }}
      >
        <div ref={content}>
          {error && (
            <div role="alert" className="chat-load-error">
              <p>{error}</p>
              <button
                className="subtle"
                onClick={() =>
                  void load(retry.current.cursor, retry.current.kind)
                }
              >
                Retry loading messages
              </button>
            </div>
          )}
          {loading && !page && (
            <p className="tool-status" role="status">
              <LoaderCircle size={13} className="spin" />
              Loading saved replies…
            </p>
          )}
          {!turns.length && !loading && !error && welcome}
          {turns.map((run) => {
            const isLive = run.id === active?.id && busy,
              status = chatStatus(
                run,
                isLive
                  ? { generating: !draft && !typing, draft, typing, paused }
                  : undefined,
              ),
              proposal = proposals.find((p) => p.runId === run.id);
            return (
              <article
                className="conversation-turn"
                key={run.id}
                tabIndex={-1}
                data-search-match={highlight === run.id ? "true" : undefined}
                aria-label={`Turn: ${run.prompt.slice(0, 70)}`}
              >
                <div className="chat-prompt-label">
                  <span>You</span>
                  <button disabled={busy} onClick={() => onReuse(run.prompt)}>
                    Use prompt again
                  </button>
                </div>
                <p className="user-message">{run.prompt}</p>
                <div className="answer-meta">
                  <strong>{run.model}</strong>
                  <span>
                    {providerNames[run.provider]} · {status}
                  </span>
                </div>
                <details className="chat-turn-context">
                  <summary>
                    {run.scope === "project" ? "Whole Project" : "Document"} ·{" "}
                    {run.path}
                  </summary>
                  <div>
                    {(run.contextFiles.length
                      ? run.contextFiles
                      : [run.path]
                    ).map((path) => (
                      <button key={path} onClick={() => onFile(path)}>
                        <FileText size={12} />
                        {path}
                      </button>
                    ))}
                  </div>
                </details>
                {run.text ? (
                  <Suspense fallback={<p className="chat-raw">{run.text}</p>}>
                    <ChatMarkdown text={run.text} />
                  </Suspense>
                ) : (
                  <p className="chat-empty-response">
                    {isLive
                      ? "Waiting for the assistant…"
                      : "No reply was completed."}
                  </p>
                )}
                {run.error && (
                  <p className="chat-run-error" role="status">
                    {run.error}
                  </p>
                )}
                {run.status === "interrupted" && (
                  <p className="field-help">
                    The request was interrupted. Saved text is intact; no paid
                    request was resumed.
                  </p>
                )}
                {proposal && (
                  <div className="chat-proposal">
                    <p>
                      <strong>
                        {proposal.files.length}{" "}
                        {proposal.files.length === 1 ? "file" : "files"} ·{" "}
                        {proposal.status === "pending"
                          ? "changes ready"
                          : proposal.status === "applied"
                            ? "changes applied"
                            : proposal.status}
                      </strong>
                    </p>
                    <p>{proposal.summary}</p>
                    <button
                      className="subtle"
                      onClick={() => onReview(proposal)}
                    >
                      {proposal.status === "pending"
                        ? "Review changes"
                        : "View changes"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {children}
        </div>
      </div>
      {!atBottom && !browsing && (
        <button
          className="chat-jump-latest"
          onClick={() => {
            if (browsing) void load();
            else {
              pinned.current = true;
              setAtBottom(true);
              body.current?.scrollTo({
                top: body.current.scrollHeight,
                behavior: "auto",
              });
            }
          }}
        >
          <ArrowDown size={13} />
          Latest messages
        </button>
      )}
    </div>
  );
}
