export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  include: string;
  exclude: string;
}
export interface SearchMatch {
  from: number;
  to: number;
  line: number;
  column: number;
  prefix: string;
  text: string;
  suffix: string;
  clipped: boolean;
}
export interface SearchFile {
  path: string;
  revision: number;
  count: number;
  matches: SearchMatch[];
}
export interface SearchResult {
  generation: number;
  files: SearchFile[];
  total: number;
  truncated: boolean;
  warnings: string[];
}
export interface ReplacementPreview {
  id: string;
  projectId: string;
  status: "pending" | "applied" | "undone";
  created: string;
  options: SearchOptions;
  replacement: string;
  expand: boolean;
  total: number;
  files: { path: string; count: number; revision: number }[];
  selectedPaths?: string[];
  warnings: string[];
}
export interface ReplacementFile {
  path: string;
  revision: number;
  count: number;
  before: string;
  after: string;
  appliedRevision?: number;
}
export const defaultSearch: SearchOptions = {
  query: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: "",
  exclude: "",
};
