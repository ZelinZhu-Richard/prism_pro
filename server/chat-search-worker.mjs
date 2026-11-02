import { workerData, parentPort } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
// Literal case-insensitive substrings, with original Unicode retained in snippets.
function snippet(text, query) {
  const start = text.toLowerCase().indexOf(query);
  let folded = 0,
    from = 0,
    to = text.length,
    offset = 0;
  for (const char of text) {
    const end = folded + char.toLowerCase().length;
    if (folded <= start && start < end) from = offset;
    if (folded < start + query.length && start + query.length <= end) {
      to = offset + char.length;
      break;
    }
    folded = end;
    offset += char.length;
  }
  const left = Array.from(text.slice(0, from)),
    right = Array.from(text.slice(to));
  return {
    before: (left.length > 70 ? "…" : "") + left.slice(-70).join(""),
    match: text.slice(from, to),
    after: right.slice(0, 110).join("") + (right.length > 110 ? "…" : ""),
  };
}
let db;
try {
  const { database, projectId, query, archived, scope, cursor } = workerData;
  db = new DatabaseSync(database, { readOnly: true });
  db.function("chat_fold", { deterministic: true }, (value) =>
    String(value ?? "").toLowerCase(),
  );
  db.exec("BEGIN");
  const runs =
    cursor?.runs ??
    db
      .prepare("SELECT coalesce(max(rowid),0) n FROM runs WHERE project=?")
      .get(projectId).n;
  const conversations =
    cursor?.conversations ??
    db
      .prepare(
        "SELECT coalesce(max(rowid),0) n FROM conversations WHERE project=?",
      )
      .get(projectId).n;
  const cte = `WITH scoped AS (
    SELECT rowid rid,id,payload FROM conversations WHERE project=:project AND rowid<=:conversations
    AND (json_extract(payload,'$.archivedAt') IS NOT NULL AND json_extract(payload,'$.archivedAt')!='')=:archived
  ), hits AS (
    SELECT 0 kind,c.rid rid,c.id conversationId,NULL runId,'title' field,json_extract(c.payload,'$.title') text,json_extract(c.payload,'$.created') created FROM scoped c WHERE instr(chat_fold(json_extract(c.payload,'$.title')),:query)>0
    UNION ALL
    SELECT 1 kind,r.rowid rid,c.id conversationId,r.id runId,
    CASE WHEN instr(chat_fold(json_extract(r.payload,'$.prompt')),:query)>0 THEN 'prompt' ELSE 'reply' END field,
    CASE WHEN instr(chat_fold(json_extract(r.payload,'$.prompt')),:query)>0 THEN json_extract(r.payload,'$.prompt') ELSE json_extract(r.payload,'$.text') END text,json_extract(r.payload,'$.created') created
    FROM runs r JOIN scoped c ON c.id=json_extract(r.payload,'$.conversationId') WHERE r.project=:project AND r.rowid<=:runs
    AND (instr(chat_fold(json_extract(r.payload,'$.prompt')),:query)>0 OR instr(chat_fold(json_extract(r.payload,'$.text')),:query)>0)
  )`;
  const params = {
    project: projectId,
    conversations,
    runs,
    archived: +archived,
    query,
  };
  const total = db.prepare(cte + " SELECT count(*) n FROM hits").get(params).n;
  const rows = db
    .prepare(
      cte +
        " SELECT * FROM hits WHERE kind>:kind OR (kind=:kind AND rid<:row) ORDER BY kind,rid DESC LIMIT 21",
    )
    .all({
      ...params,
      kind: cursor?.kind ?? 0,
      row: cursor?.row ?? Number.MAX_SAFE_INTEGER,
    });
  const selected = rows.slice(0, 20);
  const getConversation = db.prepare(
    `SELECT json_extract(payload,'$.title') title,json_extract(payload,'$.created') created,json_extract(payload,'$.updated') updated,json_extract(payload,'$.revision') revision,json_extract(payload,'$.archivedAt') archivedAt,(SELECT count(*) FROM runs WHERE project=:project AND json_extract(payload,'$.conversationId')=:id) turns FROM conversations WHERE project=:project AND id=:id`,
  );
  const hits = selected.map((row) => ({
    conversation: {
      id: row.conversationId,
      projectId,
      ...getConversation.get({ project: projectId, id: row.conversationId }),
    },
    ...(row.runId ? { runId: row.runId } : {}),
    field: row.field,
    created: row.created,
    snippet: snippet(row.text ?? "", query),
  }));
  const last = selected.at(-1);
  const nextCursor =
    rows.length > 20
      ? Buffer.from(
          JSON.stringify({
            scope,
            kind: last.kind,
            row: last.rid,
            runs,
            conversations,
          }),
        ).toString("base64url")
      : undefined;
  db.exec("COMMIT");
  parentPort.postMessage({ result: { hits, total, nextCursor } });
} catch {
  parentPort.postMessage({ error: true });
} finally {
  db?.close();
}
