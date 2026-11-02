# Leaf repository audit

Updated 2026-11-02. Active scope: [implementation plan](LEAF_IMPLEMENTATION_PLAN.md), based on the [verbatim supplied specification](LEAF_PRODUCT_SPEC.md). Audited repository baseline: `e16c7f1`. The owner chose Leaf branding, retained all existing AI functionality, and deferred native desktop packaging. Prior completed checks are identified separately from tests run for this audit.

## Architecture and baseline

React 19 + TypeScript + Vite; CodeMirror 6 source/projected Visual editor; bundled PDF.js/KaTeX; Fastify/Node 22+ loopback engine; SQLite metadata, source revisions and durable disk-write receipts synchronized with managed ordinary folders. Indexed disk changes are reconciled on startup without replacing external bytes. There is no native desktop shell or installer; these are explicitly deferred by the owner. The existing backend is local, not a hosted service. User-supplied workspace instructions apply; no additional AGENTS.md exists at the three explicitly checked ancestor/project paths. Work stays under this repository; private projects and holdout are not part of this audit.

The baseline suite executed successfully: **594/594**, no skipped tests. Production build/typecheck results are recorded in the test report. Prior browser/compiler evidence in docs/verification is retained as historical evidence; it is not automatically a fresh Leaf acceptance pass.

## Feature inventory

Statuses describe the entire requested capability, not merely existence of a component. Complete means the bounded implementation has working tests/evidence; partial means the wider Leaf requirement still has gaps.

