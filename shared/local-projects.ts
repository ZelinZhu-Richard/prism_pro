import type { FileInfo, Project } from "./types";

export type LocalOpenMode = "folder" | "file";
export interface LocalOpenReview {
  folder: string;
  token: string;
  action: "create" | "open" | "restore" | "relink";
  name: string;
  writable: boolean;
  file?: string;
  main: string;
  texFiles: string[];
  files: Pick<FileInfo, "path" | "kind" | "size">[];
  skipped: { path: string; reason: string }[];
}
export interface LocalOpenResult {
  project: Project;
  file?: string;
}
