import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "../api";
import {
  DiskCheck,
  diskSelection,
  type DiskCheckView,
} from "../disk-discovery";
import type {
  DiskDiscoveryView,
  DiskImportResult,
} from "../../shared/disk-discovery";
import "./disk-discovery.css";
const size = (bytes: number) =>
  bytes < 1024
    ? bytes + " B"
    : bytes < 1024 * 1024
      ? (bytes / 1024).toFixed(1) + " KiB"
      : (bytes / 1024 / 1024).toFixed(1) + " MiB";
const changeNames = {
  modified: "Modified",
  deleted: "Deleted on disk",
  restored: "Reappeared on disk",
  type: "File type changed",
};
function DiskPages({
  page,
  total,
  label,
  onPage,
}: {
  page: number;
  total: number;
  label: string;
  onPage: (page: number) => void;
}) {
  const range = useRef<HTMLSpanElement>(null),
    previous = useRef(page);
  useEffect(() => {
    if (previous.current !== page) {
      previous.current = page;
      range.current?.focus();
    }
  }, [page]);
  return total > 100 ? (
    <div className="disk-pages" role="group" aria-label={label + " pages"}>
      <button
        className="subtle"
        aria-label={"Previous " + label}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span
        ref={range}
        tabIndex={-1}
        role="status"
        aria-label={label + " range"}
      >
        {page * 100 + 1}–{Math.min(total, (page + 1) * 100)} of {total}
      </span>
      <button
        className="subtle"
        aria-label={"Next " + label}
        disabled={(page + 1) * 100 >= total}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  ) : null;
}
export function DiskDiscovery({
  projectId,
  locked,
  onImported,
  onReview,
  onClose,
}: {
  projectId: string;
  locked: boolean;
  onImported: (result: DiskImportResult) => Promise<void>;
  onReview: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [view, setView] = useState<DiskCheckView>({ phase: "checking" }),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [newPage, setNewPage] = useState(0),
    [changedPage, setChangedPage] = useState(0),
    [reviewing, setReviewing] = useState(""),
    [reviewError, setReviewError] = useState("");
  const controller = useRef<DiskCheck | null>(null),
    seenScan = useRef(false),
    callbacks = useRef({ onImported, onReview }),
    alive = useRef(false),
    error = useRef<HTMLParagraphElement>(null),
    status = useRef<HTMLParagraphElement>(null),
    dialogBody = useRef<HTMLDivElement>(null);
  callbacks.current = { onImported, onReview };
  useEffect(() => {
    alive.current = true;
    seenScan.current = false;
    const check = new DiskCheck({
      scan: (signal) =>
        api<DiskDiscoveryView>(
          `/projects/${projectId}/disk/discovery`,
          "GET",
          undefined,
          { signal },
        ),
      import: (request, signal) =>
        api<DiskImportResult>(
          `/projects/${projectId}/disk/discovery`,
          "POST",
          request,
          { signal },
        ),
      applied: (result) => callbacks.current.onImported(result),
      id: () => crypto.randomUUID(),
      notify: (next) => {
        setView(next);
        if (next.phase === "ready" && next.scan) {
          const first = !seenScan.current,
            entries = next.scan.added;
          setSelected((old) => diskSelection(first ? undefined : old, entries));
          seenScan.current = true;
          setNewPage(0);
          setChangedPage(0);
        }
      },
    });
    controller.current = check;
    void check.check();
    return () => {
      alive.current = false;
      check.dispose();
      controller.current = null;
    };
  }, [projectId]);
  useEffect(() => {
    if (view.error || reviewError) error.current?.focus();
    else if (
      !dialogBody.current?.closest("dialog")?.contains(document.activeElement)
    )
      status.current?.focus();
  }, [view.phase, view.error, reviewError]);
  const busy = ["checking", "importing"].includes(view.phase),
    uncertain = view.phase === "uncertain",
    ready = view.phase === "ready",
    entries = view.scan?.added ?? [],
    all =
      entries.length > 0 &&
      selected.size === Math.min(entries.length, 1000) &&
      entries.slice(0, 1000).every((e) => selected.has(e.path));
  async function review(name: string) {
    if (busy || uncertain || reviewing) return;
    setReviewing(name);
    setReviewError("");
    try {
      await callbacks.current.onReview(name);
    } catch (e) {
      if (alive.current) setReviewError((e as Error).message);
    } finally {
      if (alive.current) setReviewing("");
    }
  }
  return (
    <Modal
      title="Check disk files"
      wide
      className="disk-discovery"
      dismissible={view.phase !== "importing"}
      onClose={onClose}
    >
      <p className="disk-discovery-intro">
        Review files added outside Leaf before including them in this project.
        Existing changes use the file-version comparison.
      </p>
      <p
        ref={status}
        tabIndex={-1}
        role="status"
        className="disk-discovery-status"
      >
        {view.phase === "checking"
          ? "Checking project files…"
          : view.phase === "importing"
            ? "Importing selected entries…"
            : view.phase === "uncertain"
              ? "Import not confirmed"
              : view.phase === "done"
                ? `${view.result?.imported.length ?? 0} ${(view.result?.imported.length ?? 0) === 1 ? "entry" : "entries"} imported. Physical files were kept.`
                : view.phase === "failed"
                  ? "The check or import could not finish."
                  : `${selected.size} of ${entries.length} new entries selected · ${view.scan?.changed.length ?? 0} existing ${(view.scan?.changed.length ?? 0) === 1 ? "change" : "changes"}`}
      </p>
      {(view.error || reviewError) && (
        <p className="inline-message" role="alert" ref={error} tabIndex={-1}>
          {view.error || reviewError}
        </p>
      )}
      {locked && (
        <p className="field-help">
          Inspection remains available. Finish or stop the active operation
          before importing files.
        </p>
      )}
      <div className="disk-discovery-body" ref={dialogBody}>
        {view.scan && (
          <label className="disk-folder">
            Project folder
            <input
              aria-label="Project folder"
              readOnly
              value={view.scan.folder}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        )}

        {view.scan && (
          <>
            <section aria-labelledby="disk-new-title">
              <div className="disk-section-heading">
                <h3 id="disk-new-title">New files and folders</h3>
                {entries.length > 0 && (
                  <label>
                    <input
                      type="checkbox"
                      aria-label={
                        entries.length > 1000
                          ? "Select first 1,000 new disk entries"
                          : "Select all new disk entries"
                      }
                      checked={all}
                      disabled={!ready || !!reviewing}
                      onChange={(e) =>
                        setSelected(
                          new Set(
                            e.target.checked
                              ? entries.slice(0, 1000).map((x) => x.path)
                              : [],
                          ),
                        )
                      }
                    />
                    {entries.length > 1000
                      ? "Select first 1,000"
                      : "Select all"}
                  </label>
                )}
              </div>
              {entries.length > 1000 && (
                <p className="field-help">
                  Import up to 1,000 entries at a time. After importing, check
                  again to add more.
                </p>
              )}
              <DiskPages
                page={newPage}
                total={entries.length}
                label="new disk entries"
                onPage={setNewPage}
              />
              {entries.length ? (
                entries
                  .slice(newPage * 100, (newPage + 1) * 100)
                  .map((entry) => (
                    <label className="disk-new-entry" key={entry.path}>
                      <input
                        type="checkbox"
                        aria-label={"Import " + entry.path}
                        checked={selected.has(entry.path)}
                        disabled={
                          !ready ||
                          !!reviewing ||
                          (selected.size >= 1000 && !selected.has(entry.path))
                        }
                        onChange={(e) =>
                          setSelected((old) => {
                            const next = new Set(old);
                            if (e.target.checked) next.add(entry.path);
                            else next.delete(entry.path);
                            return next;
                          })
                        }
                      />
                      <span>
                        <strong>{entry.path}</strong>
                        <small>
                          {entry.kind === "directory"
                            ? "Empty folder"
                            : entry.kind === "binary"
                              ? "Binary asset"
                              : "Text file"}
                          {entry.kind !== "directory"
                            ? " · " + size(entry.size)
                            : ""}
                        </small>
                      </span>
                    </label>
                  ))
              ) : (
                <p className="field-help">
                  No new files or empty folders were found.
                </p>
              )}
            </section>
            {view.scan.changed.length > 0 && (
              <section aria-labelledby="disk-changed-title">
                <h3 id="disk-changed-title">Existing file changes</h3>
                <p className="field-help">
                  These versions are kept separate. Compare a file before
                  choosing disk or editor text.
                </p>
                <DiskPages
                  page={changedPage}
                  total={view.scan.changed.length}
                  label="changed disk entries"
                  onPage={setChangedPage}
                />
                {view.scan.changed
                  .slice(changedPage * 100, (changedPage + 1) * 100)
                  .map((entry) => (
                    <div className="disk-changed-entry" key={entry.path}>
                      <span>
                        <strong>{entry.path}</strong>
                        <small>{changeNames[entry.change]}</small>
                      </span>
                      <button
                        className="subtle"
                        disabled={busy || uncertain || !!reviewing}
                        aria-label={"Review versions of " + entry.path}
                        onClick={() => void review(entry.path)}
                      >
                        {reviewing === entry.path
                          ? "Opening…"
                          : "Compare versions"}
                      </button>
                    </div>
                  ))}
              </section>
            )}
            {view.scan.skipped.length > 0 && (
              <section aria-labelledby="disk-skipped-title">
                <h3 id="disk-skipped-title">Left untouched</h3>
                <p className="field-help">
                  Unsupported, hidden and protected entries are excluded.
                </p>
                {view.scan.skipped.map((entry, i) => (
                  <p className="disk-skipped" key={i}>
                    <strong>{entry.path}</strong>
                    <span>{entry.reason}</span>
                  </p>
                ))}
              </section>
            )}
          </>
        )}
        <p className="field-help disk-discovery-policy">
          Import adds only the selected new entries and records history. It does
          not rewrite disk files, run scripts, or replace existing source.
          Closing after an unconfirmed import keeps physical files safe; check
          again to refresh the list.
        </p>
      </div>
      <div className="disk-discovery-actions">
        <button
          className="subtle"
          onClick={onClose}
          disabled={view.phase === "importing" || !!reviewing}
        >
          Close
        </button>
        <button
          className="subtle"
          onClick={() => {
            setReviewError("");
            void controller.current?.check();
          }}
          disabled={busy || uncertain || !!reviewing}
        >
          <RefreshCw size={14} />
          {view.phase === "done" ? "Check again" : "Refresh review"}
        </button>
        <button
          className="primary"
          disabled={
            locked ||
            busy ||
            !!reviewing ||
            (!uncertain && (!ready || selected.size === 0))
          }
          onClick={() => void controller.current?.import([...selected])}
        >
          {view.phase === "importing" && (
            <LoaderCircle size={14} className="spin" />
          )}
          {uncertain
            ? "Retry import"
            : view.phase === "done"
              ? "Imported"
              : "Import selected"}
        </button>
      </div>
    </Modal>
  );
}
