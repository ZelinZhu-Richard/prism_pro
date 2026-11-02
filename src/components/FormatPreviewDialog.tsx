import { useEffect, useId, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import { Check, RefreshCw, Square } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "../api";
import {
  FormatPreview,
  type FormatPreviewView,
  type FormatTarget,
} from "../format-preview";
import type { FormatJob, FormatterStatus } from "../../shared/formatting";
import "./format-preview.css";

function difference(before: string, after: string) {
  const parts = diffLines(before, after, { timeout: 100 });
  if (!parts) return { rows: [], truncated: true };
  const rows: { text: string; kind: "added" | "removed" | "context" }[] = [];
  for (const part of parts)
    for (const match of part.value.matchAll(/[^\n]*\n|[^\n]+$/g)) {
      if (rows.length >= 800) return { rows, truncated: true };
      rows.push({
        text: match[0].replace(/\n$/, ""),
        kind: part.added ? "added" : part.removed ? "removed" : "context",
      });
    }
  return { rows, truncated: false };
}
export function FormatPreviewDialog({
  target,
  locked,
  onApply,
  onClose,
}: {
  target: FormatTarget;
  locked: boolean;
  onApply: (job: FormatJob) => Promise<void>;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<FormatterStatus>(),
    [checking, setChecking] = useState(true),
    [view, setView] = useState<FormatPreviewView>({ phase: "idle" }),
    [error, setError] = useState(""),
    [applying, setApplying] = useState(false),
    [display, setDisplay] = useState<"changes" | "formatted" | "original">(
      "changes",
    );
  const alive = useRef(true),
    controller = useRef<FormatPreview | null>(null),
    statusSerial = useRef(0),
    statusFocus = useRef<HTMLParagraphElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    id = useId();
  const base = `/projects/${target.projectId}`;
  function createController() {
    return new FormatPreview({
      create: (requestId, source) =>
        api<FormatJob>(base + "/format", "POST", {
          path: source.path,
          revision: source.revision,
          content: source.content,
          requestId,
        }),
      read: (requestId) => api<FormatJob>(base + "/format/" + requestId),
      cancel: (requestId) =>
        api(base + "/format/" + requestId + "/cancel", "POST", {}),
      id: () => crypto.randomUUID(),
      notify: setView,
    });
  }
  async function refresh(initial = false) {
    const serial = ++statusSerial.current;
    setChecking(true);
    setError("");
    try {
      if (!initial) await api("/tex-runtimes/refresh", "POST", {});
      const result = await api<FormatterStatus>(base + "/formatter");
      if (alive.current && serial === statusSerial.current) setStatus(result);
    } catch (e) {
      if (alive.current && serial === statusSerial.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && serial === statusSerial.current) setChecking(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    controller.current = createController();
    void refresh(true);
    return () => {
      alive.current = false;
      statusSerial.current++;
      controller.current?.dispose();
    };
  }, []);
  const job = view.job,
    active = !["idle", "finished"].includes(view.phase),
    replacement = job?.status === "succeeded" ? job.text : undefined,
    changes = useMemo(
      () =>
        replacement === undefined
          ? { rows: [], truncated: false }
          : difference(target.content, replacement),
      [target.content, replacement],
    ),
    unchanged = replacement === target.content;
  useEffect(() => {
    const statusElement = statusFocus.current,
      dialog = statusElement?.closest("dialog");
    if (dialog && !dialog.contains(document.activeElement))
      (errorFocus.current ?? statusElement)?.focus({ preventScroll: true });
  }, [view.phase, job?.status, error]);
  async function apply() {
    if (!job || job.status !== "succeeded" || locked || applying) return;
    setApplying(true);
    setError("");
    try {
      await onApply(job);
      if (alive.current) onClose();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setApplying(false);
    }
  }
  return (
    <Modal
      title="Format LaTeX source"
      onClose={onClose}
      dismissible={!applying}
      wide
      className="format-preview-dialog"
    >
      <p className="format-preview-path">{target.path}</p>
      <p className="modal-intro">
        Preview local latexindent formatting before applying it. It uses the
        tool’s default indentation; project and user YAML settings are ignored.
        Apply is one source edit that you can undo.
      </p>
      <div className="format-preview-body">
        <div className="format-preview-tool">
          <div>
            {checking ? (
              <p role="status">Checking the selected TeX installation…</p>
            ) : status?.available ? (
              <>
                <strong>latexindent · {status.runtime?.label}</strong>
                <p>{status.path}</p>
              </>
            ) : (
              <p role="status">
                {status?.problem ||
                  "The formatter could not be checked. Refresh to try again."}
              </p>
            )}
          </div>
          <button
            className="subtle"
            disabled={checking || active || applying}
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Refresh formatter
          </button>
        </div>
        {status && !status.available && (
          <p className="field-help">
            See the local tool’s installation requirements and Perl
            dependencies.{" "}
            <a
              href="https://latexindentpl.readthedocs.io/en/stable/sec-appendices.html"
              target="_blank"
              rel="noreferrer"
            >
              Installation documentation
            </a>
          </p>
        )}
        <p
          ref={statusFocus}
          tabIndex={-1}
          role="status"
          className="format-preview-status"
        >
          {view.phase === "starting"
            ? "Starting a local formatting preview…"
            : view.phase === "running"
              ? "Formatting a separate source snapshot…"
              : view.phase === "stopping"
                ? "Stopping the formatter; waiting for its processes to exit…"
                : view.phase === "uncertain"
                  ? "The request could not be confirmed."
                  : job?.status === "succeeded"
                    ? unchanged
                      ? "The formatter made no changes."
                      : "Formatting is ready for review. Your source has not been replaced."
                    : view.phase === "finished"
                      ? job?.status === "failed"
                        ? "Formatting failed. Your source is kept."
                        : "Formatting stopped. Your source is kept."
                      : "No formatting preview has started."}
        </p>
        {view.error && (
          <p role="alert" className="format-preview-error">
            {view.error}
          </p>
        )}
        {job?.error && (
          <p role="alert" className="format-preview-error">
            {job.error}
          </p>
        )}
        {replacement !== undefined && (
          <>
            <div
              role="group"
              aria-label="Formatting preview view"
              className="format-preview-views"
            >
              {(
                [
                  ["changes", "Changes"],
                  ["formatted", "Formatted source"],
                  ["original", "Original source"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  aria-pressed={display === mode}
                  onClick={() => setDisplay(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
            {display === "changes" ? (
              <div
                className="format-preview-diff"
                tabIndex={0}
                role="region"
                aria-label="Formatting changes"
              >
                <p className="field-help">− Removed source · + Added source</p>
                <pre>
                  {changes.rows.map((row, i) => (
                    <span key={i} className={row.kind}>
                      <span className="diff-line">
                        <b>
                          {row.kind === "added"
                            ? "+"
                            : row.kind === "removed"
                              ? "−"
                              : " "}
                        </b>
                        {row.text || " "}
                      </span>
                    </span>
                  ))}
                </pre>
                {changes.truncated && (
                  <p className="field-help">
                    The diff is limited to 800 lines or 100 ms. Read the
                    complete Formatted source and Original source views before
                    applying.
                  </p>
                )}
              </div>
            ) : (
              <div className="format-preview-source">
                <label className="field-label" htmlFor={id + "-source"}>
                  {display === "formatted"
                    ? "Complete formatted LaTeX"
                    : "Complete original LaTeX"}
                </label>
                <textarea
                  id={id + "-source"}
                  readOnly
                  spellCheck={false}
                  value={display === "formatted" ? replacement : target.content}
                />
              </div>
            )}
          </>
        )}
        {job?.log && (
          <details className="format-preview-log">
            <summary>Formatter log</summary>
            <pre>{job.log}</pre>
          </details>
        )}
      </div>
      {locked && (
        <p role="status" className="field-help">
          Source is read-only while another operation is active. You can inspect
          this preview.
        </p>
      )}
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          role="alert"
          className="format-preview-error"
        >
          {error}
        </p>
      )}
      <div className="format-preview-actions">
        <button className="subtle" disabled={applying} onClick={onClose}>
          Close
        </button>
        {view.phase === "uncertain" && (
          <button
            key="check"
            className="subtle"
            onClick={() => void controller.current?.refresh()}
          >
            Check request
          </button>
        )}
        <button
          key="format-action"
          className="subtle"
          disabled={
            active
              ? view.phase === "stopping"
              : checking || !status?.available || applying || locked
          }
          onClick={() => {
            if (active) void controller.current?.stop();
            else {
              setError("");
              void controller.current?.start(target);
            }
          }}
        >
          {active && <Square size={14} aria-hidden="true" />}
          {active
            ? view.phase === "stopping"
              ? "Stopping…"
              : "Stop formatting"
            : view.phase === "idle"
              ? "Preview formatting"
              : "Run formatting again"}
        </button>
        <button
          className="primary"
          disabled={
            replacement === undefined ||
            active ||
            unchanged ||
            locked ||
            applying
          }
          onClick={() => void apply()}
        >
          <Check size={14} aria-hidden="true" />
          {applying ? "Applying…" : "Apply formatting"}
        </button>
      </div>
    </Modal>
  );
}
