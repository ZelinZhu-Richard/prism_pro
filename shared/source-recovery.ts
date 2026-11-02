import type { Project, TextFile } from "./types";
export interface SourceVersion {
  kind: "text" | "binary" | "directory" | "missing";
  content?: string;
}
export interface DiskReview {
  path: string;
  revision: number;
  generation: number;
  token: string;
  changed: boolean;
  saved: SourceVersion;
  disk: SourceVersion;
}
export interface DiskResolution {
  project: Project;
  file: TextFile | null;
}
export interface SourceDraft {
  id: string;
  project: string;
  path: string;
  revision: number;
  text: string;
  updated: number;
  sequence: number;
  cleared?: boolean;
}
