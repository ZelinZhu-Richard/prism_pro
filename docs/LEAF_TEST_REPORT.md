# Leaf test report

Updated 2026-11-02. Baseline revision `e16c7f1`; scope is the new Leaf plan, not full prior Overleaf parity. Evidence stays inside ignored data/verification/leaf-audit.

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Existing automated baseline | PASS — 594 tests, 0 failed/skipped | baseline-tests.log; normal process-list access required by existing lifecycle tests |
| Baseline TypeScript / production build | PASS | baseline-build.log; existing Vite chunk-size advisory |
| External main.tex change + restart | Fixed, bounded PASS | Original reproduction retained; new indexed-file restart checks below |
| Current Leaf browser acceptance | Bounded increments PASS | Current identity/recovery/save timing/offline/navigation evidence below; whole-plan acceptance remains open |
| Desktop packaging | Deferred by owner / not run | Local browser delivery retained |
| Offline end-to-end | Bounded managed-project PASS | Six real checks plus IAB under fixture network guards; OS-disconnected/cold-cache unrun |
| Saved-source crash/external conflict checks | PASS at indexed-file scope |29 tests, six actual process deaths; unsaved-source evidence recorded below |
| Biber live integration | Unrun — not installed in prior inventory | Do not install automatically or count fixtures as live evidence |
| Live AI/API/CLI requests | Not run | Outside the new execution scope; no keys requested |

Prior evidence for compiler engines, SyncTeX, ZIPs, source/history, PDF and local authoring remains linked from docs/verification.md. Re-run only the relevant checks when implementations change; do not relabel those historical checks as newly executed.

## Compiler policy implementation

- Full current suite: **601/601 PASS**, 0 skipped, current-tests.log; TypeScript/production build PASS, current-build.log.
- Policy and supervision subset: **17/17 PASS**, compile-policy-tests.log. New cases cover unlimited/default/zero, configured limits above two minutes, invalid/overflow limits, health/config isolation, unlimited Stop and parent-loss cleanup.
- Real compiler lifecycle: **5/5 PASS**, compile-policy-lifecycle.log; report data/verification/compiler-lifecycle-1793597025149/report.json. Includes backend exit, SIGKILL during TeX/Ghostscript, early owner loss and graceful close.
- Real compile policy: **3/3 PASS**, compile-policy-real.log; report data/verification/compile-policy-real-1793596992609/report.json. Includes actual 122-second TeX, explicit Stop, prior-PDF/source/history preservation and an explicit 500ms deadline diagnostic.

## Leaf identity and retained AI

- Full suite after branding/default-theme change: **602/602 PASS**, leaf-tests.log; the first run exposed one old-name assertion, updated to match the authorized rename before the passing run.
- Production build/typecheck PASS, leaf-build.log. A final copy-only narrow monogram/workspace-initial correction is confirmed through the final build and browser matrix.
- New theme regression checks fresh light default and preservation of explicit dark/system/light preferences across backend reopen. Existing AI, CLI and clipboard compatibility tests remain in the full suite. No live provider request was made.
- Browser checks on an isolated 5173 synthetic fixture confirm Leaf identity, source/PDF and retained AI controls in both themes, fresh light default, saved dark after reload, settings/Escape and narrow library containment. browser-audit.json proves exact project/source/history records,0generations/0runs/0chats. No owner data/server was used. Seven captures carry synthetic origins. One initial dark PDF capture was premature; it was replaced after both real canvases reported fully rendered, and the full review was restarted. Review verdict is recorded below after completion.

## Finish review

The fresh Impeccable reviewer returned **ship** for Leaf identity/light-default/preserved-AI UI, no material fixes. The first return requested recapture of a premature dark PDF; the file was replaced after real canvas completion, then all seven current captures received a full re-review. A stale tool-image cache was independently excluded by fresh decoding of the exact JPEG (SHA256 recorded in identity-finish-review.md). No runtime rendering defect was established. This scoped UI verdict does not certify compiler security, filesystem safety, full offline acceptance, mobile editing or the full Leaf plan.

The single detector pass used a degraded regex fallback:19 advisories,0 warnings on the supplied UI targets; it cannot certify computed contrast. All seven captures carry synthetic origins; the source/history/browser audit remains exact and generated no AI request. Public synthetic examples: [library](screenshots/leaf-library-light.jpg), [editor](screenshots/leaf-editor-light.jpg).

