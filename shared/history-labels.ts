export interface HistoryLabel {
  id: string;
  name: string;
  created: string;
  updated: string;
  deletedAt: string | null;
}
export interface HistoryLabelRequest {
  id: string;
  expectedRevision: number;
  action: "add" | "rename" | "remove" | "restore";
  labelId?: string;
  name?: string;
}
export const LABEL_NAME_LIMIT = 120;
export const ACTIVE_LABEL_LIMIT = 100;
export const STORED_LABEL_LIMIT = 500;
export function labelKey(name: string) {
  return name
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}
export function labelMatches(name: string, query: string) {
  const fold = (s: string) =>
    s.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US");
  return fold(name).includes(fold(query.trim()));
}