| Feature | Status | Code / observed evidence | Gap and priority | Verification |
| --- | --- | --- | --- | --- |
| Offline local source editing | Partial | src/components/Editor.tsx; CodeMirror, local API, bundled fonts/assets | Fresh no-network acceptance after desktop delivery, P0 | Isolated IAB, network/request audit |
| Native desktop installation/launch | Missing | package.json offers Vite build + Node start only | Deferred by owner; current target is browser delivery | Real packaged launch, install/build checks |
| Actual filesystem project ownership | Partial | server/disk-files.ts and Store.reconcileDisk preserve indexed external changes and both versions | Managed import only; unindexed discovery/folder opening remain P0 |29 regressions, real recovery builds/ZIP/SyncTeX |
| TeX discovery and configured installations | Partial | server/tex-runtimes.ts; System/pinned installed runtimes; backend extra bin dirs | UI arbitrary executable selection not present; one physical installation verified, P0 | Current installed-tool probe; synthetic builds |
| Root-document detection/selection | Complete for managed projects | server/files.ts findRoots; explicit project root setting, tests/import.test.ts | External folder entry points depend on filesystem work, P0 | ZIP/multi-root tests + real compile |
| Real multipass compilation | Partial | compiler.ts + latexmk; four engines and bib tool preflight | Fixed cutoff removed in this increment with optional trusted deadline; each build still starts fresh instead of dependency reuse, P0 | Real compiler/lifecycle tests |
| Compiler process cancellation/recovery | Complete at recorded scope | independent compiler-supervisor.mjs, supervision.ts, tests/supervision.test.ts | Keep cleanup after backend loss; expand evidence for new policy, P0 | Explicit Stop, parent exit/SIGKILL, drain checks |
| BibTeX/Biber | Partial | tool detection, .blg diagnostics, bibliography builds | Biber absent locally; do not call live Biber verified, P0 | BibTeX real builds; Biber fixtures/unrun live |
| Autosave / configurable save | Partial | App.tsx 600ms save; revision check, store atomic rename | No configurable source autosave; source draft before debounce not durable, P0 | Failed-write/crash and dirty-state tests |
| External changes / conflict resolution | Partial | Restart adoption/deletion with before/after history; active writes reject conflicting disk bytes | Live disk/buffer review and change discovery remain P0 | Actual writes, actual crashes and isolated IAB history |
| Crash recovery | Partial | SQLite WAL, staged-tree moves, source versions and durable per-file write intents | Unsaved pre-debounce source recovery remains P0; no power-loss guarantee | Six actual process deaths at write boundaries |
| Code editor core | Complete at bounded scope | Editor.tsx, history, multi-selection, folding, indentation, brackets, tests | Recheck real keyboard interactions and large files, P0 | IAB keyboard/selection/Undo + fixture timings |
| LaTeX environment/package tools | Partial | latex-completion.ts commands/environments; citation/label index | Broad package completion, matching/closing and definition navigation, P0 | Completion/parser fixtures + actual editor |
| Local source formatting | Missing | SourceToolbar formatSource applies inline formatting, not latexindent | Detect/use local formatter with safe process and reviewed edit, P0 | Formatting command and exact Undo |
| Quick-open / command palette | Missing | No corresponding source commands found | Cmd+P / Cmd+Shift+P with functional commands, P0 | Keyboard and source navigation |
| Editor settings / shortcuts | Partial | shared/editor-preferences.ts; native Vim/Emacs/default; Cmd+S/Enter | Configurable shortcut map limited; no source autosave/idle-delay settings, P0 | Preference validation, persistence and IAB |
| Project-wide search/replacement | Complete at bounded scope | server/project-search.ts worker; reviewed multi-file apply/Undo | Large-project limits documented; external change invalidation still required, P0 | Existing 594-suite cases + real endpoint checks |
| Continuous real PDF preview | Complete at recorded scope | PdfPreview/PdfPage; PDF.js, fit/zoom/page/bookmarks/find/selection/links | Revalidate stable reading state through new compile policies, P0 | Real PDF, scroll/zoom/recompile |
| Bidirectional included-file SyncTeX | Complete at recorded scope | compiler.sync methods + source/PDF handlers | Fresh Leaf multi-file acceptance needed, P0 | Actual source/PDF coordinates on nested files |
| PDF export / open / reveal | Partial | PDF download endpoint/link and generated files | Native external Open/Reveal not implemented, P0 | Byte-identical exported PDF + native operations |
| Actionable diagnostics | Partial | final-pass diagnostics, source locations, clickable cards/gutters | Plain deterministic common-error guidance/info grouping incomplete, P0 | Real errors/missing dependencies + location checks |
| File/folder operations and Trash | Complete within managed scope | FileTree, file-moves, file-batches, project Trash, recovery tests | External directory ownership/watch/conflicts remain, P0 | Move/upload/restore/crash + ZIP round-trip |
| ZIP imports / local templates | Complete at bounded scope | readZip traversal/link/size validation; built-in + personal snapshots | More template compatibility; ordinary folder open missing, P0 | Unsafe ZIP tests and real compiled fixture |
| Workspace restore / panel layouts | Partial | recent project/conversation/UI preferences and resizable panels | General layout presets and reliable hide/restore of all panels, P0 | IAB resize/keyboard/relaunch |
| Automatic source/review history | Complete at bounded scope | automatic checkpoints, diff/file restore, comments/review capture, labels | Filesystem reconciliation and crash-pending state integration, P0/P1 | History tests, exact Apply/Undo, interrupted saves |
| Optional local Git integration | Missing | Application repo uses Git; no document-project Git UI | Defer until safe filesystem projects, P1 | Synthetic local repository, no remote requests |
| Local bibliography/citations | Complete at bounded scope | ReferencesPanel, intelligence.ts; key/author/title/year search/completion | External Better BibTeX updates not detected, P1 | Bib parser/index tests + external .bib change |
| Math/figure/table authoring | Partial | source-backed tools, KaTeX, symbol palette, table drafts | Matrix/aligned snippets and reference helpers coverage, P1 | Readable generated source, actual TeX, Undo |
| Local spelling / word count | Complete at recorded scope | bundled US/UK dictionaries; TeXcount; writing checks | More custom macros; current dictionary network audit, P1 | Offline checks and actual TeXcount |
| Research manuscript preflight | Partial | warnings, references/index, heuristics in separate panels | Unified deterministic missing-file/include/citation checks, P2 | Broken/successful synthetic manuscripts |
| Performance baselines | Missing as release baseline | Worker-based project/PDF search, bounded rendering/read paths | App.tsx is large; continuous polling; no reproducible startup/edit/idle baseline, P2 | Measure real fixtures/machine, no invented numbers |
| Optional AI and cloud surface | Existing, outside new work scope | five API providers + two native CLI adapters and assistant UI | Owner explicitly retained all existing AI functionality; no live calls in this batch | Preserve existing tests/data; no live requests |

