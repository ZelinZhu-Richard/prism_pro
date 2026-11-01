import type { Project } from "./types";
import type { TrackedHunk } from "./tracking";
export interface ReviewCounts {
  threads: number;
  messages: number;
  trackedFiles: number;
}
export interface HistoryReviews {
  beforeAvailable: boolean;
  afterAvailable: boolean;
  changed: boolean | null;
  before: ReviewCounts;
  after: ReviewCounts;
  currentToken?: string;
  reason?: string;
  changedPaths:string[];
}
export interface HistoryRestorePlan {
  versionId: string;
  versionName: string;
  path?: string;
  token: string;
  sourceFiles: number;
  includeReview: boolean;
  reviewAvailable: boolean;
  reviewReason?: string;
  savedReview: ReviewCounts;
  currentReview: ReviewCounts;
  copiedThreads: number;
  currentRevision: number | null;
  currentGeneration: number;
  root: string;
  engine: string;
}
export interface HistoryRestoreResult {
  project: Project;
  operationId: string;
  backupId: string;
}
export interface ArchivedReview {
  available: boolean;
  reason?: string;
  paths: string[];
  total: number;
  nextOffset?: number;
  threads: {
    id: string;
    path: string;
    resolved: boolean;
    deleted: boolean;
    excerpt: string;
    messages: number;
  }[];
  tracked?: {
    path: string;
    limited: boolean;
    hunks: TrackedHunk[];
    deleted: boolean;
  };
}
export interface ArchivedThread {
  id: string;
  path: string;
  resolved: boolean;
  deleted: boolean;
  quote: string;
  anchorStatus: string;
  messages: { id: string; body: string; deleted: boolean; created: string }[];
}
