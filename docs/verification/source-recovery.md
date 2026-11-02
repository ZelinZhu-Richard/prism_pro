# Unsaved source and live disk conflicts

Implemented 2026-11-02 after the indexed-file restart repair. This increment preserves pre-autosave source text, exposes explicit disk/editor review and isolates recovery by project and file.

## User workflow

Ordinary source edits immediately update a namespaced browser draft journal and asynchronously mirror to the local SQLite database, independently of the normal 600ms source autosave. Successful saves acknowledge only the exact submitted snapshot; newer typing remains a draft. A recovered draft never automatically changes source or starts a paid request. A persistent notice lists available drafts across this project, including files other than the open document.

**File versions** opens a literal disk/editor comparison. A failed source save caused by competing disk or app revisions opens the same review. A clean document also checks disk state when opened or when the window regains focus. This is not a directory watcher. The user can adjust the candidate, download it, refresh the comparison, keep it for later, use disk, or explicitly save the edited version. Choosing disk retains an unsaved candidate separately. Saving edited text captures the existing disk/app versions in History first. A deleted text file can be explicitly restored through the edited choice. Binary/type-changed/unsafe paths cannot be overwritten as text through this flow.

Closing a review preserves drafts. During an unresolved conflict, autosave is suspended for that file; browsing another file is allowed after the exact visible buffer has been journaled. Returning to that draft requires fresh review. Agent source locks still reject applying either choice while allowing inspection/download.

## Persistence and guards

`src/source-drafts.ts` writes per-page/project/file records to `prism:source-draft:v1:` browser storage. No credentials, chats or provider requests enter this journal. The browser cache protects the interval before the asynchronous backend mirror is acknowledged; durable app recovery records live in SQLite inside the Prism data directory. Source drafts are excluded from source ZIPs and history until explicitly saved into source. Browser quota/unavailability and failed backend mirrors produce a persistent warning; no persistence guarantee is made when both copies fail. Keep the tab open and save/download text in that case.

`server/source-drafts.ts` stores additive `source_drafts` rows with monotonic per-record sequences and cleared tombstones. Delayed writes cannot revive a consumed draft, including after restart. Same-sequence/different-content and cross-project/file identity reuse are rejected. Limits are 2 MiB per source draft,100 active drafts and 20 MiB of active draft text per project. Records are not automatically purged; draft housekeeping is separate future work. Empty text and Unicode retain exact string content.

`server/source-recovery.ts` binds each approval to project generation, file revision, logical source hash and current physical kind/hash. Apply rechecks the token and source owner, then imports only the selected indexed disk path without rewriting its bytes. An edited choice subsequently uses the normal guarded save. This two-stage process deliberately retains imported external bytes if a later save fails; the candidate stays available for a fresh comparison. Retries after an ambiguous response require fresh review when identity changed. No all-or-nothing transaction across arbitrary external writers or power loss is claimed.

`visibleSource` binds deferred CodeMirror events to captured project and file identity. Off-project journal publications are ignored, displayed records are filtered to the active project, and review preparation rechecks navigation after saving. Successful project/home transitions retire the old review; locks and autosave suspension apply only to its matching project. No old A/main.tex event can attach to the new B/main.tex merely because the filenames match.

Local APIs retain the existing loopback host/origin and mutation-header guards:

- `GET /api/projects/:id/source-drafts`; `PUT` writes a validated sequence-bound record.
- `GET /api/projects/:id/disk?path=...` is a read-only comparison.
- `POST /api/projects/:id/disk/resolve` takes `{path,token,action:"disk"|"editor",content?}`.

## Executed evidence

- Full **654/654 tests pass**, 0 skipped; production build and final typecheck pass. The 52-test source/disk subset includes 23 new source-recovery tests. Coverage includes exact Unicode/empty buffers, newer typing during save acknowledgment, independent pages/projects, storage failure, exact normalized-record consumption, source/history/export neutrality, locks, deletes, non-text/unsafe paths, stale approvals, tombstones and a deferred cross-project callback.
- `npm run verify:source-recovery`: **6/6** real integration checks pass. SQLite draft reopening leaves source/history unchanged; stale decisions preserve both sides; disk import keeps inode and candidate; exact original/external/chosen history and cleared-record restart behavior pass. A real confined LaTeX build renders recovered writing and its included file; its process group drains. Report: `data/verification/source-recovery-real-1793623920078/report.json`.
- Actual built-in IAB with an isolated 5173 synthetic project: failed autosave, backend restart and fresh tab recover the exact Unicode candidate without changing disk. The mirror is independently accessible from localhost:5173, a separate browser origin without the 127.0.0.1 journal.503 retry, Escape, browsing during conflict, second external edit/stale rejection, Refresh, kept-disk/candidate preservation and reviewed save all pass. The real recovered PDF is fully rendered.
- Back/Forward with an open review returns an editable destination with zero open dialogs and no foreign draft notice; the original project's draft remains available for fresh review. API history audit confirms original, both external states and the chosen text. The separate blank navigation target retains generation 0 and no foreign draft. No AI generations/runs/chats were created.
- Eight corrected native IAB captures cover 1440x900, actual 1280x720, requested 390x844 (native image 383x829), light/dark, failure, stale comparison and navigation. Each was opened and carries synthetic-origin metadata. The single detector pass reports one intentional 16px narrow-textarea advisory. Initial review requested three material corrections; the verdict scores all three **resolved**, disposition **ship** for that scored scope, not whole-app certification. Review and documentation reports stay under ignored `data/verification/source-recovery-browser/`.

The owned test tabs/server were closed and temporary viewport overrides reset. Owner 4317 was untouched. No private papers, live keys, package installation or paid requests were used. Native file-save completion, full editor mobile/accessibility certification, complete offline acceptance, arbitrary-folder opening, automatic unindexed discovery, power-loss durability and source-save/build-delay configuration remain outside this increment.

The final documenter preserved all25 prior extensions,44 components and primitive tokens exactly; totals are26/46. The new notice/comparison and local narrow-field adaptation are recorded without changing global typography. [Synthetic interface example](../screenshots/leaf-source-recovery.jpg).
