import type { CitationEntry } from "./project-intelligence";

export interface BibliographyUpdate {
  path: string;
  kind: "updated" | "deleted" | "unavailable";
  citations: CitationEntry[];
  total: number;
  message?: string;
}

export interface BibliographyUpdates {
  projectId: string;
  generation: number;
  files: BibliographyUpdate[];
  warnings: string[];
}
