import type { TexRuntimeSnapshot } from "./tex-runtimes";

export interface InstalledTexPackage {
  name: string;
  path: string;
  format: "sty" | "cls";
}
export interface TexPackageCatalog {
  runtime: TexRuntimeSnapshot;
  source: "texmf-dist/ls-R";
  status: "ready" | "unavailable";
  checkedAt: string;
  fingerprint: string;
  packages: InstalledTexPackage[];
  warnings: string[];
}
export interface TexPackageSearch extends Omit<TexPackageCatalog, "packages"> {
  projectId: string;
  settingsRevision: number;
  query: string;
  total: number;
  packages: InstalledTexPackage[];
  limited: boolean;
}