The owned synthetic5173 server and IAB tab were closed after verification. The owner’s4317 server was not stopped or restarted, and private projects were not inspected. The original supplied specification is byte-identical (SHA256 2f10f4f4591855ac80343c0c0d5748744c3d889a916277c0b5058d286ad0a7e4).

The final documenter recorded the approved Leaf/light-first identity amendment. All24 earlier extension objects and43 earlier component objects were preserved exactly; totals are25/44. Primitive design tokens remain exact; only authorized product name/description metadata changed. The bounded documentation report is retained beside the full UI review.

## Indexed-file restart recovery

Full suite **631/631 PASS**, 0 skipped; TypeScript/production build PASS.29 dedicated recovery tests include six actual process deaths, Unicode/binary bytes, deletes, pending intents, active conflicts, unsafe paths/file types and independent project isolation. Logs: data/verification/disk-recovery/{full-tests-final,build,final-edge-tests}.log.

Seven real integration checks pass, with four real LaTeX → DVI → PostScript → PDF/BibTeX/EPS builds. Both recovered and earlier versions restore and compile exactly; ZIP round-trip and included-file bidirectional SyncTeX pass. Report: data/verification/disk-recovery-real-1793602088406/report.json. Native IAB source/PDF/history checks and exact source/history/no-AI audit pass on an isolated 5173 fixture. Its owned tab/server were closed; owner 4317 was untouched. Two synthetic raster captures carry origin metadata.

This backend-only increment has no UI design changes. Functional IAB checks do not certify full offline acceptance, mobile/accessibility, live file watching, pre-debounce draft recovery or power-loss durability. [Algorithm and limits](verification/disk-recovery.md).

## Unsaved source and live conflict review

Full **654/654 PASS**, 0 skipped; final production build/typecheck PASS. Source/disk subset **52/52 PASS**, including 23 new source recovery cases. Six reproducible integration checks pass with a real confined LaTeX build and drained process group. Report: data/verification/source-recovery-real-1793623920078/report.json. Logs: data/verification/source-recovery-browser/{final-full-tests,final-targeted-tests,final-build,final-typecheck,real-verification}.log.

Actual IAB failed-save/backend-restart/fresh-tab recovery, independent SQLite-only recovery from a separate origin, stale external review rejection, retained-candidate retry, kept-disk choice, browser-file inspection and Back/Forward project isolation pass. Original/external/chosen source history and zero AI requests are audited. Eight corrected captures carry origin metadata. Initial review found three material behavioral/copy defects; the correction verdict scores all three resolved, ship at that scope. The single detector reports only the deliberate 16px narrow-field adaptation. The documenter records the built extension separately. Owner 4317/private papers were untouched; own tabs/server were closed and viewport reset. [Full evidence/boundaries](verification/source-recovery.md).

## Configurable source saving and automatic builds

Full **658/658 PASS**, 0 skipped; final build/typecheck PASS. Four new timer/policy/API tests plus the existing source/AI/Undo suite pass. Actual IAB manual Save/Cmd-Ctrl S, file-switch and compile preflight, retained 503 preference choices, 10,012 ms autosave and 5,025 ms post-save real build, canceled pending tasks and exact clean restart pass. All five real groups drain ; 0 AI generations/runs/chats. Source/history/preferences survive restart exactly. Logs and audits: data/verification/editor-workflow/.

Seven validated native IAB captures carry synthetic provenance. One detector scan reports 6 inherited warnings/101 advisories, with only a deliberate local 16px select advisory introduced. Full scoped finish review **ship**, no material fixes. Documenter preserves all 26/46 previous design objects and primitives; totals 27/48. Own server/tab closed; owner 4317/private papers/keys untouched. [Verification and boundaries](verification/editor-workflow.md).

## Managed-project offline acceptance

`npm run verify:offline`: **6/6 PASS**, final TypeScript PASS; three actual LaTeX/BibTeX build groups drain. Visible isolated IAB import, typed save/compile, continuous selectable two-page PDF, references, word count, US/UK spelling and local math rendering pass. Browser warning/error log empty, no local HTTP errors, zero AI generations/runs/chats or outbound backend fetch attempts. ZIP/PDF endpoint bytes checked. No product runtime/UI changes; existing658 suite/build retained. Own server/tab closed; owner4317 untouched. [Evidence and limits](verification/offline.md).

## Quick-open and command palette

