import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle, X } from "lucide-react";
import { PdfLinks, type PdfBookmark, type PdfLinkTarget } from "../pdf-links";

export function PdfBookmarks({
  links,
  onNavigate,
  onClose,
}: {
  links: PdfLinks;
  onNavigate: (target: PdfLinkTarget) => void;
  onClose: () => void;
}) {
  const [outline, setOutline] = useState<PdfBookmark[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setOutline(null);
    void links
      .bookmarks(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setOutline(items);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "PDF bookmarks could not be read.",
          );
      });
    return () => controller.abort();
  }, [links, retry]);
  return (
    <section
      className="pdf-bookmarks"
      aria-label="PDF bookmarks"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="pdf-bookmarks-heading">
        <span>PDF bookmarks</span>
        <button aria-label="Close PDF bookmarks" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </p>
      ) : outline === null ? (
        <p role="status">
          <LoaderCircle size={14} className="spin" /> Reading PDF bookmarks…
        </p>
      ) : !outline.length ? (
        <p>No bookmarks in this PDF. LaTeX’s hyperref package can add them.</p>
      ) : (
        <ul>
          {outline.map((item) => (
            <Bookmark key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </section>
  );
}
function Bookmark({
  item,
  onNavigate,
  depth = 0,
}: {
  item: PdfBookmark;
  onNavigate: (target: PdfLinkTarget) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(false),
    target = item.target;
  return (
    <li>
      <div
        className="pdf-bookmark-row"
        style={{ paddingInlineStart: Math.min(depth, 6) * 12 }}
      >
        {item.children.length ? (
          <button
            aria-label={`${open ? "Collapse" : "Expand"} ${item.title}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="pdf-bookmark-spacer" />
        )}
        {target?.kind === "url" ? (
          <a
            href={target.url}
            target="_blank"
            rel="noopener noreferrer"
            title={target.url}
            onClick={() => onNavigate(target)}
          >
            {item.title}
          </a>
        ) : target || item.children.length ? (
          <button
            className="pdf-bookmark-title"
            title={item.title}
            aria-expanded={!target ? open : undefined}
            onClick={() => (target ? onNavigate(target) : setOpen(!open))}
          >
            {item.title}
          </button>
        ) : (
          <span className="pdf-bookmark-title">{item.title}</span>
        )}
      </div>
      {open && !!item.children.length && (
        <ul>
          {item.children.map((child) => (
            <Bookmark
              key={child.id}
              item={child}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
