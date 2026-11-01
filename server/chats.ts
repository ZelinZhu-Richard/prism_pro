import type { Store } from "./store";
import { AppError } from "./files";
import type { AiRun, Conversation } from "../shared/types";
import type { ChatState, TurnPage } from "../shared/chats";
const publicRun = (value: string): AiRun => {
  const run = JSON.parse(value);
  delete run.before;
  return run;
};
export class Chats {
  constructor(private store: Store) {}
  state(projectId: string): ChatState {
    this.store.requireProject(projectId);
    // Extract lightweight state in SQLite: historical source snapshots and long replies stay out of library refreshes.
    const rows = this.store.db
      .prepare(
        `SELECT json_extract(payload,'$.conversationId') conversationId, json_object('id',id,'projectId',project,'conversationId',json_extract(payload,'$.conversationId'),'provider',json_extract(payload,'$.provider'),'model',json_extract(payload,'$.model'),'mode',json_extract(payload,'$.mode'),'path',json_extract(payload,'$.path'),'status',json_extract(payload,'$.status'),'paused',json_extract(payload,'$.paused'),'lastRevision',json_extract(payload,'$.lastRevision'),'created',json_extract(payload,'$.created'),'from',json_extract(payload,'$.from'),'to',json_extract(payload,'$.to'),'prompt','','text','') summary, json_type(payload,'$.visible') visible FROM runs WHERE project=? ORDER BY rowid`,
      )
      .all(projectId) as {
      conversationId: string;
      summary: string;
      visible: string | null;
    }[];
    const counts = new Map<string, number>();
    const runs = rows.map((row) => {
      counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + 1);
      const run = JSON.parse(row.summary) as AiRun;
      run.contextFiles = [];
      if (row.visible !== null) run.visible = "";
      if (["generating", "preview", "typing", "paused"].includes(run.status))
        return publicRun(
          (
            this.store.db
              .prepare("SELECT payload FROM runs WHERE id=?")
              .get(run.id) as { payload: string }
          ).payload,
        );
      return run;
    });
    const proposals = (
      this.store.db
        .prepare(
          `SELECT json_object('id',id,'projectId',project,'runId',json_extract(payload,'$.runId'),'summary',json_extract(payload,'$.summary'),'status',json_extract(payload,'$.status'),'files',json((SELECT json_group_array(json_object('path',json_extract(value,'$.path'),'baseRevision',json_extract(value,'$.baseRevision'))) FROM json_each(json_extract(proposals.payload,'$.files'))))) summary FROM proposals WHERE project=? ORDER BY rowid`,
        )
        .all(projectId) as { summary: string }[]
    ).map((row) => JSON.parse(row.summary));
    return {
      conversations: this.store
        .conversations(projectId)
        .map((c) => ({ ...c, turns: counts.get(c.id) ?? 0 })),
      activeConversationId: this.store.activeConversation(projectId),
      runs,
      proposals,
    };
  }
  turns(projectId: string, conversationId: string, before?: unknown): TurnPage {
    this.store.requireProject(projectId);
    this.store.conversation(conversationId, projectId);
    let cursor = Number.MAX_SAFE_INTEGER;
    if (before !== undefined) {
      if (typeof before !== "string" || before.length > 80)
        throw new AppError(400, "Invalid conversation cursor.");
      const row = this.store.db
        .prepare(
          `SELECT rowid FROM runs WHERE id=? AND project=? AND json_extract(payload,'$.conversationId')=?`,
        )
        .get(before, projectId, conversationId) as
        { rowid: number } | undefined;
      if (!row)
        throw new AppError(
          409,
          "This saved turn is no longer available. Reload the conversation.",
        );
      cursor = row.rowid;
    }
    const rows = this.store.db
      .prepare(
        `SELECT id,payload FROM runs WHERE project=? AND json_extract(payload,'$.conversationId')=? AND rowid<? ORDER BY rowid DESC LIMIT 21`,
      )
      .all(projectId, conversationId, cursor) as {
      id: string;
      payload: string;
    }[];
    const page = rows.slice(0, 20),
      total = (
        this.store.db
          .prepare(
            `SELECT count(*) n FROM runs WHERE project=? AND json_extract(payload,'$.conversationId')=?`,
          )
          .get(projectId, conversationId) as { n: number }
      ).n;
    return {
      turns: page.reverse().map((row) => publicRun(row.payload)),
      nextBefore: rows.length > 20 ? page[0]?.id : undefined,
      total,
    };
  }
  edit(projectId: string, id: string, input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new AppError(400, "Invalid conversation change.");
    const body = input as Record<string, unknown>;
    if (
      Object.keys(body).some(
        (key) => !["revision", "title", "archived"].includes(key),
      ) ||
      !Number.isSafeInteger(body.revision) ||
      Number(body.revision) < 0 ||
      (!Object.hasOwn(body, "title") && !Object.hasOwn(body, "archived"))
    )
      throw new AppError(
        400,
        "Choose a conversation change and its current revision.",
      );
    if (
      body.title !== undefined &&
      (typeof body.title !== "string" ||
        !body.title.trim() ||
        Array.from(body.title.trim()).length > 100 ||
        /[\u0000-\u001f\u007f]/.test(body.title))
    )
      throw new AppError(
        400,
        "Use a title from 1 to 100 characters without control characters.",
      );
    if (body.archived !== undefined && typeof body.archived !== "boolean")
      throw new AppError(400, "Invalid archive choice.");
    this.store.unlocked(projectId);
    const wasActive = this.store.activeConversation(projectId) === id;
    const current = this.store.conversation(id, projectId);
    if ((current.revision ?? 0) !== body.revision)
      throw new AppError(
        409,
        "This conversation changed in another view. Refresh the list and retry.",
      );
    if (typeof body.title === "string") current.title = body.title.trim();
    if (typeof body.archived === "boolean")
      current.archivedAt = body.archived ? new Date().toISOString() : null;
    current.revision = (current.revision ?? 0) + 1;
    this.store.updateConversation(current);
    if (current.archivedAt && wasActive)
      this.store.selectConversation(projectId, null);
    const { sessions, ...safe } = current;
    return safe as Conversation;
  }
  select(projectId: string, input: unknown) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      !Object.hasOwn(input, "id")
    )
      throw new AppError(400, "Choose a saved conversation or a new chat.");
    const id = (input as { id: unknown }).id;
    if (id !== null && (typeof id !== "string" || id.length > 80))
      throw new AppError(400, "Invalid conversation.");
    this.store.selectConversation(projectId, id);
    return { id };
  }
}
