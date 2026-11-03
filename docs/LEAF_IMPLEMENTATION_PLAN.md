# Leaf implementation plan

Updated 2026-11-02. **This is the active plan.** It replaces the previous Overleaf-parity-driven plan. [The supplied product specification](LEAF_PRODUCT_SPEC.md) is preserved verbatim and governs this work. [The former parity ledger](overleaf-parity.md) remains historical evidence, not an instruction to keep expanding AI or hosted features.

## Working agreement

Implement and verify real local writing workflows; do not count a control as a delivered feature. Preserve user projects, existing working features, history and unrelated changes. Keep the current React/TypeScript/CodeMirror/PDF.js/local Node implementation while assessing desktop packaging; avoid a framework rewrite. Do not install packages, read private papers or restart the owner's 4317 server merely to audit. Use synthetic fixtures and the built-in browser for browser checks. All working material stays inside this Prism directory; holdout is out of scope.

The new specification's offline-first editor priorities supersede the older goal of extending AI and matching every hosted Overleaf feature. Essential opening, editing, compilation and export must work without accounts, network access or AI. Existing AI functionality remains in scope for preservation; new AI expansion and cloud work are not prioritized by this plan. Existing AI code/data is retained as the owner explicitly chose below. Do not silently erase prior features or private conversations.

## Owner decisions — authoritative amendments (2026-11-02)

1. **Rename the product to Leaf** throughout the current app and documentation. Keep the existing Prism directory and prism_pro GitHub repository.
2. **Keep AI assistants and API calls as they are.** This overrides the supplied specification's blanket AI exclusions. Preserve existing provider connections, CLI sessions, chats, Manual Type and review flows. Core local writing remains usable without AI; paid generation still requires explicit user action. This plan does not schedule new AI expansion ahead of P0 reliability.
3. **Keep the local browser app now; desktop packaging later.** Native installers, OS file dialogs and external Open/Reveal are deferred, rather than counted as current release blockers or delivered browser features. Reuse the existing local Node engine; no hosting/accounts service is added.

The supplied specification stays verbatim for provenance; these explicit owner decisions win where they conflict. No source/history/credential/session migration is required for the rename. Existing SQLite filename, request/clipboard namespaces and launcher variables remain compatible. A fresh installation defaults to the existing light theme; saved dark/system/light preferences remain authoritative.

## Execution order

### A — Audit and baseline (initial audit complete; maintained during implementation)

- Inventory relevant implementation, applicable instructions, dependencies and actual architecture.
- Create docs/LEAF_AUDIT.md with complete/partial/missing/broken classifications, code/test evidence, priority and verification method.
- Run baseline automated tests/typecheck/build; verify installed tool discovery with synthetic real compilation where available.
- Identify release-blocking data-loss, external-file, offline, packaging and compiler-policy gaps. Use docs/LEAF_TEST_REPORT.md to separate executed checks from prior evidence and unrun checks.

### B — Repair the foundation

- Address confirmed source saving/recovery/external-change defects before surface additions.
- Keep atomic writes, revision conflicts, recoverable history and compiler/process confinement; add regression/integration evidence for each repaired failure mode.
- Resolve the hardcoded two-minute compiler limit against the new no-arbitrary-timeout requirement, retaining user cancellation and backend-loss cleanup.
- Audit essential workflows for implicit external requests and unsafe file/script execution.

### C — Complete P0 local editor workflows

- Keep browser delivery and implement safe explicit file/folder workflows without proprietary source storage; native packaging/dialogs are deferred.
- Detect/reconcile external file changes with disk/editor conflicts and recoverable crash state.
- Fill demonstrated editor gaps: environment matching/closing, local formatting, quick-open, command palette, shortcuts and configurable autosave/idle compile.
- Complete real PDF export/open/reveal and source/PDF navigation; verify included-file SyncTeX and stable PDF reading state.
- Harden panel/layout controls, actionable non-AI diagnostics, local setup and missing-tool recovery.
- Re-run representative end-to-end/offline acceptance checks before P1 work.

### D — P1 authoring improvements

- Reuse and verify existing bibliography search/completion, local .bib workflows, history comparison, math/figure/table tools, spelling and word count.
- Fill only observed gaps; avoid duplicate implementations and complex new WYSIWYG work.
- Preserve optional local Git integration as lower priority than saving and external-change safety.