Full **662/662 PASS**,0skipped; final build/typecheck PASS after reviewer keyboard correction. Actual IAB duplicate/Unicode/binary navigation, failed-save retry, retained external409 candidate, synthetic agent read-only switching,5-second canceled navigation, Save/Search/Word count and real Compile/Stop/rebuild pass. Three TeX process groups drain; source restoration/external bytes/drafts audited. Zero provider generation/outbound backend attempts; one explicit synthetic lock record becomes one conversation on fixture reopen. Seven final provenance captures; single detector has one scoped16px advisory. Reviewer scores one material focus fix resolved, ship at that scope. [Evidence and limits](verification/quick-navigation.md).

## Reviewed local source formatting

Full **678/678 PASS**,0skipped; final build/typecheck PASS. Eight backend/eight client cases cover captured immutable source, default-only/confined output, stale validation, invalid tool output, cancellation/lost responses and exact one-step Undo. Five real official standalone latexindent4.0.3 checks and two actual multi-file TeX/BibTeX builds pass; system TeX/Perl installation stays unchanged. Controlled visible IAB validates no-write previews, stale rejection/retained candidate, explicit recovery, Apply/Undo/Redo/save/real PDF, failures/deadline/Stop/no-op, focus and restart. Console empty,0AI/outbound,16 observed groups drain. Nine provenance captures; one static detector; scoped finish review ship. Exact design primitives and28/50 incumbent objects preserved, totals29/52. Own tab/server closed; owner4317 untouched. [Evidence and boundaries](verification/formatting.md).

## Code environment helpers

Full **688/688 PASS**,0skipped; production build/typecheck PASS. Ten new scanner/transaction/completion/preference tests plus actual IAB rapid Enter, exact Undo/Redo, option acceptance, off/on setting, native matching chord, palette focus and two actual multi-file TeX/BibTeX builds pass. Both groups drained. Real external-file Save rejection preserves exact disk and unsaved generated candidate; reload exposes recovery and Keep for later. Supporting/root bytes exact; browser console empty,0AI/outbound. Seven provenance captures, one static detector with no findings; fresh scoped finish review ship/no fixes. Own tab/server closed; owner4317 untouched. [Evidence and limits](verification/environments.md).

## Reviewed managed disk files

Full **713/713 PASS**,0skipped; production build/typecheck PASS. Sixteen backend cases include two actual process deaths; eight client cases cover uncertainty/retry/deadline/late responses, plus source eligibility metadata. Real verifier **8/8 PASS**, three actual builds, exact physical/source/PDF/ZIP/history and included-file SyncTeX checks. Isolated visible IAB verifies independent unsaved buffers, selective imports, stale review, postcommit lost-confirmation replay, backend restart, missing-root recovery, binary/folder metadata,105-note pagination and configured timeout recovery. Final expected-byte audit, five durable receipts, zero AI/outbound/script execution and empty console are recorded. Four browser build jobs include one expected missing-input failure and three successes. Thirteen valid origin-bearing captures and one detector/four typography advisories support scoped UI review. Owner4317/private papers untouched. [Evidence and remaining limits](verification/disk-discovery.md).

## Live indexed-file conflict notices

Full **725/725 PASS**,0skipped; production build/typecheck PASS. Six backend/six client cases cover readonly bounded cached observations, same-size retimestamped changes, unsafe/missing/unknown paths, source generation, transport/late-result guards and accurate older-open-revision handling. Actual visible IAB verified automatic included/main notices with preserved drafts,10-second autosave across5-second polling, blocked conflicting autosave, fresh-instance recovery and two controlled backend restarts. Three real builds succeed;82,542-byte PDF export exact, all groups drained, zero AI/outbound and final console empty. First checks corrected dirty-label and restart-generation edges. Five final origin-bearing captures, one detector/two inherited type advisories, scoped UI review ship; narrow capture documents inherited650px minimum rather than mobile support. Source/history/physical bytes and all three draft candidates audited. Own tabs/server closed, owner4317 untouched. [Evidence and limits](verification/disk-status.md).

## Project-local LaTeX completion

Full **732/732 PASS**,0skipped; final build/typecheck PASS. Seven new lexer/index/completion cases preserve existing citation/environment checks. Real IAB verifies project-style and unsaved-only command options, local/used package provenance, exact name/argument acceptance and native Undo/Redo; two actual TeX/BibTeX/PNG/style builds succeed. The first matrix corrected selected-detail contrast with existing neutral roles (4.75/5.74 detail ratios); one detector returns no findings. Fresh review found one @-name boundary defect; regex/prefix filtering and native mid-name/after-@ acceptance/Undo/Redo now pass, with exact temporary text and unchanged saved history. Seven recaptures support correction review. Final source/supporting bytes and95,329-byte PDF are exact; both groups drain, zero AI/outbound and console empty. Narrow evidence documents inherited650px minimum, not mobile support. [Evidence and limits](verification/declarations.md).

