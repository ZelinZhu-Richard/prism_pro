import path from "node:path";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { Store } from "./store";
import { AppError } from "./files";
import type { ChatSearchPage } from "../shared/chat-search";
export class ChatSearch {
  private workers = new Set<Worker>();
  private closed = false;
  constructor(
    private store: Store,
    private timeout = 2000,
  ) {}
  async search(
    projectId: string,
    input: { q?: unknown; archived?: unknown; cursor?: unknown },
  ): Promise<ChatSearchPage> {
    this.store.requireProject(projectId);
    if (
      typeof input.q !== "string" ||
      !input.q.trim() ||
      Array.from(input.q).length > 200 ||
      /[\u0000-\u001f\u007f]/.test(input.q) ||
      Buffer.from(input.q).toString() !== input.q
    )
      throw new AppError(
        400,
        "Search with 1–200 characters without control characters.",
      );
    if (
      input.archived !== undefined &&
      input.archived !== "0" &&
      input.archived !== "1"
    )
      throw new AppError(400, "Invalid chat archive filter.");
    const query = input.q.toLowerCase(),
      archived = input.archived === "1",
      scope = createHash("sha256")
        .update(JSON.stringify([projectId, query, archived]))
        .digest("hex");
    let cursor:
      | {
          scope: string;
          kind: number;
          row: number;
          runs: number;
          conversations: number;
        }
      | undefined;
    if (input.cursor !== undefined) {
      try {
        if (
          typeof input.cursor !== "string" ||
          input.cursor.length > 600 ||
          !/^[A-Za-z0-9_-]+$/.test(input.cursor)
        )
          throw new Error();
        cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
        if (
          !cursor ||
          cursor.scope !== scope ||
          ![0, 1].includes(cursor.kind) ||
          ![cursor.row, cursor.runs, cursor.conversations].every(
            (v) => Number.isSafeInteger(v) && v >= 0,
          ) ||
          cursor.row > (cursor.kind ? cursor.runs : cursor.conversations)
        )
          throw new Error();
      } catch {
        throw new AppError(
          400,
          "This search cursor does not match the project, query and archive filter. Search again.",
        );
      }
    }
    if (this.closed) throw new AppError(503, "Chat search is shutting down.");
    if (this.workers.size >= 2)
      throw new AppError(
        429,
        "Two chat searches are already running. Try again shortly.",
      );
    const result = await new Promise<ChatSearchPage>((resolve, reject) => {
      const worker = new Worker(
        new URL("./chat-search-worker.mjs", import.meta.url),
        {
          workerData: {
            database: path.join(this.store.root, "prism.sqlite"),
            projectId,
            query,
            archived,
            scope,
            cursor,
          },
          env: {},
          resourceLimits: { maxOldGenerationSizeMb: 256 },
        },
      );
      this.workers.add(worker);
      let settled = false;
      const finish = (error?: Error, value?: ChatSearchPage) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.workers.delete(worker);
        void worker.terminate();
        error ? reject(error) : resolve(value!);
      };
      const timer = setTimeout(
        () =>
          finish(
            new AppError(
              422,
              "Chat search exceeded two seconds. Refine the query and try again.",
            ),
          ),
        this.timeout,
      );
      worker.once("message", (message) =>
        message.error
          ? finish(
              new AppError(
                422,
                "Saved chats could not be searched. Retry the search.",
              ),
            )
          : finish(undefined, message.result),
      );
      worker.once("error", () =>
        finish(
          new AppError(
            422,
            "Chat search could not run within its memory limit. Refine the query and retry.",
          ),
        ),
      );
      worker.once("exit", () =>
        finish(
          new AppError(503, "Chat search was interrupted. Retry the search."),
        ),
      );
    });
    this.store.requireProject(projectId);
    return result;
  }
  async close() {
    this.closed = true;
    await Promise.all([...this.workers].map((w) => w.terminate()));
  }
}
