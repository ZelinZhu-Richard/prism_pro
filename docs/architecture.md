# Architecture

The browser talks only to a loopback Fastify backend. Provider credentials live in that backend's memory or process environment. `server/providers.ts` normalizes OpenAI Responses, Anthropic Messages, and DeepSeek, Gemini, and Qwen Chat Completions streams, tool calls, usage, cancellation, and sanitized errors. Provider destinations are fixed HTTPS URLs, with allowlisted Alibaba regional endpoints for Qwen. Redirects are rejected. Gemini thought signatures are preserved through tool rounds. CLI keys persist in a gitignored, owner-only `.env` file loaded on startup; UI keys and endpoint overrides are session-only. `server/key-file.ts` performs atomic key-file updates and excludes key values from status output.

`server/ai.ts` orchestrates Review Edits tool rounds and one-request Manual Type runs. Every run has an ID, mode, captured file/revision/selection, state, and usage. A server lock reserves the Manual Type target; a 45-second heartbeat lease cancels abandoned runs. A server restart marks active runs interrupted. Manual Type's network generation is independent of `src/typing.ts`'s grapheme buffer and local delays. The final pending grapheme is held until the next fragment or end-of-stream so split combining characters and emoji stay intact. Stop discards uninserted buffered text. CodeMirror composition history groups the run into one undo event across pauses.

`server/store.ts` uses transactions for file revisions, checkpoints, and multi-file patch validation/application. Each change materializes ordinary files with a unique atomic-write temporary filename. SQLite is authoritative if a crash occurs between database commit and materialization. Renames, deletion, restoration, and checkpoints increment revisions. Patch Undo refuses to replace subsequent user edits.

`server/compiler.ts` takes a fresh snapshot for every job, runs `latexmk` with a sanitized environment inside a deny-default macOS sandbox, and persists job IDs and metadata. It retains successful PDFs independently of current source generation. Cancellation targets the subprocess group. PDF and SyncTeX endpoints refer to immutable job IDs. Missing Biber is detected before spawning for biblatex projects that require it. Basic diagnostic parsing handles file/line errors and common warnings; unusual package log formats remain visible in the full log.

The browser uses PDF.js canvases with zoom and page navigation. SyncTeX coordinates navigate to the source line or PDF page and position. This release does not implement a full accessible PDF text-selection layer.

## Local API

All mutations require `X-Prism-Request: 1`. JSON bodies use `Content-Type: application/json`; imports/uploads use multipart. Host and Origin must match loopback ports 4317/5173.

| Resource                     | Endpoints                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Health and tool availability | `GET /api/health`                                                                                   |
| Projects                     | `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`                                             |
| Project Trash                | `GET /api/projects/trash`, `POST /api/projects/:id/trash`, `POST /api/projects/:id/restore-project` |
| Source                       | `GET/PUT/POST/DELETE /api/projects/:id/file?path=...`                                               |
| Assets                       | `GET /api/projects/:id/raw?path=...`, `POST /api/projects/:id/upload`                               |
| Rename, Trash                | `POST /api/projects/:id/rename`, `POST /api/projects/:id/restore`                                   |
| ZIP                          | `POST /api/import`, `GET /api/projects/:id/export`                                                  |
| Checkpoints                  | `GET/POST /api/projects/:id/checkpoints`, `POST /api/projects/:id/checkpoints/:checkpoint/restore`  |
| Compilation                  | `GET /api/projects/:id/builds`, `POST /api/projects/:id/compile`, `POST /api/builds/:id/cancel`     |
| PDF, SyncTeX                 | `GET /api/builds/:id/pdf`, `POST /api/builds/:id/sync`                                              |
| Settings                     | `GET /api/settings`, `PUT /api/settings/preferences`                                                |
| Providers                    | `PUT /api/providers/:provider/key`, `POST /api/providers/:provider/verify`                          |
| AI routing                   | `POST /api/ai/quote`                                                                                |
| Generation                   | `POST /api/ai/runs` (SSE), `GET /api/projects/:id/chats`                                            |
| Typing state                 | `PUT /api/ai/runs/:id/progress`, `POST /api/ai/runs/:id/heartbeat`, `/stop`, `/finish`, `/undo`     |
| Review                       | `POST /api/proposals/:id/apply`, `/reject`, `/undo`                                                 |

See `shared/types.ts` for data contracts and `tests/` for conflict, streaming, and lifecycle examples. No HTTP API can read arbitrary filesystem paths or execute arbitrary shell commands.
