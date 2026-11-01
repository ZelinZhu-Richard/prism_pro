import { useEffect, useMemo, useState, useRef } from "react";
import { diffLines } from "diff";
import { api } from "../api";
import { HistoricalReview } from "./HistoricalReview";
import { VersionLabels } from "./VersionLabels";
import { labelMatches } from "../../shared/history-labels";
import type {
  HistoryRestorePlan,
  HistoryRestoreResult,
} from "../../shared/history-recovery";
import type {
  HistoryVersion,
  HistoryComparison,
  HistoryFile,
  Project,
} from "../../shared/types";
export function HistoryPanel({
  project,
  versions: initial,
  locked,
  onRestored,
  onCheckpoint,
  prepare,
  onBusy,
}: {
  project: Project;
  versions: HistoryVersion[];
  locked: boolean;
  onRestored: (p: Project) => Promise<void>;
  onCheckpoint: () => void;
  prepare: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [versions, setVersions] = useState(initial),
    [selected, setSelected] = useState(initial[0]?.id ?? ""),
    [target, setTarget] = useState("");
  const [comparison, setComparison] = useState<HistoryComparison | null>(null),
    [file, setFile] = useState(""),
    [contents, setContents] = useState<HistoryFile | null>(null);
  const [showAll, setShowAll] = useState(false),
    [loading, setLoading] = useState(false),
    [acting, setActing] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [timelineView, setTimelineView] = useState("all"),
    [labelQuery, setLabelQuery] = useState("");
  const [captureReviews, setCaptureReviews] = useState<boolean>(),
    [contentMode, setContentMode] = useState("source"),
    [restorePreview, setRestorePreview] = useState<{
      plan: HistoryRestorePlan;
      id: string;
      reviewToken?: string;
    }>(),
    [success, setSuccess] = useState("");
  const previewRef = useRef<HTMLElement>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (restorePreview) {
        previewRef.current?.scrollIntoView({ block: "nearest" });
        previewRef.current?.focus({ preventScroll: true });
      } else if (error) {
        errorRef.current?.scrollIntoView({ block: "nearest" });
        errorRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [restorePreview?.id, error]);
  const base = `/projects/${project.id}/checkpoints`,
    version = versions.find((v) => v.id === selected);
  useEffect(() => {
    let stale = false;
    void api<{ enabled: boolean }>(`/projects/${project.id}/history-settings`)
      .then((v) => {
        if (!stale) setCaptureReviews(v.enabled);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [project.id]);
  useEffect(() => {
    setRestorePreview(undefined);
    setSuccess("");
  }, [selected, file, target]);
  const suffix = target ? `?target=${encodeURIComponent(target)}` : "";
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError("");
    setComparison(null);
    setContents(null);
    if (!selected) {
      setLoading(false);
      return;
    }
    void api<HistoryComparison>(`${base}/${selected}/compare${suffix}`)
      .then((result) => {
        if (!stale) {
          setComparison(result);
          setFile((current) =>
            result.files.some(
              (f) =>
                f.path === current &&
                (f.change !== "unchanged" ||
                  result.reviews?.changedPaths.includes(f.path)),
            )
              ? current
              : (result.files.find((f) => f.change !== "unchanged")?.path ??
                result.files[0]?.path ??
                ""),
          );
        }
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
  }, [project.id, selected, target, refresh]);
  useEffect(() => {
    let stale = false;
    setContents(null);
    if (file && selected)
      void api<HistoryFile>(
        `${base}/${selected}/file?path=${encodeURIComponent(file)}${target ? "&target=" + encodeURIComponent(target) : ""}`,
      )
        .then((result) => {
          if (!stale) setContents(result);
        })
        .catch((e) => {
          if (!stale) setError(e.message);
        });
    return () => {
      stale = true;
    };
  }, [project.id, selected, target, file, refresh]);
  const changes = useMemo(
    () =>
      contents && contents.kind === "text"
        ? diffLines(contents.before ?? "", contents.after ?? "").map(
            (part) => ({ ...part, lines: part.value.split("\n") }),
          )
        : [],
    [contents],
  );
  const visible =
    comparison?.files.filter(
      (f) =>
        showAll ||
        f.change !== "unchanged" ||
        comparison.reviews?.changedPaths.includes(f.path),
    ) ?? [];
  const currentFile = comparison?.files.find((f) => f.path === file);
  async function restore(single: boolean, includeReview = true) {
    if (locked || acting || !version || (single && !currentFile)) return;
    if (target) {
      setTarget("");
      setError("Compare with Current project, then prepare the restore again.");
      return;
    }
    setActing(true);
    onBusy(true);
    setError("");
    setSuccess("");
    try {
      await prepare();
      const plan = await api<HistoryRestorePlan>(
        `${base}/${selected}/restore-preview`,
        "POST",
        {
          path: single ? file : undefined,
          includeReview,
          expectedRevision: currentFile?.currentRevision,
          expectedGeneration: comparison?.currentGeneration,
          expectedReviewToken: comparison?.reviews?.currentToken,
        },
      );
      setRestorePreview({
        plan,
        id: crypto.randomUUID(),
        reviewToken: comparison?.reviews?.currentToken,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
      onBusy(false);
    }
  }
  async function confirmRestore() {
    if (!restorePreview || locked || acting) return;
    const saved = restorePreview,
      { plan } = saved;
    setActing(true);
    onBusy(true);
    setError("");
    try {
      await prepare();
      const result = await api<HistoryRestoreResult>(
        `${base}/${plan.versionId}/${plan.path ? "restore-file" : "restore"}`,
        "POST",
        {
          id: saved.id,
          token: plan.token,
          path: plan.path,
          includeReview: plan.includeReview,
          expectedRevision: plan.currentRevision,
          expectedGeneration: plan.currentGeneration,
          expectedReviewToken: saved.reviewToken,
        },
      );
      await onRestored(result.project);
      setRestorePreview(undefined);
      setSuccess(
        "Version restored. Its pre-restore backup is in the timeline.",
      );
      setVersions(await api<HistoryVersion[]>(base));
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
      onBusy(false);
    }
  }
  async function configureHistory(enabled: boolean) {
    if (captureReviews === undefined || acting || locked) return;
    setActing(true);
    setError("");
    try {
      const result = await api<{ enabled: boolean }>(
        `/projects/${project.id}/history-settings`,
        "PUT",
        { enabled, expected: captureReviews },
      );
      setCaptureReviews(result.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }
  async function refreshHistory() {
    setActing(true);
    setError("");
    setRestorePreview(undefined);
    try {
      setVersions(await api<HistoryVersion[]>(base));
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }
  const timelineVersions = versions.filter((v) => {
    const active = (v.labels ?? []).filter((l) => !l.deletedAt);
    return (
      (timelineView === "all" || active.length > 0) &&
      (!labelQuery.trim() ||
        active.some((l) => labelMatches(l.name, labelQuery)))
    );
  });
  return (
    <div className="history-workspace">
      <p className="modal-intro">
        Automatic versions and named milestones. Compare first, then restore one
        file or the project. A pre-restore backup protects your current source;
        review recovery is explained in the preview.
      </p>
      {locked && !acting && (
        <p role="status" className="history-readonly">
          Read-only while another operation owns the source. You can still
          inspect versions and saved review.
        </p>
      )}
      <label className="history-capture">
        <input
          type="checkbox"
          checked={captureReviews ?? true}
          disabled={captureReviews === undefined || acting || locked}
          onChange={(e) => void configureHistory(e.target.checked)}
        />
        Include comments and tracked changes in future history snapshots
      </label>
      {success && (
        <p role="status" className="field-help">
          {success}
        </p>
      )}
      {error && !restorePreview && (
        <p role="alert" className="history-error" ref={errorRef} tabIndex={-1}>
          {error}
        </p>
      )}
      <div className="history-navigation">
        <div role="group" aria-label="History view">
          <button
            aria-pressed={timelineView === "all"}
            onClick={() => setTimelineView("all")}
          >
            All history
          </button>
          <button
            aria-pressed={timelineView === "labels"}
            onClick={() => setTimelineView("labels")}
          >
            Labels
          </button>
        </div>
        <label>
          Find a milestone
          <input
            type="search"
            aria-label="Search version labels"
            value={labelQuery}
            maxLength={120}
            placeholder="Search labels…"
            onChange={(e) => setLabelQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="history-grid">
        <nav className="history-timeline" aria-label="Project version timeline">
          <button
            className="primary"
            disabled={locked || acting}
            onClick={onCheckpoint}
          >
            Save named version
          </button>
          {timelineVersions.map((v) => (
            <button
              key={v.id}
              aria-pressed={selected === v.id}
              onClick={() => setSelected(v.id)}
              disabled={acting}
            >
              <span>{v.name}</span>
              {(v.labels ?? []).filter((l) => !l.deletedAt).length > 1 && (
                <span className="history-timeline-labels">
                  {(v.labels ?? [])
                    .filter((l) => !l.deletedAt)
                    .slice(1, 3)
                    .map((l) => (
                      <span key={l.id}>{l.name}</span>
                    ))}
                  {(v.labels ?? []).filter((l) => !l.deletedAt).length > 3 && (
                    <span>
                      +{(v.labels ?? []).filter((l) => !l.deletedAt).length - 3}{" "}
                      more labels
                    </span>
                  )}
                </span>
              )}
              <small>
                {(v.labels ?? []).some((l) => !l.deletedAt)
                  ? "Labeled"
                  : v.automatic
                    ? "Automatic"
                    : "Saved"}{" "}
                · {new Date(v.created).toLocaleString()}
                {v.reviewAvailable ? " · With review" : " · Source only"}
              </small>
            </button>
          ))}
          {!timelineVersions.length && (
            <p className="field-help">
              {labelQuery.trim()
                ? "No matching labels."
                : "No labeled versions yet. Add a label to a version in All history."}
            </p>
          )}
        </nav>
        <section className="history-comparison" aria-label="Version comparison">
          {version && !timelineVersions.some((v) => v.id === selected) && (
            <p className="history-filter-notice">
              The selected version is outside this filter.{" "}
              <button
                onClick={() => {
                  setLabelQuery("");
                  setTimelineView("all");
                }}
              >
                Show all history
              </button>
            </p>
          )}
          <div className="history-controls">
            <button disabled={acting} onClick={() => void refreshHistory()}>
              Refresh history
            </button>
            <label>
              Compare with
              <select
                aria-label="Compare version with"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={acting}
              >
                <option value="">Current project</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {new Date(v.created).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            {version && (
              <a
                className="subtle"
                href={`/api${base}/${selected}/export`}
                download
              >
                Download version ZIP
              </a>
            )}
          </div>
          {version && (
            <VersionLabels
              key={version.id}
              projectId={project.id}
              version={version}
              locked={locked}
              onWorking={setActing}
              onUpdated={(updated) =>
                setVersions((all) =>
                  all.map((v) => (v.id === updated.id ? updated : v)),
                )
              }
            />
          )}
          <div className="history-summary" role="status">
            {loading
              ? "Loading comparison…"
              : `${comparison?.files.filter((f) => f.change !== "unchanged").length ?? 0} changed file${comparison?.files.filter((f) => f.change !== "unchanged").length === 1 ? "" : "s"}`}
            {comparison?.settingsChanged ? " · Compiler settings changed" : ""}
            {comparison?.reviews?.changed === true
              ? " · Review state differs"
              : comparison?.reviews?.changed === false
                ? " · Review state matches"
                : " · Saved review state unavailable"}
          </div>
          <div
            className="history-content-toggle"
            role="group"
            aria-label="Version content"
          >
            <button
              aria-pressed={contentMode === "source"}
              onClick={() => setContentMode("source")}
            >
              Source comparison
            </button>
            <button
              aria-pressed={contentMode === "review"}
              onClick={() => setContentMode("review")}
            >
              Saved review
            </button>
          </div>
          <div hidden={contentMode !== "source"}>
            <label className="history-show-all">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              Show unchanged files
            </label>
            <div className="history-file-list" aria-label="Files in comparison">
              {visible.map((f) => (
                <button
                  key={f.path}
                  aria-pressed={file === f.path}
                  onClick={() => {
                    setFile(f.path);
                    setRestorePreview(undefined);
                  }}
                >
                  <span>{f.path}</span>
                  <small>
                    {f.change}
                    {comparison?.reviews?.changedPaths.includes(f.path)
                      ? " · review"
                      : ""}
                  </small>
                </button>
              ))}
              {!loading && !visible.length && (
                <p>No source differences between these versions.</p>
              )}
            </div>
            {contents && currentFile && (
              <div className="history-file-preview">
                <div className="history-file-heading">
                  <strong>{file}</strong>
                  <span>
                    − Selected version / +{" "}
                    {target ? "Compared version" : "Current project"}
                  </span>
                </div>
                {contents.kind === "text" ? (
                  <pre
                    className="history-source-diff"
                    aria-label="Historical source diff"
                  >
                    {changes.map((part, i) => (
                      <span
                        key={i}
                        className={
                          part.added ? "added" : part.removed ? "removed" : ""
                        }
                      >
                        {part.lines.map((line, n) =>
                          n === part.lines.length - 1 && !line ? null : (
                            <span className="diff-line" key={n}>
                              <b>
                                {part.added ? "+" : part.removed ? "−" : " "}
                              </b>
                              {line || " "}
                            </span>
                          ),
                        )}
                      </span>
                    ))}
                  </pre>
                ) : (
                  <p className="field-help">
                    Binary asset: download the version ZIP to inspect its
                    original contents.
                  </p>
                )}
              </div>
            )}
          </div>
          <HistoricalReview
            key={project.id + "/" + selected}
            projectId={project.id}
            versionId={selected}
            active={contentMode === "review"}
            initialPath={file}
            onFile={(path) => {
              setFile(path);
              setRestorePreview(undefined);
            }}
          />
          <div className="history-actions">
            <button
              disabled={locked || acting || loading || !currentFile?.restorable}
              onClick={() => void restore(true)}
            >
              Restore {file || "selected file"}
            </button>
            <button
              disabled={locked || acting || loading || !version}
              onClick={() => void restore(false)}
            >
              Restore whole version
            </button>
          </div>
          {restorePreview && (
            <section
              className="history-restore-preview"
              aria-label="Restore preview"
              ref={previewRef}
              tabIndex={-1}
            >
              <h3>Restore {restorePreview.plan.path ?? "whole project"}</h3>
              {error && (
                <p className="history-error" role="alert">
                  {error}
                </p>
              )}
              <p>
                From <strong>{restorePreview.plan.versionName}</strong> ·{" "}
                {restorePreview.plan.sourceFiles}{" "}
                {restorePreview.plan.sourceFiles === 1 ? "file" : "files"}. This
                replaces the current version, independently of the comparison
                target.
              </p>
              <label className="history-capture">
                <input
                  type="checkbox"
                  checked={restorePreview.plan.includeReview}
                  disabled={
                    acting || locked || !restorePreview.plan.reviewAvailable
                  }
                  onChange={(e) =>
                    void restore(!!restorePreview.plan.path, e.target.checked)
                  }
                />
                Restore saved comments and pending tracked changes
              </label>
              {!restorePreview.plan.includeReview && (
                <p className="field-help">
                  {restorePreview.plan.reviewReason} Current review is kept and
                  mapped to the restored source, following the current source
                  tracking mode.
                </p>
              )}
              {restorePreview.plan.includeReview && (
                <p className="field-help">
                  Current: {restorePreview.plan.currentReview.threads}{" "}
                  {restorePreview.plan.currentReview.threads === 1
                    ? "thread"
                    : "threads"}
                  , {restorePreview.plan.currentReview.messages}{" "}
                  {restorePreview.plan.currentReview.messages === 1
                    ? "message"
                    : "messages"}
                  . Saved: {restorePreview.plan.savedReview.threads}{" "}
                  {restorePreview.plan.savedReview.threads === 1
                    ? "thread"
                    : "threads"}
                  , {restorePreview.plan.savedReview.messages}{" "}
                  {restorePreview.plan.savedReview.messages === 1
                    ? "message"
                    : "messages"}
                  , {restorePreview.plan.savedReview.trackedFiles}{" "}
                  {restorePreview.plan.savedReview.trackedFiles === 1
                    ? "file"
                    : "files"}{" "}
                  with pending changes. Newer discussion remains recoverable in
                  comment Trash and the pre-restore backup.{" "}
                  {restorePreview.plan.copiedThreads > 0
                    ? `${restorePreview.plan.copiedThreads} moved thread(s) will be copied so discussion in other files stays intact.`
                    : ""}
                </p>
              )}
              <p className="field-help">
                {restorePreview.plan.path
                  ? "Other files and compiler settings stay current."
                  : `Compiler: ${restorePreview.plan.engine} · root: ${restorePreview.plan.root || "none"}. Newer files move to file Trash.`}{" "}
                Chats and Editing/Reviewing mode stay current.
              </p>
              <div className="history-actions">
                <button
                  className="primary"
                  disabled={acting || locked}
                  onClick={() => void confirmRestore()}
                >
                  Confirm restore
                </button>
                <button
                  disabled={acting}
                  onClick={() => {
                    setRestorePreview(undefined);
                    setError("");
                  }}
                >
                  Cancel restore
                </button>
              </div>
            </section>
          )}
          {acting && <p role="status">Preparing or saving history…</p>}
        </section>
      </div>
    </div>
  );
}
