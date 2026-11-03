import type { CompileOptions } from "./compiler";
import type { TexRuntimeSnapshot } from "./tex-runtimes";

export const apiProviders = [
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "qwen",
] as const;
export type ApiProvider = (typeof apiProviders)[number];
export const cliProviders = ["codex", "claude-code"] as const;
export type CliProvider = (typeof cliProviders)[number];
export const providers = [...apiProviders, ...cliProviders] as const;
export type Provider = (typeof providers)[number];
export function isCliProvider(value: unknown): value is CliProvider {
  return value === "codex" || value === "claude-code";
}
export function isApiProvider(value: unknown): value is ApiProvider {
  return (
    typeof value === "string" &&
    (apiProviders as readonly string[]).includes(value)
  );
}
export function isProvider(value: unknown): value is Provider {
  return (
    typeof value === "string" &&
    (providers as readonly string[]).includes(value)
  );
}
export type EditMode = "review" | "manual";
export type AiScope = "document" | "project";
export type Engine = "pdflatex" | "latex" | "xelatex" | "lualatex";
export interface FileInfo {
  path: string;
  revision: number;
  size: number;
  kind: "text" | "binary" | "directory";
  deleted: boolean;
}
export interface Project {
  /** Only present for an explicitly opened ordinary local directory. */
  storage?: {
    kind: "linked";
    folder: string;
    available: boolean;
    writable: boolean;
  };
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
  /** Authoritative read-only state at the time of a public file read. */
  readOnly?: boolean;
  path: string;
  revision: number;
  content: string;
}
export interface SkippedArchiveEntry {
  path: string;
  reason: "hidden" | "metadata";
}
export interface ProjectImport extends Project {
  skippedEntries: SkippedArchiveEntry[];
}
export interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  path?: string;
  line?: number;
}
export interface CompileJob {
  /** Captured local policy: null means unlimited; absent means a legacy job. */
  timeoutMs?: number | null;
  /** Derived diagnostic format; older finished builds refresh lazily. */
  diagnosticsVersion?: number;
  /** Kept running until the process tree has actually exited. */
  cancelRequested?: boolean;
  previewRequest?: { runId: string; requestId: string; textHash: string };
  runtime?: TexRuntimeSnapshot;
  options?: CompileOptions;
  preview?: boolean;
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
export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  created: string;
  updated: string;
  revision?: number;
  archivedAt?: string | null;
}
export interface AiRequest {
  /** Optional revision of the exact submitted unsent draft; consumed with the accepted run. */
  draftRevision?: number;
  conversationId?: string;
  previewFirst?: boolean;
  proposedReplacement?: string;
  projectId: string;
  provider: Provider;
  model: string;
  mode: EditMode;
  scope?: AiScope;
  prompt: string;
  path: string;
  revision: number;
  from: number;
  to: number;
  explicitModel?: boolean;
}
export type AiRunStatus =
  | "preview"
  | "generating"
  | "typing"
  | "paused"
  | "completed"
  | "stopped"
  | "failed"
  | "interrupted"
  | "undone";
export interface AiRun {
  consumedDraftRevision?: number;
  conversationId?: string;
  id: string;
  projectId: string;
  provider: Provider;
  model: string;
  mode: EditMode;
  scope?: AiScope;
  path: string;
  status: AiRunStatus;
  paused?: boolean;
  visible?: string;
  /** Lightweight chat summaries omit visible text but retain Undo eligibility. */
  hasTypingChanges?: boolean;
  lastRevision?: number;
  prompt: string;
  text: string;
  insertion?: string;
  error?: string;
  created: string;
  usage?: Record<string, unknown>;
  contextFiles: string[];
  from: number;
  to: number;
}
export type AiEvent =
  | { type: "run"; run: AiRun }
  | { type: "text"; text: string }
  | { type: "typing"; text: string; from: number; to: number }
  | { type: "tool"; name: string; path?: string }
  | { type: "context"; files: string[] }
  | { type: "proposal"; proposal: Proposal }
  | { type: "usage"; usage: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done"; run?: AiRun };
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
  source: "session" | "environment" | "none" | "cli";
  models: string[];
  modelOptions?: { id: string; label: string; isDefault?: boolean }[];
  modelSource?: "account" | "cli" | "aliases";
  modelError?: string;
  verifiedAt?: string;
  error?: string;
  baseUrl?: string;
  installed?: boolean;
  version?: string;
  checkedAt?: string;
}

export interface HistoryVersion {
  id: string;
  name: string;
  created: string;
  automatic: number;
  reviewAvailable?: number;
  reviewOmitted?: string;
  labels?: import("./history-labels").HistoryLabel[];
  labelRevision?: number;
}
export interface HistoryChange {
  path: string;
  kind: string;
  change: "added" | "deleted" | "modified" | "unchanged";
  currentRevision: number | null;
  restorable: boolean;
}
export interface HistoryComparison {
  files: HistoryChange[];
  settingsChanged: boolean;
  currentGeneration: number;
  reviews?: import("./history-recovery").HistoryReviews;
}
export interface HistoryFile {
  path: string;
  kind: string;
  before: string | null;
  after: string | null;
}
