import type { Project } from "./types";

export const UPLOAD_FILES = 180;
export const UPLOAD_ENTRIES = 500;
export const UPLOAD_BYTES = 50 * 1024 * 1024;
export interface UploadEntry {
  path: string;
  size: number;
  directory?: boolean;
}
export interface UploadReview {
  token: string;
  generation: number;
  entries: (UploadEntry & {
    index: number;
    target: string;
    status: "add" | "replace" | "merge" | "blocked";
    reason?: string;
  })[];
}
export type BatchKind = "upload" | "trash" | "restore";
export interface BatchResult {
  project: Project;
  operationId: string;
  changedFiles: string[];
  replayed?: boolean;
  undone?: boolean;
}
export interface SavedBatch {
  id: string;
  kind: BatchKind;
  count: number;
  created: string;
  status: "applied" | "undone";
  undoable: boolean;
}
// Inspect metadata before reading any selected file contents.
export function uploadPathIssue(path: string): {
  skip?: string;
  error?: string;
} {
  if (
    !path ||
    path.length > 500 ||
    /[\\\x00-\x1f\x7f:]/.test(path) ||
    path.startsWith("/") ||
    path.split("/").some((s) => !s || s === "." || s === "..")
  )
    return {
      error:
        "Use a relative path without parent segments or control characters.",
    };
  if (path.split("/").some((s) => s.toLowerCase() === "holdout"))
    return { error: "Protected folders cannot be uploaded." };
  if (path.split("/").some((s) => s.startsWith(".") || s === "__MACOSX"))
    return { skip: "Hidden files and system metadata are skipped." };
  return {};
}