## Explicit conflict approval through reconciliation — 2026-11-02

Full **742/742 tests PASS**, 0 skipped, and production build/typecheck PASS. Ten new recovery tests cover separate-process external writes after validation and after capture, both choices, initially unchanged/modified files, retained backend drafts and intervening project saves. The expanded real recovery verifier passes **11/11 checks**, with exact rejected-request metadata, fresh-review acceptance, original/external history and separate draft persistence after reopen, plus one actual multi-file LaTeX build with a drained process group and zero AI generation. [Evidence and limits](verification/conflict-boundary.md).

The first full-suite attempt ran under the restricted tool sandbox and was interrupted after formatter timeouts. Its launch logs show `sandbox_apply: Operation not permitted`; all seven failed formatter process groups were independently observed empty. The permitted rerun is the 742-test acceptance result. No source UI changed and no new browser acceptance is claimed for this backend-only increment.

## Source-navigation engine — 2026-11-02

Full **755/755 tests PASS**, 0 skipped; production build/typecheck PASS. Twelve new navigation tests plus one declaration regression cover exact Unicode spans, comments/raw/dynamic exclusions, bibliography record boundaries, caret-symbol identification, duplicate/cross-file records, unsaved overlays without saving, cache/Trash/external-adoption changes, invalid requests, generation conflicts and bounded output. Five real engine/API checks with two actual multi-file/style/BibTeX/PNG builds pass; exact source metadata stays unchanged during navigation, compiler groups drain and AI/outbound counts remain zero. Controls and built-in-browser navigation acceptance remain pending. [Evidence](verification/source-navigation-engine.md).

## UTF-8 editor boundary and legacy-byte preservation — 2026-11-02

Full **763/763 tests PASS**, 0 skipped, and final production build/typecheck PASS. Eight new cases cover rejected lossy source read/save, rejected unpaired Unicode and pre-adoption recovery validation, independent bibliography indexing, valid Unicode/BOM/CRLF preservation, exact ZIP/history bytes and saved-review guidance, plus local file/raw API behavior. Seven baseline expectations failed before the guard; the valid-Unicode case passed. The real verifier passes **7/7 checks**, with three actual Latin-1/converted/Undo-restored LaTeX/BibTeX builds, exact copies/history/restart/Undo and zero guarded AI/outbound attempts.

Visible built-in IAB also keeps UTF-8 notes intact after a rejected legacy-root open and compiles the unchanged Latin-1 root/includes/bibliography to a real one-page PDF. All four source files are exact, project generation remains 0, history remains one checkpoint, and there are no drafts, AI runs or chats. The UI exposes and invokes selected-file Download; native download-save events were not observed, so raw/ZIP byte identity is separately verified at API/filesystem scope. [Detailed evidence and limits](verification/source-encoding.md).

## Source-navigation controls — 2026-11-02

Full **781/781 tests PASS**, zero skipped; production typecheck/build PASS. Eighteen new client/palette tests cover async/stale/hash/cancel/deadline guards, unsaved exact selection and provenance. Native visible IAB verifies cross-file command/BibTeX/citation/label/environment selection with exact clipboard text, same-line distinct columns, unsaved Undo/Redo, failed-save recovery, stale Refresh, pending Escape and simulated read-only browsing. One current-generation real2-page multi-file/style/BibTeX/PNG build passes; process group drains, native PDF bytes and supporting-file ZIP match exactly, and AI/outbound counts remain zero. Eight provenance captures cover both themes, desktop/user/narrow and error/empty; scoped finish review **ship**. Detector regex fallback is explicitly degraded, not a contrast certification. [Evidence and limits](verification/source-navigation.md).

## Installed TeX filename catalog — 2026-11-02

Full **791/791 tests PASS**, zero skipped; production typecheck/build PASS. Ten new parser/filesystem/cache/API tests verify safe bounded metadata discovery and retained selected-runtime identity. Three real checks discover4,606 files in TeX Live2026 Basic without project/history writes, preserve read-only access and explicit pinned identity, and complete one actual multi-file/BibTeX/PNG build with process drain. Zero AI/outbound backend attempts; imported script/config markers absent. No editor/browser change in this backend increment; completion integration remains pending. [Evidence and limits](verification/tex-packages.md).

