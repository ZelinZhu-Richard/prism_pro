# Leaf test report

Updated 2026-11-02. Baseline revision `e16c7f1`; scope is the new Leaf plan, not full prior Overleaf parity. Evidence stays inside ignored data/verification/leaf-audit.

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Existing automated baseline | PASS — 594 tests, 0 failed/skipped | baseline-tests.log; normal process-list access required by existing lifecycle tests |
| Baseline TypeScript / production build | PASS | baseline-build.log; existing Vite chunk-size advisory |
| External main.tex change + restart | Fixed, bounded PASS | Original reproduction retained; new indexed-file restart checks below |
| Current Leaf browser acceptance | Not yet run | Historical screenshots are not a fresh full acceptance pass |
| Desktop packaging | Deferred by owner / not run | Local browser delivery retained |
| Offline end-to-end | Not yet run | Code inspection only so far |
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

Seven real integration checks pass, with four real LaTeX → DVI → PostScript → PDF/BibTeX/EPS builds. Both recovered and earlier versions restore and compile exactly; ZIP round-trip and included-file bidirectional SyncTeX pass. Report: data/verification/disk-recovery-real-1793602088406/report.json. Native IAB source/PDF/history checks and exact source/history/no-AI audit pass on an isolated 5173 fixture. Its owned tab/server were closed; owner4317 was untouched. Two synthetic raster captures carry origin metadata.

This backend-only increment has no UI design changes. Functional IAB checks do not certify full offline acceptance, mobile/accessibility, live file watching, pre-debounce draft recovery or power-loss durability. [Algorithm and limits](verification/disk-recovery.md).

## Unsaved source and live conflict review

Full **654/654 PASS**, 0 skipped; final production build/typecheck PASS. Source/disk subset **52/52 PASS**, including 23 new source recovery cases. Six reproducible integration checks pass with a real confined LaTeX build and drained process group. Report: data/verification/source-recovery-real-1793623920078/report.json. Logs: data/verification/source-recovery-browser/{final-full-tests,final-targeted-tests,final-build,final-typecheck,real-verification}.log.

Actual IAB failed-save/backend-restart/fresh-tab recovery, independent SQLite-only recovery from a separate origin, stale external review rejection, retained-candidate retry, kept-disk choice, browser-file inspection and Back/Forward project isolation pass. Original/external/chosen source history and zero AI requests are audited. Eight corrected captures carry origin metadata. Initial review found three material behavioral/copy defects; the correction verdict scores all three resolved, ship at that scope. The single detector reports only the deliberate 16px narrow-field adaptation. The documenter records the built extension separately. Owner 4317/private papers were untouched; own tabs/server were closed and viewport reset. [Full evidence/boundaries](verification/source-recovery.md).
