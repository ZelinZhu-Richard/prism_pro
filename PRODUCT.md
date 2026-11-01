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
- The assistant supports document-specific and whole-project scope. Persistent conversations retain context across requests. OpenAI, Anthropic, DeepSeek, Gemini and Qwen API connections and local Codex CLI/Claude Code logins are supported; provider compatibility and live-test limits are recorded separately.
- Review Edits presents revision-bound proposals. Manual Type previews an editable replacement before explicit approval, offers an isolated compiled draft, then inserts locally with Pause, Resume, Stop and reversible Undo. Agent activity allows read-only inspection of other files.
- Project history saves automatically and supports comparison and restoration. File and project Trash preserve recoverable content. Replacements and other reviewed file operations must reject stale source rather than overwrite newer edits.
- Imported scripts do not run automatically. File access stays in managed project directories. API credentials must stay out of browser persistence, exports and logs. Paid generation begins only through user action.
- The owner chose local-first editing now; hosting, accounts, real-time collaboration and shared discussion remain a later phase. Their absence must remain visible in the parity ledger.

## Brand Commitments

The owner requested 简约风 and a familiar Prism-like main page and editor. Extend the established restrained interface; do not replace its identity as part of a local feature addition. Prism Local is independent and is not affiliated with OpenAI. Prism's proprietary client and backend were not recovered or copied.

## Evidence and Open Decisions

These facts come from the owner-approved implementation plan, recorded product decisions and current repository behavior. [README.md](README.md) documents operation; [the parity ledger](docs/overleaf-parity.md) records delivered and outstanding work; [verification](docs/verification.md) records evidence and limits. Full Overleaf parity is an active objective, not a completed claim. The spelling/grammar service decision remains open; silence does not authorize sending document passages to an online service.
