# File-version approval during reconciliation

Verified 2026-11-02. This backend-only correction keeps an explicit file-version choice bound to the bytes and source state the user reviewed. Existing recovery controls and source-draft behavior are unchanged.

## Reproduced defect and correction

Resolution already checked a comparison token, but then independently read disk again to plan reconciliation. An external process could write between those reads. The second read could adopt a version that was never part of the approved comparison; choosing editor text could subsequently replace that newly adopted version. An initially unchanged file also skipped reconciliation's final physical recheck.

`SourceRecovery.resolve` now passes the reviewed project generation, source revision, physical kind and hash into `Store.reconcileDisk`. Reconciliation checks the generation before planning and inside its database transaction, compares the captured source/disk state with that approval, and rechecks even an originally unchanged file before the first database change. Mismatches return 409; the existing comparison UI keeps the candidate for refresh or download. Normal startup reconciliation retains its previous policy.

The new guard rejects the demonstrated interleavings before adoption, checkpoint creation or disk acknowledgment. Existing guarded saves still protect later writes. This is bounded observation and validation, not an operating-system compare-and-swap or a power-loss guarantee against arbitrary writers. External-folder ownership and complete Leaf acceptance remain separate work.

## Executed checks

Full **742/742 tests PASS**, 0 skipped, and production build/typecheck PASS. Logs live in `data/verification/conflict-boundary/{tests,build,subset}.log`.

Ten new tests cover both disk/editor choices and initially unchanged/modified source. A separate Node process with an empty environment writes exact Unicode bytes after the approval read or after the planning read. Rejected requests retain exact physical bytes, saved source, project metadata, history, disk receipts and the separate SQLite draft. Two additional cases save a different file at either read boundary and verify that the newer generation invalidates the approval without additional changes. Before the correction, three of the original four boundary expectations failed because resolution succeeded; the fourth reached a later save guard instead of the requested reconciliation rejection. The failing baseline log is retained as `before.log`.

The expanded `npm run verify:source-recovery` passes **11/11 real filesystem/API checks**. Four controlled separate-process interleavings return 409 without source/history/version/receipt changes; fresh comparisons then permit both choices. After a backend reopen, all four cases retain exact chosen bytes, original/external checkpoint versions and separate drafts. The earlier checks still verify delayed-draft tombstones, independent source/draft persistence and stale-review rejection. One actual confined multi-file LaTeX build succeeds, its process group is empty, and extracted PDF text includes the recovered manuscript and included file. AI generation count is zero.

Report: `data/verification/source-recovery-real-1793657155679/report.json`. Successful job: `34cafc82-5f37-4af5-bc39-685cc6848de9`. The verifier uses synthetic fixtures and closes its own application; the owner's 4317 process and private papers are untouched.

The first full-suite attempt was interrupted after formatter timeouts under the restricted tool sandbox. Seven formatter logs contain `sandbox_apply: Operation not permitted`; independent process observations confirm all seven groups empty. `tests-restricted.log` and `restricted-environment.json` retain that environment failure. The permitted rerun passed all 742 tests. No UI changed, no new browser session was opened, and no additional browser acceptance is claimed for this correction.
