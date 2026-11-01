import type { AiRun, Conversation, Proposal } from "./types";
export type ConversationInfo = Conversation & { turns: number };
export type ProposalSummary = Omit<Proposal, "files"> & {
  files: { path: string; baseRevision: number }[];
};
export interface ChatState {
  conversations: ConversationInfo[];
  activeConversationId: string | null;
  runs: AiRun[];
  proposals: ProposalSummary[];
}
export interface TurnPage {
  turns: AiRun[];
  nextBefore?: string;
  total: number;
}
export function chatStatus(
  run: AiRun,
  live?: {
    generating: boolean;
    draft: boolean;
    typing: boolean;
    paused: boolean;
  },
) {
  if (live?.draft) return "Replacement ready";
  if (live?.typing) return live.paused ? "Typing paused" : "Typing";
  if (live?.generating) return "Responding";
  const labels: Record<AiRun["status"], string> = {
    generating: "Generating in another view",
    preview: "Replacement ready",
    typing: "Typing in another view",
    paused: "Typing paused",
    completed: "Completed",
    stopped: "Stopped",
    failed: "Failed",
    interrupted: "Interrupted",
    undone: "Undone",
  };
  return labels[run.status];
}
export function mergeTurns(
  saved: AiRun[],
  live: AiRun | null,
  text: string,
  busy: boolean,
) {
  const list = [...saved];
  if (live) {
    const entry = { ...live, text: text || live.text };
    const i = list.findIndex((r) => r.id === entry.id);
    if (i >= 0)
      list[i] = {
        ...list[i],
        ...(busy ||
        ["generating", "preview", "typing", "paused"].includes(list[i].status)
          ? entry
          : { text: entry.text || list[i].text }),
      };
    else list.push(entry);
  }
  return list;
}
