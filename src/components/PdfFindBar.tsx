import { useEffect, useRef } from "react";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { PDF_SEARCH_QUERY_LIMIT, type PdfSearchOptions } from "../pdf-search";

export function PdfFindBar({
  query,
  options,
  status,
  busy,
  count,
  focusSequence,
  onQuery,
  onOptions,
  onStep,
  onClose,
}: {
  query: string;
  options: PdfSearchOptions;
  status: string;
  busy: boolean;
  count: number;
  focusSequence: number;
  onQuery: (value: string) => void;
  onOptions: (options: PdfSearchOptions) => void;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusSequence]);
  return (
    <form
      className="pdf-find-bar"
      role="search"
      aria-label="Search compiled PDF"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && count) onStep(1);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          if (!busy && count) onStep(-1);
        }
      }}
    >
      <div className="pdf-find-row">
        <input
          ref={input}
          type="search"
          aria-label="Find in PDF"
          placeholder="Find in PDF…"
          value={query}
          maxLength={PDF_SEARCH_QUERY_LIMIT}
          onChange={(event) => onQuery(event.target.value)}
          spellCheck={false}
        />
        <button
          type="button"
          aria-label="Previous PDF match"
          title="Previous match (Shift Enter)"
          disabled={busy || !count}
          onClick={() => onStep(-1)}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="submit"
          aria-label="Next PDF match"
          title="Next match (Enter)"
          disabled={busy || !count}
        >
          <ChevronDown size={16} />
        </button>
        <button type="button" aria-label="Close PDF search" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="pdf-find-options">
        {(
          [
            ["caseSensitive", "Match case"],
            ["wholeWord", "Whole words"],
            ["matchAccents", "Match accents"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={options[key]}
            onClick={() => onOptions({ ...options, [key]: !options[key] })}
          >
            {label}
          </button>
        ))}
        <span role="status" aria-live="polite">
          {status}
        </span>
      </div>
    </form>
  );
}
