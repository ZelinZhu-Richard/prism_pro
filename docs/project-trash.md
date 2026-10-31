# Recoverable project deletion

Projects use a nullable SQLite `deletedAt` timestamp. Existing databases receive an additive migration. Moving a project to Trash only updates this timestamp; its ID, edit date, source revisions, file-level Trash, history, chats, proposals, checkpoints and compiled PDFs remain intact. Restore clears the timestamp and reconciles the normal files from SQLite.

The main project list and editor switcher exclude trashed projects. The homepage Trash section has its own search, list/grid views, deletion-date sorting and Restore action. Trashed rows cannot open the editor. Stale editor/API requests cannot edit or compile a trashed project. Active AI runs, typing locks and running compilations block moving the project to Trash. Repeated move/restore requests are idempotent. A workspace containing only trashed projects does not receive a replacement demonstration project on restart.

There is no permanent-delete endpoint or automatic expiration.

## Verification

- `pnpm test`: 34 passing tests, including four new project-Trash checks.
- `pnpm build`: TypeScript and production bundle passed.
- Tested migration from the previous schema, restart persistence, exact metadata/source/history restoration, preserved binary bytes and file-level deletion, retained PDF output, stale-write rejection, active-work rejection, missing project errors, repeated requests and empty-library seeding.
- Built-in browser checks used the isolated synthetic workspace at `data/home-verification`: Move to Trash removed the project from the library and updated the sidebar count; reload retained it; Trash list/grid views exposed Restore; keyboard Enter restored it; the editor reopened with the original saved text.
- Both light and dark appearances were inspected. Normal user projects were not deleted during testing.

The homepage's project Trash is separate from the editor's existing file Trash.
