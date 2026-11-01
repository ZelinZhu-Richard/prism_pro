# Prism Local

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individual LaTeX document authors working with local projects, source files, references and compiled PDFs.

## Product Purpose

Provide an independent local LaTeX editor with a familiar Prism-style writing workspace and an assistant connected through the user's own API credentials or existing CLI login. The owner requested broad Overleaf-style editing functionality, with correctness, recoverable edits and automatic history as priorities.

## Operating Context

The first release is single-user and macOS-first. A local Node backend serves a browser editor over loopback. Project files live normally on disk; SQLite stores application state, revisions, conversations, checkpoints and AI-run metadata. Compilation uses the user's installed TeX tools. The app does not install TeX packages automatically.

## Capabilities and Constraints

- Source editing and a source-backed Visual view share project content. PDF compilation and preview remain separate from source revisions.
- Clipboard copies preserve Prism source. Visual paste supports bounded formatted text, lists and tables with one-step Undo; package requirements and detected losses require review. PNG/JPEG paste uses destination/replacement review, and remote images are never fetched.
- Existing literal tables have source-preserving drafts for cells, row/column operations, horizontal merges, widths and borders. Drafts stay outside document history until one reversible Apply. Complex custom tables remain source-editable.
- The assistant supports document-specific and whole-project scope. Persistent conversations retain context across requests. OpenAI, Anthropic, DeepSeek, Gemini and Qwen API connections and local Codex CLI/Claude Code logins are supported; provider compatibility and live-test limits are recorded separately.
- Chats retain their identity through rename and recoverable archive/restore. Selection persists locally; readable Markdown/math, paged history and per-turn source context support ongoing conversations. Unsent prompt drafts are browser-session memory, separate from saved turns.
- Local comments anchor discussion to selected source. Threads support replies, edits, resolution and recoverable Trash; changed or removed passages keep their original quote and allow explicit reattachment. Posted comments persist separately from source and can be captured in automatic review history; unsent comment drafts remain in the open workspace. Shared discussion remains separate work.
- Ordinary source review is opt-in per project through Editing/Reviewing. Pending insertions/deletions survive restart and can be accepted or rejected as individual or selected passages, with a reversible review decision. Current text remains authoritative for compilation and source export; review metadata stays separate. This single-user workflow does not provide hosted coauthor permissions or notifications.
- Review Edits presents revision-bound proposals. Manual Type previews an editable replacement before explicit approval, offers an isolated compiled draft, then inserts locally with Pause, Resume, Stop and reversible Undo. Agent activity allows read-only inspection of other files.
- Project history saves automatically and supports comparison and restoration. Versions support multiple milestone labels, a Labels view and name search, rename and recoverable removal. Labels annotate the immutable version without changing source, saved review or conversation identity; stale changes require refresh and ambiguous responses retain a replay-safe action. The owner chose to include comments and tracked changes by default, with per-project control of future capture. Saved review is inspectable before a file/project restore; legacy or omitted review preserves current discussion. Restores require source/review conflict checks, explicit confirmation and a recovery backup. Chats and the current Editing/Reviewing preference are not rolled back. File and project Trash preserve recoverable content. Replacements and other reviewed file operations must reject stale source rather than overwrite newer edits.
- Writing checks use bundled, fully local English (US/UK) dictionaries, per-language personal words and optional heuristic LaTeX hints. Corrections are explicit and reversible. Grammar services remain separate.
- Imported scripts do not run automatically. File access stays in managed project directories. API credentials must stay out of browser persistence, exports and logs. Paid generation begins only through user action.
- The owner chose local-first editing now; hosting, accounts, real-time collaboration and shared discussion remain a later phase. Their absence must remain visible in the parity ledger.

## Brand Commitments

The owner requested 简约风 and a familiar Prism-like main page and editor. Extend the established restrained interface; do not replace its identity as part of a local feature addition. Prism Local is independent and is not affiliated with OpenAI. Prism's proprietary client and backend were not recovered or copied.

## Evidence and Open Decisions

These facts come from the owner-approved implementation plan, recorded product decisions and current repository behavior. [README.md](README.md) documents operation; [the parity ledger](docs/overleaf-parity.md) records delivered and outstanding work; [verification](docs/verification.md) records evidence and limits. Full Overleaf parity is an active objective, not a completed claim. The owner selected fully local English (US/UK) spelling. Online grammar services remain undecided; silence does not authorize sending document passages to an online service.
