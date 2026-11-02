import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { Modal } from "./Modal";
import {
  TAG_COLORS,
  type LibraryAction,
  type LibraryDownload,
  type LibraryPreview,
  type LibraryResult,
  type LibraryState,
  type ProjectTag,
} from "../../shared/library";
import "./library.css";
import { TagDot } from "./TagDot";
export function TagManager({
  state,
  onState,
  onRefresh,
  onClose,
}: {
  state: LibraryState;
  onState: (s: LibraryState) => void;
  onRefresh: () => Promise<LibraryState>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<ProjectTag>(),
    [name, setName] = useState(""),
    [hex, setHex] = useState("#808080"),
    [removed, setRemoved] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [pending, setPending] = useState<Record<string, unknown>>();
  const formId = useId(),
    errorRef = useRef<HTMLParagraphElement>(null),
    nameRef = useRef<HTMLInputElement>(null),
    valid = /^#[a-f\d]{6}$/i.test(hex),
    disabled = working || !!pending;
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function reset() {
    setEditing(undefined);
    setName("");
    setHex("#808080");
    setError("");
  }
  function edit(tag: ProjectTag) {
    setEditing(tag);
    setName(tag.name);
    setHex(tag.color);
    setError("");
    setNotice("");
    requestAnimationFrame(() => nameRef.current?.focus());
  }
  async function refresh() {
    setWorking(true);
    setError("");
    try {
      const next = await onRefresh();
      if (editing) setEditing(next.tags.find((t) => t.id === editing.id));
      setNotice("Tags refreshed. Your name and color draft are retained.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function execute(request: Record<string, unknown>) {
    if (working) return;
    setWorking(true);
    setPending(request);
    setError("");
    setNotice("");
    try {
      const result = await api<LibraryResult>("/library/tags", "POST", request);
      onState(result.state);
      setPending(undefined);
      if (request.action === "create" || request.action === "update") reset();
      setNotice(
        request.action === "trash"
          ? "Tag moved to Removed tags. Its project memberships are kept."
          : request.action === "restore"
            ? "Tag restored with its project memberships."
            : "Tag saved.",
      );
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status < 500) setPending(undefined);
    } finally {
      setWorking(false);
    }
  }
  function channel(index: number, value: string) {
    if (value === "") return;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 255) return;
    const rgb = [0, 1, 2].map((i) =>
      parseInt((valid ? hex : "#808080").slice(1 + i * 2, 3 + i * 2), 16),
    );
    rgb[index] = n;
    setHex("#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join(""));
  }
  return (
    <Modal
      title="Project tags"
      wide
      className="library-dialog"
      onClose={onClose}
      dismissible={!working}
    >
      {error && (
        <p
          className="library-dialog-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </p>
      )}
      {pending && !working && (
        <div className="library-retry">
          <p>
            The change may already be saved. Retry the same request to recover
            it.
          </p>
          <button onClick={() => void execute(pending)}>
            Retry tag change
          </button>
        </div>
      )}
      {notice && (
        <p className="library-dialog-notice" role="status">
          {notice}
        </p>
      )}
      <div className="library-dialog-body">
        <p className="field-help">
          Tags organize projects on this computer. Removing a tag keeps its
          memberships for restoration; project source and history stay
          unchanged.
        </p>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled && name.trim() && valid)
              void execute({
                id: crypto.randomUUID(),
                action: editing ? "update" : "create",
                ...(editing
                  ? { tag: editing.id, expectedRevision: editing.revision }
                  : {}),
                name,
                color: hex,
              });
          }}
        >
          <h3>{editing ? "Edit tag" : "Create a tag"}</h3>
          <label className="library-field">
            Tag name
            <input
              autoFocus
              ref={nameRef}
              maxLength={120}
              value={name}
              disabled={disabled}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <fieldset className="library-colors" disabled={disabled}>
            <legend>Tag color</legend>
            <div className="library-color-presets">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use color ${c}`}
                  aria-pressed={hex.toLowerCase() === c}
                  onClick={() => setHex(c)}
                >
                  <TagDot color={c} />
                </button>
              ))}
            </div>
            <div className="library-color-fields">
              <label className="library-field">
                Color picker
                <input
                  type="color"
                  value={valid ? hex : "#808080"}
                  onChange={(e) => setHex(e.target.value)}
                />
              </label>
              <label className="library-field">
                HEX color
                <input
                  value={hex}
                  required
                  pattern="#[a-fA-F0-9]{6}"
                  maxLength={7}
                  onChange={(e) => setHex(e.target.value)}
                />
              </label>
              <div className="library-rgb-fields">
                {["Red", "Green", "Blue"].map((label, i) => (
                  <label className="library-field" key={label}>
                    {label}
                    <input
                      type="number"
                      min={0}
                      max={255}
                      step={1}
                      value={
                        valid
                          ? parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
                          : ""
                      }
                      onChange={(e) => channel(i, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
          {editing && (
            <button
              type="button"
              className="library-small-action"
              disabled={disabled}
              onClick={reset}
            >
              Cancel tag edit
            </button>
          )}
        </form>
        <div className="library-tag-tools">
          <div role="group" aria-label="Tag collection">
            <button
              aria-pressed={!removed}
              disabled={disabled}
              onClick={() => setRemoved(false)}
            >
              Active tags
            </button>
            <button
              aria-pressed={removed}
              disabled={disabled}
              onClick={() => setRemoved(true)}
            >
              Removed tags
            </button>
          </div>
          <button disabled={disabled} onClick={() => void refresh()}>
            Refresh tags
          </button>
        </div>
        <ul
          className="library-tag-list"
          aria-label={removed ? "Removed tags" : "Active tags"}
        >
          {state.tags
            .filter((t) => !!t.deletedAt === removed)
            .map((tag) => (
              <li key={tag.id}>
                <TagDot color={tag.color} />
                <span>{tag.name}</span>
                <div>
                  <button
                    disabled={disabled}
                    aria-label={`Edit tag ${tag.name}`}
                    onClick={() => edit(tag)}
                  >
                    Edit
                  </button>
                  <button
                    disabled={disabled}
                    aria-label={`${removed ? "Restore" : "Remove"} tag ${tag.name}`}
                    onClick={() =>
                      void execute({
                        id: crypto.randomUUID(),
                        action: removed ? "restore" : "trash",
                        tag: tag.id,
                        expectedRevision: tag.revision,
                      })
                    }
                  >
                    {removed ? "Restore" : "Remove"}
                  </button>
                </div>
              </li>
            ))}
        </ul>
        {!state.tags.some((t) => !!t.deletedAt === removed) && (
          <p className="field-help">
            {removed ? "No removed tags." : "No tags yet. Create one above."}
          </p>
        )}
      </div>
      <div className="library-dialog-footer">
        <button
          className="primary"
          type="submit"
          form={formId}
          disabled={disabled || !name.trim() || !valid}
        >
          {working ? "Saving…" : editing ? "Save tag" : "Create tag"}
        </button>
        <button disabled={working} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
const labels: Record<LibraryAction, string> = {
  archive: "Archive projects",
  unarchive: "Unarchive projects",
  trash: "Move projects to Trash",
  restore: "Restore projects",
  "tag-add": "Tag projects",
  "tag-remove": "Tag projects",
  export: "Download project sources",
};
export function LibraryActionDialog({
  action: initial,
  projects,
  projectNames,
  state,
  onRefresh,
  onApplied,
  onClose,
}: {
  action: LibraryAction;
  projects: string[];
  projectNames: Record<string, string>;
  state: LibraryState;
  onRefresh: () => Promise<LibraryState>;
  onApplied: (state: LibraryState) => Promise<void>;
  onClose: () => void;
}) {
  const [action, setAction] = useState(initial),
    [tags, setTags] = useState<string[]>([]),
    [preview, setPreview] = useState<LibraryPreview>(),
    [loading, setLoading] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [download, setDownload] = useState<LibraryDownload>(),
    [requested, setRequested] = useState(false),
    [committed, setCommitted] = useState(false),
    [pending, setPending] = useState<{ id: string; preview: LibraryPreview }>();
  const errorRef = useRef<HTMLParagraphElement>(null),
    signature = JSON.stringify([
      action,
      [...projects].sort(),
      [...tags].sort(),
    ]),
    disabled = working || !!pending;
  useEffect(() => {
    let stale = false;
    setPreview(undefined);
    setDownload(undefined);
    setRequested(false);
    setCommitted(false);
    setError("");
    if (action.startsWith("tag-") && !tags.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void api<LibraryPreview>("/library/preview", "POST", {
      action,
      projects,
      tags,
    })
      .then((p) => {
        if (!stale) setPreview(p);
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
  }, [signature, refresh]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function refreshPreview() {
    if (disabled) return;
    setLoading(true);
    setError("");
    try {
      await onRefresh();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }
  async function execute(request: { id: string; preview: LibraryPreview }) {
    if (working) return;
    setWorking(true);
    setError("");
    if (action !== "export") setPending(request);
    let didCommit = false;
    try {
      if (action === "export") {
        const prepared = await api<LibraryDownload>(
          "/library/exports",
          "POST",
          request.preview,
        );
        setDownload(prepared);
        setRequested(false);
      } else {
        const result = await api<LibraryResult>(
          "/library/apply",
          "POST",
          request,
        );
        didCommit = true;
        setCommitted(true);
        setPending(undefined);
        await onApplied(result.state);
        onClose();
      }
    } catch (e) {
      setError(
        didCommit
          ? "The action was saved, but the library could not refresh. Close this review and refresh the project library."
          : (e as Error).message,
      );
      if (didCommit || (e instanceof ApiError && e.status < 500))
        setPending(undefined);
    } finally {
      setWorking(false);
    }
  }
  const description =
    action === "archive"
      ? "Archived projects stay available in Archived and remain editable. They are hidden from Your projects and Recently edited."
      : action === "unarchive"
        ? "Return the selected archived projects to Your projects."
        : action === "trash"
          ? "Move the selected projects to recoverable Trash. Files, history, tags, archive status and conversations are kept."
          : action === "restore"
            ? "Restore the selected projects. Previously archived projects return to Archived; others return to Your projects."
            : action === "export"
              ? "Download one source ZIP per project inside a single ZIP. Active files, assets and empty folders are included; compiled PDFs, history, chats and credentials are excluded."
              : "Add or remove the checked tags across this exact selection. Other tags and project source stay unchanged.";
  return (
    <Modal
      title={labels[action]}
      wide
      className="library-dialog"
      onClose={onClose}
      dismissible={!working}
    >
      {error && (
        <p
          className="library-dialog-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </p>
      )}
      {pending && !working && (
        <div className="library-retry">
          <p>The action may already be saved. Retry the same request safely.</p>
          <button onClick={() => void execute(pending)}>
            Retry project action
          </button>
        </div>
      )}
      <div className="library-dialog-body">
        <p className="library-action-description">{description}</p>
        {action.startsWith("tag-") && (
          <>
            <div
              role="group"
              aria-label="Tag operation"
              className="library-tag-tools library-tag-operation"
            >
              <button
                disabled={disabled}
                aria-pressed={action === "tag-add"}
                onClick={() => setAction("tag-add")}
              >
                Add tags
              </button>
              <button
                disabled={disabled}
                aria-pressed={action === "tag-remove"}
                onClick={() => setAction("tag-remove")}
              >
                Remove tags
              </button>
            </div>
            <fieldset className="library-tag-choices" disabled={disabled}>
              <legend>Choose tags</legend>
              {state.tags
                .filter((t) => !t.deletedAt)
                .map((t) => (
                  <label key={t.id}>
                    <input
                      type="checkbox"
                      checked={tags.includes(t.id)}
                      onChange={(e) =>
                        setTags((old) =>
                          e.target.checked
                            ? [...old, t.id]
                            : old.filter((id) => id !== t.id),
                        )
                      }
                    />
                    <TagDot color={t.color} />
                    <span>{t.name}</span>
                  </label>
                ))}
            </fieldset>
            {!state.tags.some((t) => !t.deletedAt) && (
              <p className="field-help">Create a tag in Project tags first.</p>
            )}
          </>
        )}
        {loading && <p role="status">Reviewing selected projects…</p>}
        {preview && (
          <>
            <p className="field-help">
              {action === "export"
                ? `${preview.targets.length} source ZIPs · ${Math.ceil(preview.bytes / 1024).toLocaleString()} KiB before compression · ${preview.entries.toLocaleString()} entries`
                : `${preview.changes} of ${preview.targets.length} selected projects will change.`}
            </p>
          </>
        )}
        <h3>{preview ? "Reviewed projects" : "Selected projects"}</h3>
        <ul
          className="library-targets"
          aria-label={preview ? "Reviewed projects" : "Selected projects"}
        >
          {(
            preview?.targets ??
            projects.map((id) => ({
              id,
              name: projectNames[id] ?? id,
              archivedAt: state.projects.find((p) => p.id === id)?.archivedAt,
            }))
          ).map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong>
              <span>
                {action === "restore"
                  ? p.archivedAt
                    ? "Returns to Archived"
                    : "Returns to Your projects"
                  : p.archivedAt
                    ? "Archived"
                    : "Your projects"}
              </span>
            </li>
          ))}
        </ul>
        {committed && (
          <p role="status" className="field-help">
            The reviewed action is saved. Refresh the library to see its current
            state.
          </p>
        )}
        {download && (
          <div className="library-download-status" role="status">
            <strong>{requested ? "Download requested" : "ZIP prepared"}</strong>
            <p>
              {Math.max(1, Math.ceil(download.bytes / 1024)).toLocaleString()}{" "}
              KiB · {download.projects} project ZIPs.{" "}
              {requested
                ? "Check your browser's downloads. If no file appears, use Download ZIP again or prepare it again."
                : "Select Download ZIP to request a save in your browser. This review stays open."}
            </p>
            <p>
              If the link expires or Leaf restarts, choose Prepare ZIP again.
            </p>
          </div>
        )}
        {action === "export" && (
          <p className="field-help">
            Up to 20 projects, 100 MiB of source and 10,000 entries per
            download. Unzip the outer archive to access each independent project
            ZIP.
          </p>
        )}
      </div>
      <div className="library-dialog-footer">
        {download && (
          <a
            className="primary library-download-link"
            href={download.url}
            download="selected-projects.zip"
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={working || loading}
            onClick={(e) => {
              if (working || loading) e.preventDefault();
              else setRequested(true);
            }}
          >
            Download ZIP
          </a>
        )}
        <button
          className={download ? "" : "primary"}
          disabled={disabled || loading || !preview || committed}
          onClick={() =>
            preview && void execute({ id: crypto.randomUUID(), preview })
          }
        >
          {working
            ? "Working…"
            : action === "export"
              ? download
                ? "Prepare ZIP again"
                : error
                  ? "Retry prepare ZIP"
                  : "Prepare ZIP"
              : "Confirm " +
                (action === "tag-add"
                  ? "Add tags"
                  : action === "tag-remove"
                    ? "Remove tags"
                    : action === "trash"
                      ? "Move to Trash"
                      : action === "restore"
                        ? "Restore"
                        : action === "archive"
                          ? "Archive"
                          : "Unarchive")}
        </button>
        <button
          disabled={disabled || loading}
          onClick={() => void refreshPreview()}
        >
          Refresh preview
        </button>
        <button disabled={working} onClick={onClose}>
          {download || committed ? "Close" : "Cancel"}
        </button>
      </div>
    </Modal>
  );
}
