export const LIBRARY_SELECTION_LIMIT = 100;
export const LIBRARY_EXPORT_PROJECTS = 20;
export const LIBRARY_EXPORT_BYTES = 100 * 1024 * 1024;
export const LIBRARY_EXPORT_ENTRIES = 10000;
export const TAG_COLORS = [
  "#808080",
  "#be625a",
  "#c18b42",
  "#a29a40",
  "#5f9670",
  "#4e9294",
  "#6087b9",
  "#9575b5",
  "#b46f94",
];
export interface ProjectTag {
  id: string;
  name: string;
  color: string;
  revision: number;
  deletedAt: string | null;
}
export interface LibraryProject {
  id: string;
  revision: number;
  archivedAt: string | null;
  deletedAt: string | null;
  tags: string[];
}
export interface LibraryState {
  tags: ProjectTag[];
  projects: LibraryProject[];
}
export type LibraryAction =
  | "archive"
  | "unarchive"
  | "trash"
  | "restore"
  | "tag-add"
  | "tag-remove"
  | "export";
export interface LibraryTarget extends LibraryProject {
  name: string;
  generation?: number;
}
export interface LibraryPreview {
  action: LibraryAction;
  targets: LibraryTarget[];
  tags?: ProjectTag[];
  hash: string;
  changes: number;
  bytes: number;
  entries: number;
}
export interface LibraryResult {
  state: LibraryState;
  operationId: string;
  replayed: boolean;
}
export interface LibraryDownload {
  id: string;
  url: string;
  bytes: number;
  projects: number;
  expiresAt: string;
}