## Installed-package completion — 2026-11-02

Full **803/803 tests PASS**, zero skipped; production typecheck/build PASS. Twelve new async/source/metadata tests plus actual IAB exact suffix/options/comma/newline acceptance, native Undo/Redo, automatic typing, local precedence,503 retry and dispatched15s cancellation/file switching pass. One real generation-zero2-page build and final exact source/revision/ZIP/PDF/process audit pass; no active draft/runs/chats/AI/outbound. Six final provenance captures validate both themes, user width, recoverable error and narrow visible caret; scoped finish review ship. The once-only degraded detector has107 inherited stylesheet findings outside changed lines, with no new-scope finding; this is not computed-contrast certification. [Evidence and limits](verification/installed-completion.md).

## Saved workspace layouts — 2026-11-02

Full **812/812 tests PASS**, zero skipped; final production typecheck/build PASS. Nine new state/API tests cover schema/revision/idempotency, serialized acknowledgments, ambiguous replies, conflicts, newer edits during reload and timeout/retry. Native IAB verifies exact dirty source/Undo/chat preservation, PDF page-two/150% anchor retention, keyboard/pointer sizing, failed save/retry/load saved, actual backend restart/explicit recovery, palette and simulated read-only inspection. Three actual two-page multipass builds pass with drained groups; automatic builds keep PDF hidden and manual Compile reveals it. Final canonical source/history/ZIP/PDF audit passes, zero AI/outbound. Nine valid provenance captures cover light/dark, desktop, user width, narrow source-only and closed/open failure; once-only detector107 inherited findings, none on changed rules/new targets. Fresh scoped finish review **ship**, no material fixes. Browser warning/error log empty; owned fixture/tab closed and viewport reset, owner4317 untouched. [Evidence and limits](verification/workspace-layout.md).

## Actionable local diagnostics — 2026-11-02

Full **822/822 tests PASS**, zero skipped; final production typecheck/build PASS. Ten new tests cover conservative guidance, explicit info/severity/filter identities, bounded priority, marker readiness/Unicode lines and hard-wrapped line284 recovery. The real compiler verifier passes12 checks across four engine chains, bibliography/nested/long-path and failure cases. Native IAB verifies current compiler/spelling markers, exact line6/source/gutter focus, keyboard checks, stale/external/read-only protection, retained AI draft choice and exact local-fix Undo/Redo. Five current-fixture builds finish with drained groups; the repaired two-page PDF and all eight source ZIP entries are exact. Source history retains original/erroneous bytes; no active draft/runs/chats/prompt or AI/outbound. Six valid provenance captures cover both themes, desktop/user/narrow panning, stale/read-only/empty states. Detector once:105 inherited findings plus one local13px heading advisory. Fresh scoped review **ship**, no material fixes; all11 current/preliminary fixture groups empty. Browser warning/error log empty; owned tab/server closed and viewport reset, owner4317 untouched. [Evidence and limits](verification/actionable-diagnostics.md).

## Ordinary-folder identity foundation — 2026-11-02

Full **874/874 tests pass** with zero skipped, and the production build passes. Linked file tests cover directory identity, read-only handling, stale reviewed inventories, retained external edits, recoverable batches and renames, and thirteen actual process deaths. The built-in browser verifies in-place opening, a two-page real build, reviewed rename and Undo, nested file opening, original-folder relink, read-only source and explicit recovery of an interrupted move. [Evidence and limits](verification/folder-ownership-foundation.md).

## Bibliography tool setup — 2026-11-06

Full **876/876 tests pass** and the production build passes. The previous Biber preflight refused a harmless comment and an unused example before it created a build. Both compile with the fix. The production compiler uses a build-owned, read-only PATH guard for an absent bibliography executable. latexmk chooses whether to invoke it.

`npm run verify:compiler` passes **15/15 checks**. These include a successful biblatex build using BibTeX, a real Biber request that reports the missing executable and retains the earlier PDF, and a selected runtime without BibTeX that rejects an executable from another directory on PATH. Sandbox denial, cancellation, SyncTeX and imported-configuration confinement also pass.

The built-in browser shows the selected-runtime guidance for both tools and keeps the previous successful PDF available after the Biber failure. The isolated fixture reports zero generation or outbound fetch attempts. No Biber installation was performed, so successful Biber execution remains unverified. Evidence is under `data/verification/bibliography-tools/` and `data/verification/compiler-1793943134858/report.json`.
