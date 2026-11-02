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
- **Completed:** initial capability/data-integrity audit and test report; baseline594 tests/build; current 662 tests/build, including retained AI compatibility and saved-theme migration checks.
- **Completed, verified:** unlimited-by-default local compilation; optional trusted deadline; captured job policy and accurate timeout diagnostics. Three real policy checks include122-second TeX/Stop/last-PDF preservation; five real backend-loss lifecycle cases pass.
- **Completed, scoped finish review ship:** Leaf product identity, fresh light default, preserved saved theme/provider/session/storage compatibility and existing AI UI. Built-in browser checks use synthetic projects; no live generation.
- **Completed, bounded:** indexed-file restart recovery preserves external edits/deletions and both source versions, skips clean writes, and replays only matching unfinished write intents. Active saves reject changed disk files.29 dedicated tests include six actual process deaths; seven real integration checks include four builds, ZIP and included-file SyncTeX. [Evidence and limits](verification/disk-recovery.md).
- **Completed, bounded:** immediate browser source drafts plus sequence-bound SQLite mirror; explicit live disk/editor review, stale/agent guards, original/external/editor history protection and project/file-bound recovery. Full 654 tests/build, six real recovery integration checks and isolated IAB restart/conflict/navigation evidence pass. The scoped correction verdict scores all three review findings resolved. [Evidence and limits](verification/source-recovery.md).
- **Completed, verified:** configurable Automatic/Manual source saving and independent autosave/automatic-build delays, preserving recovery and explicit preflight saves. Full 658 tests/build, actual 10,012 ms save / 5,025 ms build timing, cancellation, keyboard and exact restart checks pass; scoped finish review ship. [Evidence](verification/editor-workflow.md).
- **Completed, bounded:** managed-project offline core acceptance: six real backend checks, three real builds and visible IAB import/edit/continuous PDF/local references/word count/US-UK spelling/visual math/export under fixture network guards. Zero AI or outbound backend fetches. [Evidence and limits](verification/offline.md).
- **Completed, bounded:** local file quick-open and existing-action command palette, keyboard/focus correction, safe failed-save/conflict/canceled navigation and agent read-only inspection. Full662 tests/build plus actual IAB/three real build groups pass; reviewer scores one keyboard fix resolved. [Evidence](verification/quick-navigation.md).
- **Next P0:** local formatting/environment/navigation gaps and remaining filesystem workflows. Explicit filesystem project opening/discovery remains open; unindexed disk entries are preserved but not automatically imported.
- **Remaining:** local formatting/environment/navigation gaps; OS-disconnected/cold-cache acceptance; remaining P1/P2 items from the audit. Native packaging/Open/Reveal remain deferred by the owner's explicit choice.

No claim of complete Leaf acceptance or full Overleaf parity is made. Do not resume the superseded AI-expansion backlog merely because it contains more unchecked items.

## Active goal — accepted 2026-11-02

Complete Leaf’s local-first browser editor under this approved plan, prioritizing file safety, recovery, compilation, and offline workflows; retain existing AI features and defer desktop packaging. The owner accepted this replacement and an active goal was created; the obsolete goal is no longer active.
