import { useEffect, useRef, useState } from "react";
import { RefreshCw, Undo2, MapPin } from "lucide-react";
import { api } from "../api";
import {
  selectedTracked,
  type TrackingStatus,
  type TrackingFile,
  type TrackingResult,
  type TrackedHunk,
} from "../../shared/tracking";
interface Props {
  projectId: string;
  active: boolean;
  activePath: string;
  status?: TrackingStatus;
  current?: TrackingFile;
  error: string;
  locked: boolean;
  selection: { from: number; to: number };
  request?: { path: string; id?: number; nonce: number };
  prepare: () => Promise<void>;
  refresh: () => Promise<void>;
  onBusy: (busy: boolean) => void;
  onChanged: (r: TrackingResult) => Promise<void>;
  onNavigate: (file: TrackingFile, hunk: TrackedHunk) => Promise<void>;
}
export function TrackingPanel(p: Props) {
  const [scope, setScope] = useState("document"),
    [path, setPath] = useState(p.activePath),
    [file, setFile] = useState<TrackingFile>(),
    [selected, setSelected] = useState<number[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [confirm, setConfirm] = useState<{
      id: string;
      action: "accept" | "reject";
      file: TrackingFile;
      ids: number[];
    }>();
  const body = useRef<HTMLDivElement>(null),
    sequence = useRef(0),
    fileRef = useRef(file);
  fileRef.current = file;
  useEffect(() => {
    if (scope === "document") setPath(p.activePath);
  }, [p.activePath, scope]);
  useEffect(() => {
    if (p.request) {
      setPath(p.request.path);
      setScope(p.request.path === p.activePath ? "document" : "project");
      setSelected(p.request.id === undefined ? [] : [p.request.id]);
    }
  }, [p.request]);
  useEffect(() => {
    setConfirm(undefined);
    setSelected([]);
    setFile(undefined);
  }, [path]);
  const load = async () => {
    if (!path) {
      setFile(undefined);
      return;
    }
    const n = ++sequence.current;
    setLoading(true);
    try {
      const f = await api<TrackingFile>(
        `/projects/${p.projectId}/tracking/file?path=${encodeURIComponent(path)}`,
      );
      if (n === sequence.current) {
        if (fileRef.current?.token !== f.token) setSelected([]);
        setFile(f);
        setError("");
      }
    } catch (e) {
      if (n === sequence.current) {
        setFile(undefined);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (n === sequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (p.active) void load();
    return () => {
      ++sequence.current;
    };
  }, [p.active, path, p.status?.revision, p.current?.sourceRevision]);
  useEffect(() => {
    const id = p.request?.path === file?.path ? p.request?.id : undefined;
    if (id !== undefined && file?.hunks.some((h) => h.id === id)) {
      setSelected([id]);
      body.current
        ?.querySelector(`[data-tracked-id="${id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [p.request, file?.token]);
  const refresh = async () => {
    setConfirm(undefined);
    setSelected([]);
    await p.refresh();
    await load();
  };
  async function run(action: () => Promise<TrackingResult>) {
    if (busy || p.locked) return;
    setBusy(true);
    p.onBusy(true);
    setError("");
    try {
      await p.prepare();
      const r = await action();
      await p.onChanged(r);
      setConfirm(undefined);
      setSelected([]);
      await p.refresh();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      p.onBusy(false);
    }
  }
  function begin(action: "accept" | "reject", ids: number[]) {
    if (file && ids.length)
      setConfirm({ id: crypto.randomUUID(), action, file, ids });
  }
  const unavailable = p.status?.files.find((f) => f.path === path)?.unavailable,
    disabled = busy || p.locked;
  const staleConfirmation =
    !!confirm &&
    (!file ||
      confirm.file.token !== file.token ||
      confirm.file.sourceRevision !== file.sourceRevision ||
      confirm.file.reviewRevision !== file.reviewRevision);
  const inSelection =
    file && path === p.activePath
      ? file.hunks
          .filter((h) => selectedTracked(h, p.selection.from, p.selection.to))
          .map((h) => h.id)
      : [];
  return (
    <section
      className="tracking-panel"
      hidden={!p.active}
      aria-label="Tracked changes"
    >
      <div className="comments-heading">
        <strong>Changes</strong>
        <button
          aria-label="Refresh tracked changes"
          title="Refresh tracked changes"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="tracking-body" ref={body}>
        <p className="tracking-notice">
          {p.status?.enabled
            ? "Reviewing · edits are tracked."
            : "Editing · new edits are not tracked."}
        </p>
        <p className="tracking-notice">
          Current text compiles and exports. Edits touching pending passages
          remain tracked when tracking is off.
        </p>
        {(error || p.error) && (
          <div className="tracking-error" role="alert">
            {error || p.error}
            <button onClick={() => void refresh()} disabled={busy}>
              Refresh review
            </button>
          </div>
        )}
        {p.locked && !busy && (
          <p className="tracking-notice">
            Read-only while the assistant or a file operation owns the source.
          </p>
        )}
        <label>
          Scope
          <select
            aria-label="Tracked changes scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setConfirm(undefined);
            }}
          >
            <option value="document">Current file</option>
            <option value="project">Whole project</option>
          </select>
        </label>
        {scope === "project" && (
          <label>
            File
            <select
              aria-label="File to review"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setConfirm(undefined);
              }}
            >
              <option value="">Choose a file</option>
              {p.status?.files.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path} · {f.count}
                  {f.unavailable ? " · in Trash" : ""}
                </option>
              ))}
              {path && !p.status?.files.some((f) => f.path === path) && (
                <option value={path}>{path} · no changes</option>
              )}
            </select>
          </label>
        )}
        <p className="tracking-path">
          {path || "Open a text file to review changes."}
        </p>
        {p.status?.undo && (
          <button
            className="tracking-undo"
            disabled={disabled}
            title={p.status.undo.path}
            onClick={() =>
              void run(() =>
                api(
                  `/projects/${p.projectId}/tracking/${p.status!.undo!.id}/undo`,
                  "POST",
                  {},
                ),
              )
            }
          >
            <Undo2 size={13} />
            Undo last review
          </button>
        )}
        {unavailable ? (
          <p className="tracking-notice">
            Restore this file in Files before reviewing its pending changes.
          </p>
        ) : loading && !file ? (
          <p>Loading changes…</p>
        ) : !file?.hunks.length ? (
          <p className="tracking-empty">No pending changes in this file.</p>
        ) : (
          <>
            {file.limited && (
              <p className="tracking-notice">
                A large rewrite is grouped as one change. The complete source is
                preserved.
              </p>
            )}
            <div className="tracking-selection">
              <span>
                {file.hunks.length} pending · {selected.length} selected
              </span>
              <button
                disabled={disabled}
                onClick={() => setSelected(file.hunks.map((h) => h.id))}
              >
                Select all in file
              </button>
              <button
                disabled={disabled || !inSelection.length}
                onClick={() => setSelected(inSelection)}
              >
                Use editor selection ({inSelection.length})
              </button>
            </div>
            <div className="tracking-actions">
              <button
                disabled={disabled || !selected.length}
                onClick={() => begin("accept", selected)}
              >
                Accept selected
              </button>
              <button
                disabled={disabled || !selected.length}
                onClick={() => begin("reject", selected)}
              >
                Reject selected
              </button>
            </div>
            {confirm && (
              <section
                className="tracking-confirm"
                aria-label="Confirm tracked-change review"
              >
                <h3>
                  {confirm.action === "accept" ? "Accept" : "Reject"}{" "}
                  {confirm.ids.length}{" "}
                  {confirm.ids.length === 1 ? "change" : "changes"}?
                </h3>
                <p>
                  {confirm.action === "accept"
                    ? "Keep the current text and remove these review marks."
                    : "Restore the removed text and remove these insertions."}{" "}
                  Undo last review can recover this decision until the file
                  changes again.
                </p>
                {staleConfirmation && (
                  <p role="alert">
                    The source changed. Refresh review and choose again.
                  </p>
                )}
                <div className="tracking-actions">
                  <button
                    className="primary"
                    disabled={disabled || staleConfirmation}
                    onClick={() =>
                      void run(() =>
                        api(
                          `/projects/${p.projectId}/tracking/review`,
                          "POST",
                          {
                            id: confirm.id,
                            path: confirm.file.path,
                            action: confirm.action,
                            ids: confirm.ids,
                            sourceRevision: confirm.file.sourceRevision,
                            reviewRevision: confirm.file.reviewRevision,
                            token: confirm.file.token,
                          },
                        ),
                      )
                    }
                  >
                    Confirm {confirm.action === "accept" ? "Accept" : "Reject"}
                  </button>
                  <button disabled={busy} onClick={() => setConfirm(undefined)}>
                    Cancel
                  </button>
                </div>
              </section>
            )}
            <div className="tracking-hunks">
              {file.hunks.map((h) => (
                <article
                  data-tracked-id={h.id}
                  key={h.id}
                  aria-label={`Change ${h.id + 1}`}
                  className="tracking-hunk"
                >
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(h.id)}
                        disabled={disabled}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, h.id]
                              : ids.filter((i) => i !== h.id),
                          )
                        }
                      />
                      Change {h.id + 1} · line {h.line}
                    </label>
                    <button
                      aria-label={`Go to change ${h.id + 1}`}
                      title="Go to source passage"
                      onClick={() =>
                        void p
                          .onNavigate(file, h)
                          .catch((e) => setError(e.message))
                      }
                    >
                      <MapPin size={13} />
                    </button>
                  </div>
                  {h.before && (
                    <details open>
                      <summary>Removed · {h.before.length} characters</summary>
                      <pre className="tracking-removed" tabIndex={0}>
                        {h.before}
                      </pre>
                    </details>
                  )}
                  {h.after && (
                    <details open>
                      <summary>Added · {h.after.length} characters</summary>
                      <pre className="tracking-added" tabIndex={0}>
                        {h.after}
                      </pre>
                    </details>
                  )}
                  <div className="tracking-actions">
                    <button
                      disabled={disabled}
                      onClick={() => begin("accept", [h.id])}
                    >
                      Accept
                    </button>
                    <button
                      disabled={disabled}
                      onClick={() => begin("reject", [h.id])}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
