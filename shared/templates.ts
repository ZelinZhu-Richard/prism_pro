import type { Engine, Project } from "./types";
export const TEMPLATE_BYTES = 100 * 1024 * 1024;
export const TEMPLATE_ENTRIES = 5000;
export const TEMPLATE_TEXT_PREVIEW = 512 * 1024;
export interface TemplateFile {
  path: string;
  kind: string;
  size: number;
  hash: string;
}
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  builtin: boolean;
  revision: number;
  created: string;
  updated: string;
  deletedAt: string | null;
  root: string;
  engine: Engine;
  hash: string;
  files: number;
  bytes: number;
}
export interface TemplateDetail extends TemplateInfo {
  entries: TemplateFile[];
  roots: string[];
}
export interface TemplateCapture {
  projectId: string;
  projectName: string;
  generation: number;
  hash: string;
  root: string;
  engine: Engine;
  entries: TemplateFile[];
  bytes: number;
  roots: string[];
}
export interface TemplateResult {
  template: TemplateDetail;
  operationId: string;
  replayed: boolean;
}
export interface TemplateProjectResult {
  project: Project;
  operationId: string;
  replayed: boolean;
}
export interface TemplateSource {
  path: string;
  kind: string;
  size: number;
  content?: string;
  reason?: string;
}
