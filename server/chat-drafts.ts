import type { Store } from "./store";
import { AppError } from "./files";
import {
  DRAFT_LIMIT,
  type ChatDraft,
  type DraftWrite,
} from "../shared/chat-drafts";
export class ChatDrafts {
  constructor(private store: Store) {}
  private scope(
    projectId: string,
    conversationId: unknown,
  ): asserts conversationId is string | null {
    this.store.requireProject(projectId);
    if (
      conversationId !== null &&
      (typeof conversationId !== "string" ||
        !conversationId ||
        conversationId.length > 80)
    )
      throw new AppError(
        400,
        "Choose a saved conversation or New conversation.",
      );
    if (conversationId !== null)
      this.store.conversation(conversationId, projectId);
  }
  read(projectId: string, conversationId: unknown): ChatDraft {
    this.scope(projectId, conversationId);
    const row = this.store.db
      .prepare(
        "SELECT text,revision,updated FROM chat_drafts WHERE project=? AND conversation=?",
      )
      .get(projectId, conversationId ?? "") as
      { text: string; revision: number; updated: string } | undefined;
    return {
      projectId,
      conversationId,
      text: row?.text ?? "",
      revision: row?.revision ?? 0,
      updated: row?.updated ?? null,
    };
  }
  assertCurrent(
    projectId: string,
    conversationId: string | null,
    revision: unknown,
    text: string,
  ) {
    if (!Number.isSafeInteger(revision) || Number(revision) < 0)
      throw new AppError(400, "Invalid chat draft revision.");
    const current = this.read(projectId, conversationId);
    if (current.revision !== revision || current.text !== text)
      throw new AppError(
        409,
        "This chat draft changed in another window. Review the saved draft before sending.",
      );
    return current;
  }
  save(projectId: string, conversationId: unknown, input: unknown): ChatDraft {
    this.scope(projectId, conversationId);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new AppError(400, "Invalid chat draft.");
    const v = input as DraftWrite;
    if (
      Object.keys(v).some(
        (k) => !["revision", "requestId", "text"].includes(k),
      ) ||
      typeof v.text !== "string" ||
      v.text.length > DRAFT_LIMIT ||
      Buffer.from(v.text).toString("utf8") !== v.text ||
      !Number.isSafeInteger(v.revision) ||
      v.revision < 0 ||
      typeof v.requestId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,80}$/.test(v.requestId)
    )
      throw new AppError(
        400,
        "Use a chat draft of up to 16,000 characters with its current revision.",
      );
    return this.store.transaction(() => {
      const prior = this.store.db
        .prepare(
          "SELECT request,text FROM chat_drafts WHERE project=? AND conversation=?",
        )
        .get(projectId, conversationId ?? "") as
        { request: string; text: string } | undefined;
      if (prior?.request === v.requestId) {
        if (prior.text !== v.text)
          throw new AppError(
            409,
            "This draft retry has different text. Reload the saved draft.",
          );
        return this.read(projectId, conversationId);
      }
      const current = this.read(projectId, conversationId);
      if (current.revision !== v.revision)
        throw new AppError(
          409,
          "This chat draft changed in another window. Your text has been kept; review both drafts.",
        );
      this.write(
        projectId,
        conversationId,
        v.text,
        current.revision + 1,
        v.requestId,
      );
      return this.read(projectId, conversationId);
    });
  }
  /** Called inside the same transaction that records the accepted AI run. */
  consume(
    projectId: string,
    conversationId: string | null,
    revision: number,
    text: string,
    runId: string,
  ) {
    const current = this.assertCurrent(
      projectId,
      conversationId,
      revision,
      text,
    );
    this.write(
      projectId,
      conversationId,
      "",
      current.revision + 1,
      "run-" + runId,
    );
    return current.revision + 1;
  }
  private write(
    projectId: string,
    conversationId: string | null,
    text: string,
    revision: number,
    request: string,
  ) {
    this.store.db
      .prepare(
        "INSERT INTO chat_drafts(project,conversation,text,revision,updated,request) VALUES(?,?,?,?,?,?) ON CONFLICT(project,conversation) DO UPDATE SET text=excluded.text,revision=excluded.revision,updated=excluded.updated,request=excluded.request",
      )
      .run(
        projectId,
        conversationId ?? "",
        text,
        revision,
        new Date().toISOString(),
        request,
      );
  }
}
