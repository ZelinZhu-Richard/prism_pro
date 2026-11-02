import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import {
  SourceDrafts,
  browserDraftStorage,
  DraftPersistenceError,
} from "../source-drafts";
import type {
  DiskReview,
  DiskResolution,
  SourceDraft,
  SourceVersion,
} from "../../shared/source-recovery";
import { Modal } from "./Modal";
import "./source-recovery.css";
function VersionFacts({
  title,
  version,
}: {
  title: string;
  version: SourceVersion;
}) {
  return (
    <section aria-label={title + " metadata"}>
      <h3>{title}</h3>
      <p>
        {version.kind === "missing"
          ? "No file"
          : version.kind === "directory"
            ? "Folder"
            : `${version.kind === "binary" ? "Binary" : "Text"} file · ${version.size ?? "Unknown"} ${version.size === 1 ? "byte" : "bytes"}`}
      </p>
      {version.hash && (
        <>
          <small>SHA-256</small>
          <code>{version.hash}</code>
        </>
      )}
    </section>
  );
}

export function SourceRecoveryDialog({
  projectId,
  path,
  text,
  draft,
  locked,
  mirror,
  onApplied,
  onClose,
}: {
  projectId: string;
  path: string;
  text: string;
  draft?: SourceDraft;
  locked: boolean;
  mirror: (draft: SourceDraft) => void;
  onApplied: (result: DiskResolution, consumed?: SourceDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [review, setReview] = useState<DiskReview>(),
    [candidate, setCandidate] = useState(text),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [loading, setLoading] = useState(true),
    [journalError, setJournalError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const alive = useRef(true),
    serial = useRef(0),
    journal = useRef<SourceDrafts | null>(null);
  if (!journal.current)
    journal.current = new SourceDrafts(
      browserDraftStorage,
      crypto.randomUUID(),
    );
  const download = useMemo(
    () =>
      URL.createObjectURL(
        new Blob([candidate], { type: "text/plain;charset=utf-8" }),
      ),
    [candidate],
  );
  useEffect(() => () => URL.revokeObjectURL(download), [download]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      serial.current++;
    };
  }, [projectId, path]);
  async function refresh() {
    const request = ++serial.current;
    setLoading(true);
    setError("");
    try {
      const value = await api<DiskReview>(
        `/projects/${projectId}/disk?path=${encodeURIComponent(path)}`,
      );
      if (alive.current && request === serial.current) setReview(value);
    } catch (e) {
      if (alive.current && request === serial.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && request === serial.current) setLoading(false);
    }
  }
  function edit(value: string) {
    setCandidate(value);
    try {
      mirror(
        journal.current!.write(
          projectId,
          path,
          review?.revision ?? draft?.revision ?? 0,
          value,
          review?.saved.content ?? text,
        ),
      );
      setJournalError("");
    } catch (e) {
      if (e instanceof DraftPersistenceError) mirror(e.draft);
      setJournalError((e as Error).message);
    }
  }
  async function apply(action: "disk" | "editor") {
    if (!review || working || locked) return;
    setWorking(true);
    setError("");
    try {
      const result = await api<DiskResolution>(
        `/projects/${projectId}/disk/resolve`,
        "POST",
        {
          path,
          token: review.token,
          action,
          ...(action === "editor" ? { content: candidate } : {}),
        },
      );
      if (!alive.current) return;
      // Keep the draft when choosing disk; only an exact saved candidate consumes it.
      if (action === "editor") {
        const cleared = journal.current!.saved(
          projectId,
          path,
          candidate,
          result.file?.revision ?? review.revision,
        );
        if (cleared) mirror(cleared);
      }
      await onApplied(result, action === "editor" ? draft : undefined);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setWorking(false);
    }
  }
  const metadataOnly = review?.editable === false && !candidate && !draft;
  return (
    <Modal
      title={draft ? "Recover unsaved text" : "Review file versions"}
      wide
      dismissible={!working}
      onClose={onClose}
      className="source-recovery"
    >
      <p className="modal-intro">
        <strong>{path}</strong>
        <br />
        {draft
          ? "This writing was kept before a successful source save."
          : metadataOnly
            ? "Compare the indexed file with its current disk version."
            : "Compare the current disk file with your editor text."}{" "}
        {metadataOnly
          ? "Choosing disk keeps earlier indexed versions in History."
          : "Saving edited text keeps earlier source versions in History."}{" "}
        No AI request is made.
      </p>
      {error && (
        <p className="history-error" role="alert" ref={errorRef} tabIndex={-1}>
          {error}
        </p>
      )}
      {journalError && (
        <p className="history-error" role="alert">
          {journalError}
        </p>
      )}
      {locked && (
        <p role="status">
          An agent owns this project. You can inspect and download; stop or
          finish the run before applying.
        </p>
      )}
      {review?.editable === false && (
        <p className="field-help">
          This disk path has no editable text. Use disk version to adopt its
          current file, folder, or deletion; earlier indexed versions remain in
          History.
        </p>
      )}
      {metadataOnly && review ? (
        <div className="source-nontext-grid">
          <VersionFacts title="Indexed version" version={review.saved} />
          <VersionFacts title="Disk version" version={review.disk} />
        </div>
      ) : (
        <div className="source-version-grid" aria-busy={loading}>
          <label>
            Disk version{" "}
            <small>
              {loading
                ? "Checking…"
                : review?.disk.kind === "missing"
                  ? "Deleted on disk"
                  : review?.disk.kind === "text"
                    ? review.changed
                      ? "External changes"
                      : "Matches saved source"
                    : (review?.disk.kind ?? "Unavailable")}
            </small>
            <textarea
              readOnly
              aria-label="Disk version"
              value={review?.disk.content ?? ""}
              placeholder={
                loading
                  ? "Loading disk version…"
                  : "No editable text at this disk path."
              }
            />
          </label>
          <label>
            Your edited version{" "}
            <small>
              {draft
                ? new Date(draft.updated).toLocaleString()
                : "Review and adjust before saving"}
            </small>
            <textarea
              aria-label="Your edited version"
              value={candidate}
              onChange={(e) => edit(e.target.value)}
              readOnly={working}
              spellCheck={false}
            />
          </label>
        </div>
      )}
      <div className="source-recovery-actions">
        {!metadataOnly && (
          <a
            className="subtle"
            href={download}
            download={path.split("/").pop() || "recovered.tex"}
          >
            Download edited text
          </a>
        )}
        <button
          className="subtle"
          onClick={() => void refresh()}
          disabled={working || loading}
        >
          Refresh comparison
        </button>
        <button className="subtle" onClick={onClose} disabled={working}>
          Keep for later
        </button>
        <button
          className={metadataOnly ? "primary" : "subtle"}
          onClick={() => void apply("disk")}
          disabled={locked || working || loading || !review}
        >
          {metadataOnly && working
            ? "Keeping disk version…"
            : "Use disk version"}
        </button>
        {!metadataOnly && (
          <button
            className="primary"
            onClick={() => void apply("editor")}
            disabled={
              locked ||
              working ||
              loading ||
              !review ||
              review.editable === false ||
              !["text", "missing"].includes(review.disk.kind)
            }
          >
            {working ? "Saving…" : "Save edited version"}
          </button>
        )}
      </div>
    </Modal>
  );
}
