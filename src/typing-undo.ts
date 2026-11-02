import { EditorState, Transaction } from "@codemirror/state";
import {
  history,
  historyField,
  isolateHistory,
  undo,
} from "@codemirror/commands";
import type { AiRun, FileInfo, TextFile } from "../shared/types";

export type TypingUndoRun = Pick<
  AiRun,
  | "id"
  | "projectId"
  | "mode"
  | "path"
  | "status"
  | "visible"
  | "hasTypingChanges"
  | "lastRevision"
  | "created"
  | "from"
  | "to"
>;
export type HistorySnapshot = ReturnType<EditorState["toJSON"]>;
export type TypingUndoResult = TextFile & {
  selection: { from: number; to: number };
  projectGeneration: number;
};

/** A project action stays bound to the edited file, independently of the inspected tab. */
export function latestTypingUndo<T extends TypingUndoRun>(
  runs: T[],
  files: FileInfo[],
  projectId: string,
  inspected?: { file: Pick<TextFile, "path" | "revision">; dirty: boolean },
): T | undefined {
  const revisions = new Map(
    files
      .filter((f) => !f.deleted && f.kind === "text")
      .map((f) => [f.path, f.revision]),
  );
  if (inspected && revisions.has(inspected.file.path))
    revisions.set(inspected.file.path, inspected.file.revision);
  return runs
    .filter(
      (r) =>
        r.projectId === projectId &&
        r.mode === "manual" &&
        typeof r.visible === "string" &&
        (r.visible.length > 0 ||
          r.hasTypingChanges === true ||
          r.from !== r.to) &&
        Number.isSafeInteger(r.lastRevision) &&
        r.lastRevision === revisions.get(r.path) &&
        !(inspected?.dirty && inspected.file.path === r.path) &&
        ["completed", "stopped", "failed", "interrupted"].includes(r.status),
    )
    .reduce<T | undefined>(
      (latest, r) => (!latest || r.created >= latest.created ? r : latest),
      undefined,
    );
}
function selection(result: TypingUndoResult) {
  const { from, to } = result.selection;
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to < from ||
    to > result.content.length
  )
    throw new Error(
      "The saved typing selection could not be restored. The server's saved source remains available.",
    );
  return { anchor: from, head: to };
}
/** Preserve a valid native Redo stack; reconstruct the one typing event after restart. */
export function typingUndoHistory(
  before: TextFile,
  restored: TypingUndoResult,
  cached?: HistorySnapshot,
  caret = before.content.length,
  range?: Pick<TypingUndoRun, "from" | "to">,
) {
  if (before.path !== restored.path)
    throw new Error("Typing Undo cannot reuse history from a different file.");
  const originalSelection = selection(restored);
  if (cached?.doc === before.content)
    try {
      let state = EditorState.fromJSON(
        cached,
        { extensions: history() },
        { history: historyField },
      );
      if (
        undo({
          state,
          dispatch: (tr) => {
            state = tr.state;
          },
        }) &&
        state.doc.toString() === restored.content
      ) {
        state = state.update({
          selection: originalSelection,
          annotations: Transaction.addToHistory.of(false),
        }).state;
        return {
          snapshot: state.toJSON({ history: historyField }),
          preservedHistory: true,
        };
      }
    } catch {
      /* Stale/damaged browser history must not block exact source recovery. */
    }
  let state = EditorState.create({
    doc: restored.content,
    selection: originalSelection,
    extensions: history(),
  });
  if (before.content !== restored.content) {
    let change = { from: 0, to: state.doc.length, insert: before.content };
    if (range) {
      const inserted =
        before.content.length - restored.content.length + range.to - range.from;
      if (
        !Number.isSafeInteger(range.from) ||
        !Number.isSafeInteger(range.to) ||
        range.from < 0 ||
        range.to < range.from ||
        range.to > restored.content.length ||
        inserted < 0 ||
        restored.content.slice(0, range.from) !==
          before.content.slice(0, range.from) ||
        restored.content.slice(range.to) !==
          before.content.slice(range.from + inserted)
      )
        throw new Error(
          "The saved typing range does not match the recovered source. Saved text has been kept; inspect history before retrying.",
        );
      change = {
        from: range.from,
        to: range.to,
        insert: before.content.slice(range.from, range.from + inserted),
      };
    }
    state = state.update({
      changes: change,
      selection: {
        anchor: Math.min(before.content.length, Math.max(0, caret)),
      },
      annotations: [
        Transaction.userEvent.of("input.type.ai"),
        isolateHistory.of("full"),
      ],
    }).state;
    undo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
  }
  return {
    snapshot: state.toJSON({ history: historyField }),
    preservedHistory: false,
  };
}
export interface TypingUndoPorts {
  projectId: () => string | undefined;
  lock: (working: boolean) => void;
  saveInspected: () => Promise<void>;
  readTarget: (path: string) => Promise<TextFile>;
  snapshotTarget: (
    path: string,
    revision: number,
  ) => HistorySnapshot | undefined;
  undoRun: (id: string) => Promise<TypingUndoResult>;
  applyTarget: (file: TypingUndoResult, snapshot: HistorySnapshot) => void;
}
/** Keeps the original history across an ambiguous successful response and safe retry. */
export class TypingUndoRecovery {
  working = false;
  private completed?: string;
  attempt?: { run: TypingUndoRun; file?: TextFile; snapshot?: HistorySnapshot };
  reset() {
    if (!this.working) this.attempt = undefined;
  }
  async restore(run: TypingUndoRun, ports: TypingUndoPorts) {
    if (this.working || this.completed === run.id) return false;
    this.working = true;
    if (this.attempt?.run.id !== run.id) this.attempt = { run };
    const attempt = this.attempt;
    let locked = false;
    const guard = () => {
      if (ports.projectId() !== run.projectId)
        throw new Error(
          "The project changed. Undo was not applied to the new project.",
        );
    };
    try {
      guard();
      ports.lock(true);
      locked = true;
      await ports.saveInspected();
      guard();
      const current = await ports.readTarget(run.path);
      guard();
      if (current.path !== run.path)
        throw new Error(
          "Undo received an unexpected file. No editor content was replaced.",
        );
      if (!attempt.file) {
        if (current.revision !== run.lastRevision)
          throw new Error(
            "The target file changed after typing. Use its editor Undo or history to preserve later edits.",
          );
        attempt.file = { ...current };
        attempt.snapshot = ports.snapshotTarget(run.path, current.revision);
      }
      const restored = await ports.undoRun(run.id);
      guard();
      if (restored.path !== run.path)
        throw new Error(
          "Undo received an unexpected file. No editor content was replaced.",
        );
      if (
        !Number.isSafeInteger(restored.projectGeneration) ||
        restored.projectGeneration < 0
      )
        throw new Error(
          "Undo returned an older response format. Restart the backend and reload this project; saved source has been kept.",
        );
      const confirmed = await ports.readTarget(run.path);
      guard();
      if (
        confirmed.path !== run.path ||
        confirmed.revision !== restored.revision ||
        confirmed.content !== restored.content
      )
        throw new Error(
          "The target changed while Undo was being confirmed. Inspect its latest source; later edits were kept.",
        );
      const recovered = typingUndoHistory(
        attempt.file,
        restored,
        attempt.snapshot,
        run.from +
          Math.max(
            0,
            attempt.file.content.length -
              restored.content.length +
              run.to -
              run.from,
          ),
        run,
      );
      ports.applyTarget(restored, recovered.snapshot);
      this.completed = run.id;
      this.attempt = undefined;
      return true;
    } finally {
      if (locked) ports.lock(false);
      this.working = false;
    }
  }
}
