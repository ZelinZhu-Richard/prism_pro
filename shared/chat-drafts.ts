export interface DraftKey {
  projectId: string;
  conversationId: string | null;
}
export interface ChatDraft extends DraftKey {
  text: string;
  revision: number;
  updated: string | null;
}
export interface DraftWrite {
  text: string;
  revision: number;
  requestId: string;
}
export const DRAFT_LIMIT = 16000;
export function draftKey(key: DraftKey) {
  return JSON.stringify([key.projectId, key.conversationId]);
}
