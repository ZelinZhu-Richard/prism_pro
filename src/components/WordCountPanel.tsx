import { useEffect, useState } from "react";
import { api } from "../api";
import type { WordCountResult } from "../../server/word-count";
export function WordCountPanel({
  projectId,
  generation,
  locked,
}: {
  projectId: string;
  generation: number;
  locked: boolean;
}) {
  const [result, setResult] = useState<WordCountResult | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [includeHeadings, setIncludeHeadings] = useState(false),
    [includeCaptions, setIncludeCaptions] = useState(false),
    [includeBibliography, setIncludeBibliography] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError("");
    void api<WordCountResult>(`/projects/${projectId}/word-count`, "POST", {
      includeBibliography,
    })
      .then((r) => {
        if (!stale) setResult(r);
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
  }, [projectId, includeBibliography, refresh]);
  const total = result
    ? result.text +
      (includeHeadings ? result.headings : 0) +
      (includeCaptions ? result.captions : 0)
    : 0;
  return (
    <div className="word-count-panel">
      <p className="modal-intro">
        Counts the saved root document and included source files with TeXcount.
        LaTeX commands and equations are excluded from the word total.
      </p>
      {loading && <p role="status">Counting words…</p>}
      {error && (
        <p role="alert" className="history-error">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="word-total">
            <strong>{total.toLocaleString()}</strong>
            <span>words · {result.root}</span>
          </div>
          <div className="word-options">
            <label>
              <input
                type="checkbox"
                checked={includeHeadings}
                onChange={(e) => setIncludeHeadings(e.target.checked)}
              />
              Include headings
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeCaptions}
                onChange={(e) => setIncludeCaptions(e.target.checked)}
              />
              Include captions and other text
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeBibliography}
                disabled={loading || locked}
                onChange={(e) => setIncludeBibliography(e.target.checked)}
              />
              Include bibliography
            </label>
          </div>
          <dl className="word-breakdown">
            <div>
              <dt>Body text</dt>
              <dd>{result.text}</dd>
            </div>
            <div>
              <dt>Headings</dt>
              <dd>{result.headings}</dd>
            </div>
            <div>
              <dt>Captions and other text</dt>
              <dd>{result.captions}</dd>
            </div>
            <div>
              <dt>Inline equations</dt>
              <dd>{result.inlineMath}</dd>
            </div>
            <div>
              <dt>Displayed equations</dt>
              <dd>{result.displayMath}</dd>
            </div>
          </dl>
          {result.sections.length > 0 && (
            <table className="word-section-table">
              <caption>Section counts</caption>
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Body</th>
                  <th>Headings</th>
                  <th>Other</th>
                </tr>
              </thead>
              <tbody>
                {result.sections.slice(0, 200).map((s, i) => (
                  <tr key={i}>
                    <td>{s.title}</td>
                    <td>{s.text}</td>
                    <td>{s.headings}</td>
                    <td>{s.captions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.sections.length > 200 && (
            <p className="field-help">
              Showing the first 200 sections. The full section breakdown is
              available in the TeXcount report below.
            </p>
          )}
          {result.generation < generation && (
            <p role="status" className="field-help">
              The project changed after this count. Recount to refresh the
              result.
            </p>
          )}
          {result.warnings.map((w, i) => (
            <p className="field-help" key={i}>
              {w}
            </p>
          ))}
          <details>
            <summary>TeXcount report and counting notes</summary>
            <p className="field-help">
              {result.engine}. Counts follow TeXcount's macro rules and %TC
              directives. Bibliography counting needs a .bbl or manual
              bibliography; biblatex support is limited. This is a source count
              and may differ from a journal's rules.
            </p>
            <pre>{result.report}</pre>
          </details>
        </>
      )}
      <button
        className="primary"
        disabled={loading || locked}
        onClick={() => setRefresh((n) => n + 1)}
      >
        Recount
      </button>
    </div>
  );
}
