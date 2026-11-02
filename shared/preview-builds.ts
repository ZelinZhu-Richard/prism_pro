import type { CompileJob } from "./types";
export interface PreviewBuildState {
  runId: string;
  requestId?: string;
  textHash?: string;
  cancelled: boolean;
  unavailable?: boolean;
  job: CompileJob | null;
}
