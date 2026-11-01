import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { HistoryVersion } from "../../shared/types";
import {
  LABEL_NAME_LIMIT,
  ACTIVE_LABEL_LIMIT,
  type HistoryLabelRequest,
} from "../../shared/history-labels";
export function VersionLabels({
  projectId,
  version,
  locked,
  onUpdated,
  onWorking,
}: {
  projectId: string;
  version: HistoryVersion;
  locked: boolean;
  onUpdated: (version: HistoryVersion) => void;
  onWorking: (working: boolean) => void;
}) {
  const [name, setName] = useState(""),
    [editing, setEditing] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [needsRefresh, setNeedsRefresh] = useState(false),
    [pending, setPending] = useState<HistoryLabelRequest>();
  const inputRef = useRef<HTMLInputElement>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  const labels = version.labels ?? [],
    active = labels.filter((l) => !l.deletedAt),
    removed = labels.filter((l) => l.deletedAt),
    base = `/projects/${projectId}/checkpoints/${version.id}/labels`;
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function submit(request: HistoryLabelRequest) {
    if (locked || working) return;
    setWorking(true);
    onWorking(true);
    setError("");
    setNotice("");
    setPending(request);
    try {
      const result = await api<{ version: HistoryVersion }>(
        base,
        "POST",
        request,
      );
      onUpdated(result.version);
      setPending(undefined);
      setNotice(
        request.action === "remove"
          ? "Label removed. Recover it under Removed labels."
          : request.action === "restore"
            ? "Label restored."
            : "Label saved.",
      );
      if (request.action === "add" || request.action === "rename") {
        setName("");
        setEditing("");
      }
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        setPending(undefined);
        setNeedsRefresh(e.status === 409 || e.status === 404);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
      onWorking(false);
    }
  }
  async function refresh() {
    if (working) return;
    setWorking(true);
    onWorking(true);
    setError("");
    try {
      onUpdated(await api<HistoryVersion>(base));
      setPending(undefined);
      setNeedsRefresh(false);
      setNotice(
        "Labels refreshed. Check the saved names before submitting again.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
      onWorking(false);
    }
  }
  function action(kind: HistoryLabelRequest["action"], labelId?: string) {
    void submit({
      id: crypto.randomUUID(),
      expectedRevision: version.labelRevision ?? 0,
      action: kind,
      labelId,
      ...(kind === "add" || kind === "rename" ? { name } : {}),
    });
  }
  const disabled = locked || working || !!pending || needsRefresh;
  return (
    <section className="version-labels" aria-label="Version labels">
      <p className="history-version-identity">
        {version.name}
        <span>Saved {new Date(version.created).toLocaleString()}</span>
      </p>
      <div className="version-label-heading">
        <h3>Labels</h3>
        <button disabled={working} onClick={() => void refresh()}>
          Refresh labels
        </button>
      </div>
      {active.length ? (
        <ul className="version-label-list">
          {active.map((l) => (
            <li key={l.id}>
              <span>{l.name}</span>
              <div>
                <button
                  aria-label={`Rename label ${l.name}`}
                  disabled={disabled}
                  onClick={() => {
                    setEditing(l.id);
                    setName(l.name);
                    setNotice("");
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                >
                  Rename
                </button>
                <button
                  aria-label={`Remove label ${l.name}`}
                  disabled={disabled}
                  onClick={() => action("remove", l.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-help">No labels on this version yet.</p>
      )}
      <form
        className="version-label-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && name.trim())
            action(editing ? "rename" : "add", editing || undefined);
        }}
      >
        <label htmlFor="version-label-name">
          {editing ? "Rename label" : "Add a label"}
        </label>
        <div>
          <input
            id="version-label-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LABEL_NAME_LIMIT}
            disabled={disabled}
            placeholder="e.g. Ready for review"
          />
          <button
            disabled={
              disabled ||
              !name.trim() ||
              (!editing && active.length >= ACTIVE_LABEL_LIMIT)
            }
          >
            {editing ? "Save label" : "Add label"}
          </button>
          {editing && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setEditing("");
                setName("");
              }}
            >
              Cancel rename
            </button>
          )}
        </div>
      </form>
      {active.length >= ACTIVE_LABEL_LIMIT && (
        <p className="field-help">
          This version has 100 active labels. Rename or remove a label before
          adding another.
        </p>
      )}
      {error && (
        <p className="history-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {pending && !working && (
        <div className="version-label-retry">
          <p>
            A response may have been lost. Retry this same action safely, or
            refresh labels before making another change. Your draft is kept.
          </p>
          <button disabled={locked} onClick={() => void submit(pending)}>
            Retry label action
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="field-help">
          {notice}
        </p>
      )}
      {!!removed.length && (
        <details className="version-label-removed">
          <summary>Removed labels ({removed.length})</summary>
          <ul className="version-label-list">
            {removed.map((l) => (
              <li key={l.id}>
                <span>{l.name}</span>
                <button
                  aria-label={`Restore label ${l.name}`}
                  disabled={disabled}
                  onClick={() => action("restore", l.id)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
