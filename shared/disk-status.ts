export interface DiskChange {
  path: string;
  change: "modified" | "deleted" | "restored" | "type" | "unsafe";
}
export interface DiskStatus {
  projectId: string;
  generation: number;
  checkedAt: number;
  changes: DiskChange[];
}
