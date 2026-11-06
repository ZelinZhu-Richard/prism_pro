import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { CompileJob, Project } from "../../shared/types";
import {
  buildPreflightFindings,
  preflightCategories,
  type ManuscriptPreflight,
  type PreflightFinding,
} from "../../shared/manuscript-preflight";

const DISPLAY_LIMIT = 200;

export function ManuscriptPreflightPanel({
  project,
  job,
  buildMatches,
  diskUncertain,
  unsaved,
  onOpen,
  onLogs,
}: {
  project: Project;
  job?: CompileJob;
  buildMatches: boolean;
  diskUncertain: boolean;
  unsaved: boolean;
  onOpen: (
    finding: PreflightFinding,
    report: ManuscriptPreflight,
    signal: AbortSignal,
  ) => Promise<void>;
  onLogs: () => void;
}) {
  const [report, setReport] = useState<ManuscriptPreflight>();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const openRequest = useRef<AbortController | null>(null);
  const [opening, setOpening] = useState(false);
  const { id, generation, root } = project;
  useEffect(() => () => openRequest.current?.abort(), []);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    api<ManuscriptPreflight>(`/projects/${id}/preflight`, "GET", undefined, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
    })
      .then((result) => {
        if (request.signal.aborted) return;
        if (
          result.projectId !== id ||
          result.generation !== generation ||
          result.root !== root
        )
          throw new Error(
            "The project changed during preflight. Refresh the checks.",
          );
        setReport(result);
      })
      .catch((error: Error) => {
        if (!request.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [id, generation, root, attempt]);
  const saved =
    report?.generation === generation && report.root === root
      ? report
      : undefined;
  const diskCurrent = saved?.disk === "current" && !diskUncertain;
  const sourcesCurrent = diskCurrent && !unsaved && !loading && !error;
  const finished = job?.status === "failed" || job?.status === "succeeded";
  const buildCurrent = finished && buildMatches && sourcesCurrent;
  const buildFindings = useMemo(
    () => (finished ? buildPreflightFindings(job.diagnostics) : []),
    [finished, job],
  );
  const errors = buildFindings.filter(
    (item) => item.severity === "error",
  ).length;
  const summary = [
    [saved?.findings.length ?? 0, "source path finding"],
    [errors, "build error"],
    [buildFindings.length - errors, "build warning"],
  ]
    .map(([count, label]) => `${count} ${label}${count === 1 ? "" : "s"}`)
    .join(" · ");
  const filePaths = new Set(
    project.files
      .filter((file) => !file.deleted && file.kind === "text")
      .map((file) => file.path),
  );
  let buildStatus =
    "Compile the document to check unresolved citations, references, and layout warnings.";
  if (job && !finished)
    buildStatus =
      job.status === "cancelled"
        ? "The latest build was stopped. Compile again for build findings."
        : "Compilation is in progress.";
  if (finished) {
    buildStatus =
      job.status === "failed" ? "Build failed." : "Build succeeded.";
    if (job.options?.mode === "draft")
      buildStatus += " Fast draft mode can skip figures.";
    if (!buildCurrent)
      buildStatus +=
        " Findings describe the recorded build. Compile the current source and settings to refresh them.";
    else
      buildStatus += buildFindings.length
        ? " Findings match the saved project and build settings."
        : " No errors or warnings in this build.";
    if (job.status === "failed")
      buildStatus +=
        " Fix build errors before relying on citation and reference findings.";
  }

  async function open(finding: PreflightFinding) {
    if (!saved || openRequest.current) return;
    const request = new AbortController();
    openRequest.current = request;
    setOpening(true);
    setError("");
    try {
      await onOpen(finding, saved, request.signal);
    } catch (error) {
      if (!request.signal.aborted) setError((error as Error).message);
    } finally {
      openRequest.current = null;
      if (!request.signal.aborted) setOpening(false);
    }
  }
  function findings(items: readonly PreflightFinding[], canOpen: boolean) {
    return items.slice(0, DISPLAY_LIMIT).map((item, index) => {
      const label = `${item.severity === "error" ? "Error" : "Warning"} · ${preflightCategories[item.category]}`;
      const location =
        item.path && `${item.path}${item.line ? `:${item.line}` : ""}`;
      return (
        <article key={index} className={`compile-diagnostic ${item.severity}`}>
          <strong className="diagnostic-source">{label}</strong>
          <p className="diagnostic-original">{item.message}</p>
          {location &&
            (canOpen && item.path && filePaths.has(item.path) ? (
              <button
                className="diagnostic-source"
                disabled={opening}
                onClick={() => void open(item)}
              >
                Open {location}
              </button>
            ) : (
              <span className="diagnostic-source">{location}</span>
            ))}
        </article>
      );
    });
  }

  return (
    <div className="preflight-content">
      <p className="modal-intro">
        Review saved LaTeX paths and the latest build before sharing your
        manuscript. Source checks cover literal project paths. TeX resolves
        packages, macros, and conditional paths during compilation.
      </p>
      <div className="preflight-actions">
        <button
          className="subtle"
          disabled={loading || opening}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Refresh checks
        </button>
        {job && (
          <button className="subtle" onClick={onLogs}>
            View build log
          </button>
        )}
      </div>
      {error && (
        <p className="history-error" role="alert">
          {error}
        </p>
      )}
      <p className="diagnostic-result-count" role="status">
        {loading
          ? "Checking saved project files…"
          : saved
            ? summary
            : "Saved-source checks are unavailable."}
      </p>
      {unsaved && (
        <p className="diagnostic-location-note">
          Unsaved edits are excluded. Source links are available after saving.
        </p>
      )}
      {saved && !diskCurrent && (
        <p className="diagnostic-location-note">
          The saved index may differ from disk. Review changes with Check disk
          files, then refresh the checks.
        </p>
      )}
      <section
        className="compile-diagnostics"
        aria-label="Saved source path checks"
      >
        <h3>Saved source paths</h3>
        {saved && (
          <>
            <p className="diagnostic-location-note">
              {saved.scanned} source {saved.scanned === 1 ? "file" : "files"}{" "}
              checked{saved.root ? ` from ${saved.root}` : ""}.
              {!!saved.scanned &&
                !saved.findings.length &&
                " No missing literal paths found in the files checked."}
            </p>
            {saved.notes.map((note) => (
              <p className="diagnostic-location-note" key={note}>
                {note}
              </p>
            ))}
            {findings(saved.findings, sourcesCurrent)}
          </>
        )}
      </section>
      <section className="compile-diagnostics" aria-label="Build findings">
        <h3>Latest build</h3>
        <p className="diagnostic-location-note">{buildStatus}</p>
        {findings(buildFindings, buildCurrent)}
        {buildFindings.length > DISPLAY_LIMIT && (
          <p className="diagnostic-location-note">
            Showing the first 200 build findings. View the build log for the
            rest.
          </p>
        )}
      </section>
    </div>
  );
}
