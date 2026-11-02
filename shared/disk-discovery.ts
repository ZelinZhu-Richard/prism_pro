import type { Project } from "./types";
export interface DiscoveredFile {
  path: string;
  kind: "text" | "binary" | "directory";
  size: number;
}
export interface DiskDiscoveryView {
  projectId: string;
  generation: number;
  folder: string;
  token: string;
  added: DiscoveredFile[];
  changed: {
    path: string;
    change: "modified" | "deleted" | "restored" | "type";
  }[];
  skipped: { path: string; reason: string }[];
  scanned: number;
  bytes: number;
}
export interface DiskImportRequest {
  requestId: string;
  token: string;
  paths: string[];
}
export interface DiskImportResult {
  project: Project;
  imported: string[];
  replayed: boolean;
}
