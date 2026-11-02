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
| Saved-source crash/external conflict checks | PASS at indexed-file scope |29 tests, six actual process deaths; unsaved source drafts remain P0 |
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
