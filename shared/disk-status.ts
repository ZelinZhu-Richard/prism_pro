import type { PersonalTexStatus } from "./tex-packages";

export interface DiskChange {
  path: string;
  change: "modified" | "deleted" | "restored" | "type" | "unsafe";
}
export interface DiskStatus {
  personalTex?: PersonalTexStatus;
  projectId: string;
  generation: number;
  checkedAt: number;
  changes: DiskChange[];
}
