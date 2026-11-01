import type { FileInfo, Project } from "./types";
export interface FileMove {
  from: string;
  to: string;
}
export interface MoveEntry extends FileMove {
  kind: FileInfo["kind"];
  revision: number;
  size: number;
}
export interface MovePreview {
  generation: number;
  moves: FileMove[];
  entries: MoveEntry[];
  rootBefore: string;
  rootAfter: string;
  references?: ReferenceReview;
}
export interface ReferenceReview {
  token: string;
  files: {
    path: string;
    toPath: string;
    revision: number;
    changes: number;
    diff: string;
  }[];
  warnings: { path: string; line: number; message: string }[];
  scannedFiles: number;
  unavailable?: string;
}
export interface MoveResult {
  project: Project;
  operationId: string;
  moves: FileMove[];
  replayed?: boolean;
  changedFiles?: string[];
  undone?: boolean;
}
export interface SavedMove {
  id: string;
  moves: FileMove[];
  created: string;
  status: "applied" | "undone";
  undoable: boolean;
}
export const coversPath = (folder: string, name: string) =>
  name === folder || name.startsWith(folder + "/");
export function movedPath(name: string, moves: readonly FileMove[]) {
  const move = moves.find((m) => coversPath(m.from, name));
  return move ? move.to + name.slice(move.from.length) : name;
}
export function selectionRoots(paths: readonly string[]) {
  const sorted = [...new Set(paths)].sort(
    (a, b) => a.length - b.length || a.localeCompare(b),
  );
  return sorted.filter(
    (name, i) => !sorted.slice(0, i).some((parent) => coversPath(parent, name)),
  );
}
export function projectFolders(files: readonly FileInfo[]) {
  const folders = new Set<string>();
  for (const f of files)
    if (!f.deleted) {
      const parts = f.path.split("/");
      if (f.kind !== "directory") parts.pop();
      while (parts.length) {
        folders.add(parts.join("/"));
        parts.pop();
      }
    }
  return [...folders].sort((a, b) => a.localeCompare(b));
}
