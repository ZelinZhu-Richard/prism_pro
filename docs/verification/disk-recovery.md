# Indexed-file restart recovery

Implemented 2026-11-02 against the reproduced startup overwrite in the Leaf audit. This is a bounded saved-source safety fix, not full external-folder ownership.

## Behavior

Clean startup leaves matching disk files untouched, including inode and mtime. Indexed external source, bibliography and binary changes are adopted into a new revision without rewriting the disk. Before/after automatic checkpoints retain the earlier app version and recovered content. External deletions stay deleted with recoverable Trash/history; reappeared indexed files are restored. Source generation changes once per recovery group. Existing comments/tracked changes use the normal source-rebase path.

The additive `file_disk_state` table records the physical base kind/hash, revision and pending write intent. Source commits establish intent first. Interrupted writes replay only while their recorded physical base still matches; a later external edit is preserved instead. Unique temporary files, file fsync and a final base check precede atomic rename. Equal desired bytes acknowledge without replacement. New/copied/template projects establish creation intents too. Staged-tree journals recover before indexed reconciliation.

While running, Save and other source mutations reject disk mismatches before changing source/history. A change detected during staging retains the committed app version and physical external version for restart recovery. Unsafe links, hardlinks, devices/FIFOs, oversized files and inconsistent trees block only the affected project; inspection does not follow links or block on FIFOs. Only empty indexed directories can be removed by ordinary materialization. Unindexed entries and imported scripts are neither read nor executed by this recovery path.

Recovery limits are10,000 indexed entries,100 MiB per inspected file and128 MiB of changed content per pass. Existing ZIP members are limited to50 MiB. Editable text retains the existing2 MiB limit; larger or non-strict-UTF-8 external bytes become download-only binary content, preserving exact bytes.

## Executed checks

- Full631-test suite and production/typecheck build pass.29 dedicated tests include six actual child-process deaths: before commit, after commit, after rename, external edit after commit, new file, and deletion. Earlier versions remain recoverable.
- Unicode/grapheme-containing source, nested files, bibliography, binary and invalid UTF-8 recovery; clean/second restart identity; old databases without receipts; restore each historical version; active-save refusal; change during staging; unindexed destination collision; file/directory changes; partial adoption rollback; unsafe filesystem types and independent project availability.
- `npm run verify:disk-recovery`: seven integration checks pass with four real classic LaTeX/BibTeX/EPS builds. Exact source ZIP round-trip, earlier/recovered output-text equality and included-file forward/inverse SyncTeX pass. Report: `data/verification/disk-recovery-real-1793602088406/report.json`.
- Native built-in IAB on isolated5173 shows the recovered source and real PDF, plus the earlier/external history diff and restore controls. `data/verification/disk-recovery/browser-audit.json` confirms exact source/history,0 generations/runs/chats and drained builds. Screenshots `recovered-paper.jpg` and `recovered-history.jpg` carry synthetic-origin metadata. No private paper or live provider request was used. The owned tab/server were closed; owner4317 was untouched.

Logs stay under ignored `data/verification/disk-recovery/`. No UI changes were made, so this is functional browser evidence rather than a new UI design review.

## Remaining boundaries

No live watcher, explicit dirty-buffer/disk conflict dialog, automatic unindexed-file discovery or arbitrary-folder opening is delivered here. Keep unsaved editor text before a backend restart. Pending source before the600ms autosave still needs durable draft recovery. A browser refresh alone does not restart the backend reconciliation. There is an unavoidable race with non-cooperating disk writers between the final inspection and rename; no arbitrary concurrent-writer atomicity or power-loss/fsync guarantee is claimed. Full offline and packaged-native acceptance remain separate work; native delivery is deferred by the owner.
