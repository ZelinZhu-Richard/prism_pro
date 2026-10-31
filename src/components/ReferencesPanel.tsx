import { useMemo, useState } from "react";
import {
  searchCitations,
  type ProjectIntelligence,
} from "../../shared/project-intelligence";
export function ReferencesPanel({
  index,
  error,
  onRefresh,
  canInsert,
  onInsert,
  onOpen,
}: {
  index?: ProjectIntelligence;
  error?: string;
  onRefresh: () => void;
  canInsert: boolean;
  onInsert: (key: string) => void;
  onOpen: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () => searchCitations(index?.citations ?? [], query),
    [index, query],
  );
  return (
    <div className="references-panel">
      <p className="modal-intro">
        Search your project's citation keys, titles, authors, years, and
        journals. Choose a reference to insert it at the captured cursor or
        complete the current citation.
      </p>
      {error && (
        <p role="alert" className="history-error">
          {error}
        </p>
      )}
      <div className="reference-search-heading">
        <label htmlFor="reference-search">Search bibliography</label>
        <button className="subtle" onClick={onRefresh}>
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
          ? `${entries.length} of ${index.citations.length} references`
          : error
            ? "Reference index unavailable"
            : "Loading project references…"}
      </p>
      <div className="reference-results">
        {entries.slice(0, 200).map((entry) => (
          <article key={entry.key}>
            <div className="reference-heading">
              <strong>{entry.key}</strong>
              <span>{entry.type}</span>
            </div>
            <p className="reference-title">
              {entry.title || "No title in the bibliography entry"}
            </p>
            <p className="field-help">
              {[entry.author, entry.year, entry.journal]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="reference-actions">
              <button onClick={() => onOpen(entry.path)}>
                {entry.path}:{entry.line}
              </button>
              <button disabled={!canInsert} onClick={() => onInsert(entry.key)}>
                Insert citation
              </button>
            </div>
          </article>
        ))}
      </div>
      {entries.length > 200 && (
        <p className="field-help">
          Showing the first 200 results. Refine your search to find a specific
          reference.
        </p>
      )}
      {index && !entries.length && (
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