## Confirmed data-loss reproduction

`data/verification/leaf-audit/disk-overwrite-before.json` records a fresh synthetic project. After writing `External editor text.` directly to its ordinary main.tex, Store.readText still returned `Original database text.`. Closing and reopening Store overwrote the disk file with that old database content. Reproduction script: `data/verification/leaf-audit/reproduce-disk-overwrite.ts`. This was a release-blocking defect. The indexed-file restart path is now fixed and separately verified in [disk recovery](verification/disk-recovery.md); live conflict resolution and full filesystem project ownership remain incomplete.

## Cross-cutting findings

- **Data integrity:** pending source text lives in memory until a 600ms save; indexed external edits now reconcile at restart, with active writes refusing mismatches. Durable write intents distinguish unfinished app writes from later disk changes. Live dirty-buffer review remains missing. Do not bolt an unreviewed directory watcher onto this architecture and claim safe filesystem support.
- **Security:** existing imports reject unsafe paths/links/oversized entries; compiler arguments are structured, shell escape/imported configs disabled, credentials excluded and macOS confinement applied. These prior strengths must survive desktop/filesystem work. Arbitrary scripts must remain inert. Unknown vulnerabilities and arbitrary configured tool trust are not certified by these checks.
- **Network/privacy:** core fetch wrappers use loopback relative paths. API providers are explicit outbound features; bundled writing dictionaries use a same-origin fetch. No telemetry implementation was found in the inspected paths. This inspection is not yet an observed full offline launch/compile/export trace.
- **Disconnected/duplicated features:** no proven dead dependency or duplicate editor engine was removed. Inline formatting is not a real source formatter; a browser download is not filesystem Reveal. Existing Visual mode is retained rather than extended into new complex WYSIWYG work. App.tsx couples many flows, making targeted extraction safer than a wholesale rewrite.
- **Testing:** 594 existing tests are substantial but are not native packaging, file watching, source draft crash recovery, no-network end-to-end or reproducible performance baselines. Add missing tests alongside each implementation; keep unrun dependencies explicit.

## Prioritized backlog

1. P0 safe ordinary filesystem project boundary, external changes, disk/buffer conflicts and restart materialization; preserve both versions on ambiguity.
2. P0 source draft recovery and configurable safe saving.
3. P0 remove the arbitrary production two-minute compile cap, retaining explicit cancellation and orphan cleanup; support an optional owner-chosen deadline.
4. P0 approved desktop launch/open/export/reveal and essential offline acceptance.
5. P0 quick-open/command palette, local formatting, environment/navigation gaps and panel control.
6. P1 verify/reuse authoring/history/bibliography workflows, then fill evidenced gaps.
7. P2 unified preflight and measured performance work, then full release verification.

Product naming, AI and delivery decisions are recorded in the active plan. Leaf branding is implemented; existing AI remains available; desktop packaging is deferred. No destructive migration or broad framework replacement has been performed.

## Implemented increment

The production compiler default is now unlimited, with an optional trusted LEAF_COMPILE_TIMEOUT_MS deadline. New jobs capture the policy, configured timeouts produce accurate diagnostics, and Stop/parent-loss cleanup remains independent. Full current suite: 602 tests pass; the production build passes. Three real policy checks include a 122-second TeX run, explicit Stop with the earlier PDF/source/history preserved, and an explicit 500ms deadline. Five real lifecycle scenarios also pass. The subsequent indexed-file restart fix closes the reproduced overwrite at its verified scope; full live filesystem acceptance remains open. [Recovery evidence](verification/disk-recovery.md).