### E — P2 preflight and measured performance

- Add optional deterministic manuscript checks by combining existing diagnostics/dependency evidence.
- Establish reproducible startup/editing/PDF/large-project/idle baselines with actual machine and fixture descriptions.
- Optimize demonstrated bottlenecks; no fabricated benchmarks or speculative rewrites.

### F — Release verification

- Run tests, typecheck, build, actual compiler/SyncTeX/cancellation/recovery/ZIP tests and browser delivery checks (desktop packaging is deferred).
- Exercise the real interface through visible built-in IAB with synthetic data, including dark/light, keyboard and relevant sizes.
- Verify offline workflow, external changes, failed writes and crashes. Mark unavailable native/live dependencies as unrun.
- Update audit/plan/test report by evidence; commit and push coherent tested increments under existing authorization.

## Completion gate

A researcher can install/launch, detect TeX, create/import/open an ordinary local project, edit, compile, inspect/navigate the real PDF, diagnose errors, manage bibliographies, save/recover and export entirely offline. All required controls work. Unfinished items and environment limits remain explicit. If the whole specification cannot fit one execution context, deliver the largest coherent fully tested increment and continue from this ledger rather than declaring full completion.

## Execution ledger

- **Completed:** original specification saved verbatim; active-plan pointer installed; former parity plan marked superseded; owner amendments recorded.
- **Completed:** initial capability/data-integrity audit and test report; baseline594 tests/build; current 812 tests/build, including retained AI compatibility and saved-theme migration checks.
- **Completed, verified:** unlimited-by-default local compilation; optional trusted deadline; captured job policy and accurate timeout diagnostics. Three real policy checks include122-second TeX/Stop/last-PDF preservation; five real backend-loss lifecycle cases pass.
- **Completed, scoped finish review ship:** Leaf product identity, fresh light default, preserved saved theme/provider/session/storage compatibility and existing AI UI. Built-in browser checks use synthetic projects; no live generation.
- **Completed, bounded:** indexed-file restart recovery preserves external edits/deletions and both source versions, skips clean writes, and replays only matching unfinished write intents. Active saves reject changed disk files.29 dedicated tests include six actual process deaths; seven real integration checks include four builds, ZIP and included-file SyncTeX. [Evidence and limits](verification/disk-recovery.md).
- **Completed, bounded:** immediate browser source drafts plus sequence-bound SQLite mirror; explicit live disk/editor review, stale/agent guards, original/external/editor history protection and project/file-bound recovery. Full 654 tests/build, six real recovery integration checks and isolated IAB restart/conflict/navigation evidence pass. The scoped correction verdict scores all three review findings resolved. [Evidence and limits](verification/source-recovery.md).
- **Completed, verified:** configurable Automatic/Manual source saving and independent autosave/automatic-build delays, preserving recovery and explicit preflight saves. Full 658 tests/build, actual 10,012 ms save / 5,025 ms build timing, cancellation, keyboard and exact restart checks pass; scoped finish review ship. [Evidence](verification/editor-workflow.md).
- **Completed, bounded:** managed-project offline core acceptance: six real backend checks, three real builds and visible IAB import/edit/continuous PDF/local references/word count/US-UK spelling/visual math/export under fixture network guards. Zero AI or outbound backend fetches. [Evidence and limits](verification/offline.md).
- **Completed, bounded:** local file quick-open and existing-action command palette, keyboard/focus correction, safe failed-save/conflict/canceled navigation and agent read-only inspection. Full662 tests/build plus actual IAB/three real build groups pass; reviewer scores one keyboard fix resolved. [Evidence](verification/quick-navigation.md).
- **Completed, bounded:** reviewed local latexindent formatting with explicit Apply/one Undo, captured-source validation, confined snapshots and independent Stop/deadline. Full678 tests/build; five official standalone4.0.3 checks/two real builds and controlled IAB workflows pass; scoped finish review ship. The system formatter remains absent and guidance stays truthful. [Evidence and limits](verification/formatting.md).
- **Completed, bounded:** literal same-file environment matching, default-keymap Enter closing/one Undo, environment completion and standard shortcut/palette navigation with independent preference. Full688 tests/build, actual IAB/two real builds and retained-candidate external-conflict/reload checks pass; scoped finish review ship. [Evidence and limits](verification/environments.md).
- **Completed, bounded:** explicit managed-folder discovery and selected metadata-only import, separate existing-file comparisons, binary metadata, stale guards and durable replay. Full713 tests/build, eight real integration checks/three builds and IAB unsaved-buffer/paging/restart/error workflows pass. [Evidence and limits](verification/disk-discovery.md).
- **Completed, bounded:** foreground read-only indexed-file change notices, affected-buffer autosave suspension, retained failure observations and stale/uncertain PDF status. Newer saved revisions after restart remain explicitly reviewable without replacing dirty text. Full725 tests/build and IAB three real builds, long-delay autosave, conflict/recovery/restart checks pass. [Evidence and limits](verification/disk-status.md).
- **Completed, bounded:** project-local command/package completion with unsaved-file precedence, exact name/suffix/argument boundaries, duplicate provenance and neutral selected-row contrast. Full732 tests/build, two actual multi-file/style builds and IAB acceptance/Undo/unsaved-source checks pass; reviewer @-name finding corrected and tested in the real editor. [Evidence and limits](verification/declarations.md).
- **Completed, bounded:** explicit file-version approval now remains bound through reconciliation planning and its database transaction, including a file initially observed as unchanged. Full 742 tests/build, ten new interleaved-writer/generation regressions and eleven real recovery endpoint/restart/compile checks pass. [Evidence and limits](verification/conflict-boundary.md).
- **Completed, bounded:** project-local definition/reference navigation now exposes F12/Shift+F12 and palette controls with exact file/line/column/excerpt results. Same-file unsaved selection does not save; cross-file opening retains preflight/conflict guards, hashes, cancellation and readiness. Full 781 tests/build, native IAB failure/stale/unsaved/read-only/selection checks, a current-generation real two-page build and exact PDF/ZIP checks pass; scoped finish review ship. [UI evidence and limits](verification/source-navigation.md), [engine evidence](verification/source-navigation-engine.md).
- **Completed, bounded:** ordinary text read/save now rejects lossy legacy-byte decoding and incomplete Unicode before writes or recovery adoption. Full 763 tests/build, eight new regressions, seven real checks/three builds and one actual IAB build preserve raw import/copy/export/history/Undo bytes. [Evidence and encoding limits](verification/source-encoding.md).
- **Completed, bounded:** installed package/class metadata has a read-only selected-runtime catalog API; package-name completion now integrates it with local precedence, exact suffix replacement, explicit provenance, cancellation/deadline and recoverable local fallback. Full803 tests/build, native IAB exact acceptance/Undo/retry/dispatched cancellation, final source/export audit and one actual two-page build pass; scoped finish review ship. [Completion evidence](verification/installed-completion.md), [catalog evidence](verification/tex-packages.md).
- **Completed, bounded:** saved panel visibility/dimensions, Full/Write/Source and PDF presets, Reset and palette controls preserve unsaved text/Undo, conversation drafts, read-only inspection and mounted PDF reading. Full812 tests/build, actual backend restart/recovery, three real two-page builds, exact source/history/export audit and native both-theme/user/narrow/error checks pass; fresh scoped finish review ship. [Evidence and limits](verification/workspace-layout.md).
- **Next P0:** remaining filesystem workflows and actionable local diagnostics; preserve tested navigation, recovery and live-conflict guards. Arbitrary folder opening/ownership remains open; unindexed disk entries are preserved and import remains explicit.
- **Remaining:** global-navigation/user-package-tree gaps; OS-disconnected/cold-cache acceptance; remaining P1/P2 items from the audit. Native packaging/Open/Reveal remain deferred by the owner's explicit choice.

No claim of complete Leaf acceptance or full Overleaf parity is made. Do not resume the superseded AI-expansion backlog merely because it contains more unchecked items.

## Active goal — accepted 2026-11-02

Complete Leaf’s local-first browser editor under this approved plan, prioritizing file safety, recovery, compilation, and offline workflows; retain existing AI features and defer desktop packaging. The owner accepted this replacement and an active goal was created; the obsolete goal is no longer active.
