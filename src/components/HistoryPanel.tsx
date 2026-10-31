import { useEffect, useMemo, useState } from "react";
import { diffLines } from "diff";
import { api } from "../api";
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
}: {
  project: Project;
  versions: HistoryVersion[];
  locked: boolean;
  onRestored: (p: Project) => Promise<void>;
  onCheckpoint: () => void;
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
    [label, setLabel] = useState(""),
    [refresh, setRefresh] = useState(0);
  const base = `/projects/${project.id}/checkpoints`,
    version = versions.find((v) => v.id === selected);
  const suffix = target ? `?target=${encodeURIComponent(target)}` : "";
  useEffect(() => {
    setLabel(version?.automatic ? "" : (version?.name ?? ""));
  }, [selected, version?.name, version?.automatic]);
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
              (f) => f.path === current && f.change !== "unchanged",
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
    comparison?.files.filter((f) => showAll || f.change !== "unchanged") ?? [];
  const currentFile = visible.find((f) => f.path === file);
  async function restore(single: boolean) {
    if (locked || acting || !version || (single && !currentFile)) return;
    setActing(true);
    setError("");
    try {
      const p = await api<Project>(
        `${base}/${selected}/${single ? "restore-file" : "restore"}`,
        "POST",
        single
          ? { path: file, expectedRevision: currentFile!.currentRevision }
          : {},
      );
      await onRestored(p);
      setVersions(await api<HistoryVersion[]>(base));
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }
  async function saveLabel() {
    setActing(true);
    setError("");
    try {
      setVersions(
        await api<HistoryVersion[]>(`${base}/${selected}`, "PATCH", {
          name: label,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }
  async function refreshHistory() {
    setActing(true);
    setError("");
    try {
      setVersions(await api<HistoryVersion[]>(base));
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }
  return (
    <div className="history-workspace">
      <p className="modal-intro">
        Automatic versions and named milestones. Compare first, then restore one
        file or the project. Your current state is backed up before a restore.
      </p>
      {error && (
        <p role="alert" className="history-error">
          {error}
        </p>
      )}
      <div className="history-grid">
        <nav className="history-timeline" aria-label="Project version timeline">
          <button
            className="primary"
            disabled={locked || acting}
            onClick={onCheckpoint}
          >
            Save named version
          </button>
          {versions.map((v) => (
            <button
              key={v.id}
              aria-pressed={selected === v.id}
              onClick={() => setSelected(v.id)}
              disabled={acting}
            >
              <span>{v.name}</span>
              <small>
                {v.automatic ? "Automatic" : "Named"} ·{" "}
                {new Date(v.created).toLocaleString()}
              </small>
            </button>
          ))}
        </nav>
        <section className="history-comparison" aria-label="Version comparison">
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
            <form
              className="history-label"
              onSubmit={(e) => {
                e.preventDefault();
                void saveLabel();
              }}
            >
              <input
                aria-label="Version label"
                placeholder="Name this milestone…"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
              />
              <button disabled={!label.trim() || acting}>Save label</button>
            </form>
          )}
          <div className="history-summary" role="status">
            {loading
              ? "Loading comparison…"
              : `${comparison?.files.filter((f) => f.change !== "unchanged").length ?? 0} changed file${comparison?.files.filter((f) => f.change !== "unchanged").length === 1 ? "" : "s"}`}
            {comparison?.settingsChanged ? " · Compiler settings changed" : ""}
          </div>
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
                onClick={() => setFile(f.path)}
              >
                <span>{f.path}</span>
                <small>{f.change}</small>
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
                            <b>{part.added ? "+" : part.removed ? "−" : " "}</b>
                            {line || " "}
                          </span>
                        ),
                      )}
                    </span>
                  ))}
                </pre>
              ) : (
                <p className="field-help">
                  Binary asset: download the version ZIP to inspect its original
                  contents.
                </p>
              )}
            </div>
          )}
          <div className="history-actions">
            <button
              disabled={locked || acting || loading || !currentFile?.restorable}
              onClick={() => void restore(true)}
            >
              Restore selected file
            </button>
            <button
              disabled={locked || acting || loading || !version}
              onClick={() => void restore(false)}
            >
              Restore whole version
            </button>
          </div>
          {acting && <p role="status">Saving…</p>}
        </section>
      </div>
    </div>
  );
}
