import type { TexRuntimeSnapshot } from "./tex-runtimes";

export interface InstalledTexPackage {
  name: string;
  path: string;
  format: "sty" | "cls";
  origin?: "personal";
}
export type PersonalTexStatus =
  | { kind: "disabled" }
  | { kind: "unavailable"; problem: string }
  | { kind: "ready"; signature: string; files: number };
export interface PersonalTexBuild {
  signature: string;
  fingerprint: string;
  files: number;
}
export interface TexPackageCatalog {
  runtime: TexRuntimeSnapshot;
  source: "texmf-dist/ls-R";
  status: "ready" | "unavailable";
  checkedAt: string;
  fingerprint: string;
  packages: InstalledTexPackage[];
  warnings: string[];
  personalTex?: PersonalTexStatus;
}
export interface TexPackageSearch extends Omit<TexPackageCatalog, "packages"> {
  projectId: string;
  settingsRevision: number;
  query: string;
  total: number;
  packages: InstalledTexPackage[];
  limited: boolean;
}
