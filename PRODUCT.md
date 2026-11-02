# Leaf

<!-- impeccable:product-schema 1 -->

## Active Direction — 2026-11-02

The owner adopted [the Leaf implementation plan](docs/LEAF_IMPLEMENTATION_PLAN.md) and its [verbatim product specification](docs/LEAF_PRODUCT_SPEC.md) as the replacement for the older Overleaf-parity/AI-expansion plan. Current work prioritizes a private offline local writing environment, safe ordinary filesystem projects, real compilation/PDF navigation, recovery and professional editing. New AI expansion, cloud and complex WYSIWYG development are excluded from the prioritized work. The owner explicitly chose the Leaf name, retained existing AI assistants/API calls, and deferred native packaging in favor of the current browser app. Those decisions override conflicting clauses in the supplied specification; current AI functionality stays available without becoming a dependency for local writing.

The source audit and executed checks are maintained in docs/LEAF_AUDIT.md and docs/LEAF_TEST_REPORT.md. The local browser/Node architecture remains the approved current delivery; native desktop packaging is deferred. Existing neutral styling and saved theme preferences remain intact; the target experience is light-first and 简约风.

## Platform

web

## Users

Individual LaTeX document authors working with local projects, source files, references and compiled PDFs.

## Product Purpose

Provide an independent local-first LaTeX writing environment with reliable saving, actual compilation, integrated PDF navigation and offline authoring. Preserve the existing optional assistant connected through the user’s API credentials or existing CLI login. Correctness, recoverable edits and ordinary local project workflows take priority over feature count.

## Operating Context

The first release is single-user and macOS-first. A local Node backend serves a browser editor over loopback. Project files live normally on disk; SQLite stores application state, revisions, conversations, checkpoints and AI-run metadata. Compilation uses the user's installed TeX tools. The app does not install TeX packages automatically.

## Capabilities and Constraints

