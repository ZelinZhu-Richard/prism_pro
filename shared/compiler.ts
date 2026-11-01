export interface CompileOptions {
  mode: "normal" | "draft";
  errorHandling: "stop" | "continue";
}
export interface CompileSettings extends CompileOptions {
  revision: number;
}
export const DEFAULT_COMPILE_OPTIONS: Readonly<CompileOptions> = Object.freeze({
  mode: "normal",
  errorHandling: "stop",
});
/** Jobs created before compile options were introduced used normal/stop. */
export function compileOptions(value?: unknown): CompileOptions {
  const v = value as Partial<CompileOptions> | undefined;
  return {
    mode: v?.mode === "draft" ? "draft" : "normal",
    errorHandling: v?.errorHandling === "continue" ? "continue" : "stop",
  };
}
export function sameCompileOptions(a?: unknown, b?: unknown): boolean {
  const x = compileOptions(a),
    y = compileOptions(b);
  return x.mode === y.mode && x.errorHandling === y.errorHandling;
}
export interface BuildFile {
  path: string;
  bytes: number;
}
export interface BuildFiles {
  buildId: string;
  projectId: string;
  generation: number;
  root: string;
  engine: string;
  status: string;
  started: string;
  preview: boolean;
  options: CompileOptions;
  files: BuildFile[];
  sourceFiles: number;
  sourceBytes: number;
}
export interface BuildExportPlan {
  buildId: string;
  paths: string[];
  includeSource: boolean;
  files: BuildFile[];
  bytes: number;
  collisions: string[];
  hash: string;
}
export interface BuildDownload {
  id: string;
  url: string;
  filename: string;
  bytes: number;
  expiresAt: string;
}
export const BUILD_FILE_LIMIT = 5000;
export const BUILD_EXPORT_BYTES = 100 * 1024 * 1024;
export const BUILD_TEXT_BYTES = 512 * 1024;
