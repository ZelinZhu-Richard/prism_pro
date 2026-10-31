export const providers = [
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "qwen",
] as const;
export type Provider = (typeof providers)[number];
export function isProvider(value: unknown): value is Provider {
  return (
    typeof value === "string" &&
    (providers as readonly string[]).includes(value)
  );
}
export type EditMode = "review" | "manual";
export type Engine = "pdflatex" | "xelatex" | "lualatex";
export interface FileInfo {
  path: string;
  revision: number;
  size: number;
  kind: "text" | "binary" | "directory";
  deleted: boolean;
}
export interface Project {
  id: string;
  name: string;
  root: string;
  engine: Engine;
  generation: number;
  updated: string;
  deletedAt?: string | null;
  files: FileInfo[];
}
export interface TextFile {
  path: string;
  revision: number;
  content: string;
}
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  path?: string;
  line?: number;
}
export interface CompileJob {
  id: string;
  projectId: string;
  generation: number;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  diagnostics: Diagnostic[];
  log: string;
  pdf: boolean;
  started: string;
  engine: Engine;
  root: string;
}
export interface PatchFile {
  path: string;
  baseRevision: number;
  before: string;
  after: string;
}
export interface Proposal {
  id: string;
  projectId: string;
  runId: string;
  summary: string;
  files: PatchFile[];
  status: "pending" | "applied" | "rejected" | "undone";
  appliedRevisions?: Record<string, number>;
}
export interface AiRequest {
  projectId: string;
  provider: Provider;
  model: string;
  mode: EditMode;
  prompt: string;
  path: string;
  revision: number;
  from: number;
  to: number;
  explicitModel?: boolean;
}
export type AiRunStatus =
  | "generating"
  | "typing"
  | "paused"
  | "completed"
  | "stopped"
  | "failed"
  | "interrupted"
  | "undone";
export interface AiRun {
  id: string;
  projectId: string;
  provider: Provider;
  model: string;
  mode: EditMode;
  path: string;
  status: AiRunStatus;
  paused?: boolean;
  visible?: string;
  lastRevision?: number;
  prompt: string;
  text: string;
  created: string;
  usage?: Record<string, unknown>;
  contextFiles: string[];
  from: number;
  to: number;
}
export type AiEvent =
  | { type: "run"; run: AiRun }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; path?: string }
  | { type: "context"; files: string[] }
  | { type: "proposal"; proposal: Proposal }
  | { type: "usage"; usage: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };
export interface Model {
  id: string;
  provider: Provider;
  label: string;
  input: number | null;
  output: number | null;
  context: number;
  maxOutput: number;
  longAbove?: number;
  longMultiplier?: number;
  priceExpires?: string;
}
export interface ProviderState {
  configured: boolean;
  source: "session" | "environment" | "none";
  models: string[];
  verifiedAt?: string;
  error?: string;
  baseUrl?: string;
}