- Source editing and a source-backed Visual view share project content. PDF compilation and preview remain separate from source revisions.
- Compiler selection includes pdfLaTeX, LaTeX through DVI/PostScript/PDF, XeLaTeX and LuaLaTeX. Per-project compile options can follow the Mac's system TeX selection or pin an installed TeX Live runtime. Builds record the resolved installation; missing or changed tools require explicit recovery without fallback or automatic installation. Runtime choices remain separate from source/history and default to System for copies/new projects.
- Compile options are saved per project, captured on each build and separate from source history: normal/fast draft graphics and stop/continue after errors. The owner confirmed Stop on first error as the default; normal graphics remain the default compile mode. Erroneous PDFs are explicitly labeled and never become the last successful build. Generated-file inspection/download uses finished build snapshots, with explicit source/output ZIP review and consent for archive-only replacements; project files remain unchanged.
- Clipboard copies preserve Leaf source. Visual paste supports bounded formatted text, lists and tables with one-step Undo; package requirements and detected losses require review. PNG/JPEG paste uses destination/replacement review, and remote images are never fetched.
- Existing literal tables have source-preserving drafts for cells, row/column operations, horizontal merges, widths and borders. Drafts stay outside document history until one reversible Apply. Complex custom tables remain source-editable.
- The assistant supports document-specific and whole-project scope. Persistent conversations retain context across requests. OpenAI, Anthropic, DeepSeek, Gemini and Qwen API connections and local Codex CLI/Claude Code logins are supported; provider compatibility and live-test limits are recorded separately.
- Chats retain their identity through rename and recoverable archive/restore. Selection persists locally; readable Markdown/math, paged history and per-turn source context support ongoing conversations. Confirmed unsent prompt saves persist locally per conversation, separate from saved turns; pending in-memory text can still be lost before its debounced save commits.
- Local comments anchor discussion to selected source. Threads support replies, edits, resolution and recoverable Trash; changed or removed passages keep their original quote and allow explicit reattachment. Posted comments persist separately from source and can be captured in automatic review history; unsent comment drafts remain in the open workspace. Shared discussion remains separate work.
- Unsaved source is journaled immediately in the browser and mirrored to local SQLite before normal autosave. Recover draft and File versions offer literal disk/editor review, download and explicit choices; stale/agent/project guards preserve both versions. Storage failures remain visible; full folder discovery remains separate work.
- Source saving is configurable in Editor settings, with Automatic/Manual mode and independent save/build delays. Manual mode retains draft recovery and exposes Save/status; navigation and explicit compilation still preflight-save. Saved preferences are validated and persist locally; automatic work rechecks destination, source and locks.
- Ordinary source review is opt-in per project through Editing/Reviewing. Pending insertions/deletions survive restart and can be accepted or rejected as individual or selected passages, with a reversible review decision. Current text remains authoritative for compilation and source export; review metadata stays separate. This single-user workflow does not provide hosted coauthor permissions or notifications.
- Review Edits presents revision-bound proposals. Manual Type previews an editable replacement before explicit approval, offers an isolated compiled draft, then inserts locally with Pause, Resume, Stop and reversible Undo. Agent activity allows read-only inspection of other files.
- Typing Undo names its target and is available while inspecting another file. Recovery saves unrelated pending edits first, restores the target source/selection, preserves one-event Redo, and offers a safe named retry after an ambiguous response; later target edits are never overwritten.
- Unsent AI prompts autosave locally per project and conversation, including New conversation. Confirmed saves survive reload/restart; drafts retain exact text through failed starts and require an explicit choice for competing window versions. Accepted runs consume only the submitted draft in the same database transaction; drafting itself creates no chat, session, source revision or checkpoint.
- Project history saves automatically and supports comparison and restoration. Versions support multiple milestone labels, a Labels view and name search, rename and recoverable removal. Labels annotate the immutable version without changing source, saved review or conversation identity; stale changes require refresh and ambiguous responses retain a replay-safe action. The owner chose to include comments and tracked changes by default, with per-project control of future capture. Saved review is inspectable before a file/project restore; legacy or omitted review preserves current discussion. Restores require source/review conflict checks, explicit confirmation and a recovery backup. Chats and the current Editing/Reviewing preference are not rolled back. File and project Trash preserve recoverable content. Replacements and other reviewed file operations must reject stale source rather than overwrite newer edits.
- The local project library supports private tags with preset/custom colors, recoverable tag removal, an archive and reviewed multi-project tag/archive/Trash/restore actions. Archived projects remain editable; restoring a trashed archived project retains archive status. Nested source ZIP export is bounded and independent of compiled output, conversations and history.
- New projects can use seven generic built-in templates or immutable local personal snapshots. Save as template captures active source/assets/folders independently of the original, with explicit separate compilation, fresh project state on creation and recoverable template Trash. It does not provide an online gallery or institution/publisher compliance guarantees.
- Writing checks use bundled, fully local English (US/UK) dictionaries, per-language personal words and optional heuristic LaTeX hints. Corrections are explicit and reversible. Grammar services remain separate.
- Imported scripts do not run automatically. File access stays in managed project directories. API credentials must stay out of browser persistence, exports and logs. Paid generation begins only through user action.
- The owner chose local-first browser editing now and deferred native packaging. Hosting, accounts, real-time collaboration and shared discussion are outside the current Leaf plan.

## Brand Commitments

The owner requested 简约风 and approved the Leaf name with a light-first professional writing experience. Preserve the existing restrained neutral layout, density and optional AI workflows. The familiar Prism-inspired editor is historical inspiration, not a requirement to reproduce proprietary code. Leaf is independent and is not affiliated with OpenAI; Prism's proprietary client/backend were not recovered or copied. The existing Prism folder and prism_pro repository remain unchanged.

## Evidence and Open Decisions

These facts come from the owner-approved implementation plan, recorded product decisions and current repository behavior. [README.md](README.md) documents operation; [the parity ledger](docs/overleaf-parity.md) records delivered and outstanding work; [verification](docs/verification.md) records evidence and limits. The former full-Overleaf-parity objective is superseded by the new Leaf plan, rather than claimed complete. The owner selected fully local English (US/UK) spelling. The builder proceeded with built-in plus personal templates after an unanswered optional preference question; this is an implementation assumption, not a confirmed owner decision. The owner chose to keep bibliography fully local for now; external reference-manager connections are deferred. Online grammar services remain undecided; silence does not authorize sending document passages to an online service.

Saved discussion search is local to the active project. It covers saved titles, prompts and replies with literal excerpts and exact turn navigation, with archived chats kept behind their explicit scope/restore action. Searching or opening a hit does not start a generation; composer text remains attached to its own chat. It does not search unsent drafts, source snapshots or native-session identifiers.

Replacement preview has a separate local compile Stop and recoverable status. Compilation, status recovery and cancellation do not type source or create a paid request. A stopped build retains the current replacement, and Discard cancels its build. Starting to type waits for the preview compiler to exit. Saved compile status can be reopened; unapplied edited replacement text and suggestions remain session-only, and an earlier result is labelled against the current replacement. Stop on first error stays the default.
