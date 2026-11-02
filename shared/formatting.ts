import type { TexRuntimeSnapshot } from "./tex-runtimes";
export interface FormatterStatus {
  available: boolean;
  name: "latexindent";
  path?: string;
  runtime?: TexRuntimeSnapshot;
  problem?: string;
}
export interface FormatJob {
  id: string;
  projectId: string;
  path: string;
  revision: number;
  sourceHash: string;
  created: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  cancelRequested?: boolean;
  runtime: TexRuntimeSnapshot;
  tool: string;
  text?: string;
  log: string;
  error?: string;
}
export const FORMAT_BYTES = 2 * 1024 * 1024;
