import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { CompileJob, Diagnostic } from "../../shared/types";
import {
  diagnosticCounts,
  diagnosticHelp,
  filterDiagnostics,
  type DiagnosticFilter,
} from "../../shared/diagnostic-help";
import "./compile-diagnostics.css";
export interface DiagnosticInspection {
  buildId: string;
  index: number;
  nonce: number;
}
export function CompileDiagnostics({
  job,
  onOpen,
  onFix,
  canOpen,
  fixDisabled,
  locationsCurrent,
  inspection,
}: {
  job?: CompileJob;
  onOpen: (d: Diagnostic) => void;
  onFix: (d: Diagnostic, job: CompileJob) => void;
  canOpen: (d: Diagnostic) => boolean;
  fixDisabled: boolean;
  locationsCurrent: boolean;
  inspection?: DiagnosticInspection;
}) {
  const [filter, setFilter] = useState<DiagnosticFilter>("problems"),
    root = useRef<HTMLElement>(null),
    pendingInspection = useRef<DiagnosticInspection | undefined>(undefined);
  const items = job?.diagnostics ?? [],
    counts = diagnosticCounts(items),
    shown = filterDiagnostics(items, filter);
  useEffect(() => setFilter("problems"), [job?.id]);
  useEffect(() => {
    if (!inspection || inspection.buildId !== job?.id) return;
    pendingInspection.current = inspection;
    setFilter("all");
  }, [inspection?.nonce, job?.id]);
  useEffect(() => {
    const target = pendingInspection.current;
    if (filter !== "all" || !target || target.buildId !== job?.id) return;
    pendingInspection.current = undefined;
    const frame = requestAnimationFrame(() => {
      const row = root.current?.querySelector<HTMLElement>(
        `[data-diagnostic-index="${target.index}"]`,
      );
      row?.scrollIntoView({ block: "nearest" });
      row?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [inspection?.nonce, job?.id, filter]);
  const running = job && ["queued", "running"].includes(job.status);
  return (
    <section
      ref={root}
      className="compile-diagnostics"
      aria-label="Compilation diagnostics"
    >
      <fieldset className="diagnostic-filters">
        <legend>Show messages</legend>
        {(
          [
            ["problems", "Problems"],
            ["error", "Errors"],
            ["warning", "Warnings"],
            ["info", "Info"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label} <span>{counts[value]}</span>
          </button>
        ))}
      </fieldset>
      {!!job && !locationsCurrent && !!items.length && (
        <p className="diagnostic-location-note">
          Locations refer to this build. Source has changed or disk status is
          uncertain; save or review files and compile again for current gutter
          markers.
        </p>
      )}
      <p className="diagnostic-result-count" role="status">
        {shown.length} of {items.length} messages
      </p>
      {!shown.length && (
        <p className="diagnostic-empty">
          {!job
            ? "Compile your document to see messages here."
            : running
              ? "Compilation is in progress. Messages update when the build finishes."
              : filter === "problems" && !counts.problems
                ? "No errors or warnings in this build."
                : "No messages in this category."}
          {filter === "problems" && counts.info > 0
            ? " Informational notes are available under Info."
            : ""}
        </p>
      )}
      {shown.map(({ item: d, index }) => {
        const help = diagnosticHelp(d),
          label =
            (d.severity === "error"
              ? "Error"
              : d.severity === "warning"
                ? "Warning"
                : "Info") +
            (d.path ? ` · ${d.path}${d.line ? ":" + d.line : ""}` : "");
        return (
          <article
            key={index}
            className={"compile-diagnostic " + d.severity}
            data-diagnostic-index={index}
            tabIndex={-1}
          >
            {canOpen(d) ? (
              <button
                className="diagnostic-source"
                onClick={() => onOpen(d)}
                title="Open this build’s source location"
              >
                {label}
              </button>
            ) : (
              <strong className="diagnostic-source">{label}</strong>
            )}
            <p className="diagnostic-original">{d.message}</p>
            {help && (
              <div className="diagnostic-help">
                <h4>{help.title}</h4>
                <p>{help.explanation}</p>
                <details>
                  <summary>What to check</summary>
                  <ul>
                    {help.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
            {job && d.severity !== "info" && (
              <button
                className="diagnostic-ai"
                disabled={fixDisabled}
                onClick={() => onFix(d, job)}
              >
                <Sparkles size={13} />
                Fix with AI
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
