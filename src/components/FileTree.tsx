import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  ListChecks,
  Pencil,
  Trash2,
  Undo2,
  X,
  Download,
} from "lucide-react";
import { api } from "../api";
import type { FileInfo, Project } from "../../shared/types";
import {
  coversPath,
  selectionRoots,
  type MoveResult,
  type SavedMove,
} from "../../shared/file-moves";
import { MoveFiles } from "./MoveFiles";
import { FileBatchReview } from "./FileBatchReview";
import type { BatchResult, SavedBatch } from "../../shared/file-batches";

export function FileTree({
  project,
  items,
  activePath,
  collapsed,
  locked,
  onFolder,
  onOpen,
  onChanged,
  onRoot,
  uploadDestination,
  prepare,
  onMoved,
  showRecovery,
  onBusy,
}: {
  project: Project;
  items: FileInfo[];
  activePath: string;
  collapsed: Set<string>;
  locked: boolean;
  onFolder: (name: string) => void;
  onOpen: (name: string) => void;
  onChanged: (result: BatchResult) => Promise<void>;
  onRoot: () => void;
  uploadDestination: string;
  prepare: () => Promise<Project>;
  onMoved: (result: MoveResult, before: Project) => Promise<void>;
  showRecovery: (id: string, error: unknown) => Promise<boolean>;
  onBusy: (busy: boolean) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [selecting, setSelecting] = useState(false),
    [dragging, setDragging] = useState(false),
    [drop, setDrop] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
      paths: string[];
      destination?: string;
      rename?: boolean;
    } | null>(null),
    [recent, setRecent] = useState<SavedMove[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [batchReview, setBatchReview] = useState<string[] | null>(null),
    [batches, setBatches] = useState<SavedBatch[]>([]);
  const anchor = useRef<string | null>(null),
    drag = useRef<{ token: string; paths: string[] } | null>(null),
    root = useRef<HTMLDivElement>(null);
  const previous = useRef(project.id);
  async function loadRecent() {
    const [moves, batch] = await Promise.allSettled([
      api<SavedMove[]>(`/projects/${project.id}/file-moves`),
      api<SavedBatch[]>(`/projects/${project.id}/file-batches`),
    ]);
    setRecent(moves.status === "fulfilled" ? moves.value : []);
    setBatches(batch.status === "fulfilled" ? batch.value : []);
  }
  useEffect(() => {
    if (previous.current !== project.id) {
      setSelected([]);
      setSelecting(false);
      previous.current = project.id;
    }
    if (locked) return;
    const timer = setTimeout(() => void loadRecent(), 250);
    return () => clearTimeout(timer);
  }, [project.id, project.generation, locked]);
  useEffect(() => {
    setSelected((names) =>
      names.filter((name) =>
        project.files.some((f) => !f.deleted && coversPath(name, f.path)),
      ),
    );
  }, [project.files]);
  const included = (name: string) =>
    selected.some((parent) => coversPath(parent, name));
  function toggle(name: string, range = false) {
    const at = items.findIndex((f) => f.path === name),
      from = items.findIndex((f) => f.path === anchor.current);
    if (range && from >= 0)
      setSelected((old) =>
        selectionRoots([
          ...old,
          ...items
            .slice(Math.min(from, at), Math.max(from, at) + 1)
            .map((f) => f.path),
        ]),
      );
    else {
      setSelected((old) =>
        old.some((parent) => coversPath(parent, name))
          ? old.filter(
              (parent) =>
                !coversPath(name, parent) && !coversPath(parent, name),
            )
          : selectionRoots([...old, name]),
      );
      anchor.current = name;
    }
    setSelecting(true);
  }
  function dragStart(event: React.DragEvent, name: string) {
    if (locked || busy) {
      event.preventDefault();
      return;
    }
    const paths = included(name) ? selected : [name],
      token = crypto.randomUUID();
    drag.current = { token, paths };
    event.dataTransfer.setData("application/x-prism-files", token);
    event.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }
  function accept(event: React.DragEvent, destination: string) {
    if (
      locked ||
      busy ||
      !drag.current ||
      drag.current.paths.some(
        (name) => destination && coversPath(name, destination),
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDrop(destination);
  }
  function dropFiles(event: React.DragEvent, destination: string) {
    event.preventDefault();
    event.stopPropagation();
    const current = drag.current;
    if (
      !locked &&
      !busy &&
      current &&
      event.dataTransfer.getData("application/x-prism-files") === current.token
    )
      setDialog({ paths: current.paths, destination });
    drag.current = null;
    setDragging(false);
    setDrop(null);
  }
  function close() {
    setDialog(null);
    requestAnimationFrame(() =>
      root.current?.querySelector<HTMLButtonElement>(".file-main")?.focus(),
    );
  }
  async function moved(result: MoveResult, before: Project) {
    await onMoved(result, before);
    setSelected([]);
    setSelecting(false);
    await loadRecent();
  }
  async function undo(operation: SavedMove) {
    if (locked || busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const before = await prepare();
      const result = await api<MoveResult>(
        `/projects/${project.id}/file-moves/${operation.id}/undo`,
        "POST",
        {},
      );
      await moved(result, before);
    } catch (e) {
      if (!(await showRecovery(project.id, e))) setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  const last = recent.find((m) => m.status === "applied");
  const lastBatch = batches.find((b) => b.status === "applied");
  async function changed(result: BatchResult) {
    await onChanged(result);
    setSelected([]);
    setSelecting(false);
    await loadRecent();
  }
  async function undoBatch() {
    if (locked || busy || !lastBatch) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await prepare();
      await changed(
        await api<BatchResult>(
          `/projects/${project.id}/file-batches/${lastBatch.id}/undo`,
          "POST",
          {},
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function download() {
    if (locked || busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const current = await prepare(),
        response = await fetch(`/api/projects/${project.id}/files/download`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Prism-Request": "1",
          },
          body: JSON.stringify({
            paths: selected,
            generation: current.generation,
          }),
        });
      if (!response.ok)
        throw new Error(
          (await response.json()).error ||
            "The download could not be prepared.",
        );
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "selected-files.zip";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <>
      <div className="file-selection-tools">
        <button
          aria-pressed={selecting}
          onClick={() => {
            setSelecting(!selecting);
            setSelected([]);
          }}
        >
          <ListChecks size={14} />
          {selecting ? "Done" : "Select files"}
        </button>
        <button
          type="button"
          aria-pressed={uploadDestination === ""}
          onClick={onRoot}
          className={
            "file-root-drop " +
            (dragging ? "dragging " : "") +
            (drop === "" ? "drop-target" : "")
          }
          title="Drag files here to move them out of folders"
          onDragOver={(e) => accept(e, "")}
          onDragEnter={(e) => accept(e, "")}
          onDragLeave={() => setDrop(null)}
          onDrop={(e) => dropFiles(e, "")}
        >
          Project root
        </button>
        {selected.length > 0 && (
          <>
            <span>{selected.length} selected</span>
            <button
              disabled={locked || busy}
              onClick={() => setDialog({ paths: selected })}
            >
              <FolderInput size={14} />
              Move
            </button>
            <button disabled={locked || busy} onClick={() => void download()}>
              <Download size={14} />
              Download
            </button>
            <button
              disabled={locked || busy}
              onClick={() => setBatchReview(selected)}
            >
              <Trash2 size={14} />
              Trash
            </button>
            <button
              aria-label="Clear file selection"
              onClick={() => setSelected([])}
            >
              <X size={13} />
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="file-operation-error" role="alert">
          {error}
        </p>
      )}
      <div
        className="file-tree"
        ref={root}
        role="group"
        aria-label="Project files"
      >
        {items.map((f) => (
          <div
            key={f.path}
            data-filepath={f.path}
            className={
              "file-row " +
              (f.path === activePath ? "selected " : "") +
              (included(f.path) ? "file-picked " : "") +
              (drop === f.path ? "drop-target" : "")
            }
            style={{ paddingLeft: 12 + (f.path.split("/").length - 1) * 14 }}
            draggable={!locked && !busy}
            onDragStart={(e) => dragStart(e, f.path)}
            onDragEnd={() => {
              drag.current = null;
              setDragging(false);
              setDrop(null);
            }}
            onDragOver={(e) => {
              if (f.kind === "directory") accept(e, f.path);
            }}
            onDragEnter={(e) => {
              if (f.kind === "directory") accept(e, f.path);
            }}
            onDragLeave={() => setDrop(null)}
            onDrop={(e) => {
              if (f.kind === "directory") dropFiles(e, f.path);
            }}
          >
            {selecting && (
              <input
                type="checkbox"
                aria-label={`Select ${f.path}`}
                checked={included(f.path)}
                disabled={selected.some(
                  (parent) => parent !== f.path && coversPath(parent, f.path),
                )}
                onChange={(e) =>
                  toggle(f.path, (e.nativeEvent as MouseEvent).shiftKey)
                }
              />
            )}
            <button
              className="file-main"
              title={f.path}
              disabled={busy}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                  toggle(f.path, e.shiftKey);
                  return;
                }
                if (f.kind === "directory") onFolder(f.path);
                else onOpen(f.path);
              }}
            >
              {f.kind === "directory" ? (
                <>
                  {collapsed.has(f.path) ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  <Folder size={14} />
                </>
              ) : f.path.endsWith(".bib") ? (
                <BookOpen size={15} />
              ) : (
                <FileText size={15} />
              )}
              <span>{f.path.split("/").at(-1)}</span>
              {f.path === project.root && (
                <span className="main-indicator" title="Root document" />
              )}
            </button>
            <div className="file-row-actions">
              <button
                aria-label={`Move ${f.path}`}
                disabled={locked || busy}
                onClick={() =>
                  setDialog({ paths: included(f.path) ? selected : [f.path] })
                }
              >
                <FolderInput size={11} />
              </button>
              <button
                aria-label={`Rename ${f.path}`}
                disabled={locked || busy}
                onClick={() => setDialog({ paths: [f.path], rename: true })}
              >
                <Pencil size={11} />
              </button>
              <button
                aria-label={`Move ${f.path} to Trash`}
                disabled={locked || busy}
                onClick={() => setBatchReview([f.path])}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
        {!items.length && <p className="sidebar-empty">No matching files.</p>}
      </div>
      {last && (
        <button
          className="undo-file-move"
          disabled={locked || busy || !last.undoable}
          title={
            last.undoable
              ? "Restore the previous locations and any reviewed reference edits"
              : "Moved or reference files changed; use project History to restore them"
          }
          onClick={() => void undo(last)}
        >
          <Undo2 size={13} />
          {busy ? "Restoring file locations…" : "Undo last file move"}
        </button>
      )}
      {lastBatch && (
        <button
          className="undo-file-move"
          disabled={locked || busy || !lastBatch.undoable}
          title={
            lastBatch.undoable
              ? "Restore the previous file state"
              : "Affected files changed; use project History to restore them"
          }
          onClick={() => void undoBatch()}
        >
          <Undo2 size={13} />
          {busy
            ? "Restoring files…"
            : `Undo last ${lastBatch.kind === "trash" ? "Trash" : lastBatch.kind}`}
        </button>
      )}
      {batchReview && (
        <FileBatchReview
          project={project}
          paths={batchReview}
          kind="trash"
          prepare={prepare}
          onChanged={changed}
          onClose={() => setBatchReview(null)}
          onBusy={(value) => {
            setBusy(value);
            onBusy(value);
          }}
        />
      )}
      {dialog && (
        <MoveFiles
          projectId={project.id}
          paths={dialog.paths}
          initialDestination={dialog.destination}
          rename={dialog.rename}
          prepare={prepare}
          onMoved={moved}
          showRecovery={showRecovery}
          onClose={close}
          onBusy={(value) => {
            setBusy(value);
            onBusy(value);
          }}
        />
      )}
    </>
  );
}
