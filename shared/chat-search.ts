import type { ConversationInfo } from "./chats";
export interface ChatSearchHit {
  conversation: ConversationInfo;
  runId?: string;
  field: "title" | "prompt" | "reply";
  created: string;
  snippet: { before: string; match: string; after: string };
}
export interface ChatSearchPage {
  hits: ChatSearchHit[];
  total: number;
  nextCursor?: string;
}
