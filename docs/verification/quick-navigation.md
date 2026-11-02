# Quick-open and command palette

Implemented 2026-11-02 as a bounded extension of the existing Leaf editor. Open the active project's file picker with **Cmd/Ctrl P**, or commands with **Cmd/Ctrl Shift P**. Both are also labeled controls beside the source tabs; that action group remains visible when tabs overflow. Help lists both shortcuts. Existing dialogs and IME input retain their keyboard ownership.

## Behavior

File search runs locally over current non-deleted files, includes binary assets, excludes directories/Trash, and keeps complete paths visible for duplicate basenames. Empty search favors the current/open tabs. Search supports names, paths, multiple words, Unicode and accent-insensitive subsequences. Results render at most100 rows; larger matches ask for a narrower query. No search request or model request is made.

The palette offers15 existing actions: file opening, saving, document/project search, compilation or cancellation, SyncTeX navigation, Code/Visual views, bibliography, word count, writing checks, history, file-version review, editor settings and help. Unavailable actions show their reason and cannot run. Source locks block saving/new builds while retaining inspection. No paid generation or destructive command is added. Shortcut labels are shown where available; configurable remapping is separate work.

Arrows choose a row, Enter opens it, and Escape closes the native dialog. The search input owns result navigation; the listbox has a matching active descendant and is excluded from sequential tab focus. Header/query/status/footer remain outside bounded list scrolling. Narrow inputs use the existing local16px adaptation. The shared Modal captures its originating element before descendant autofocus, so Escape can restore source/trigger focus correctly.

Opening a file uses the existing save/revision/conflict safeguards. Failed saves retain the query, exact source and recoverable draft with an inline error. A journaled409 conflict can preserve its candidate while another file opens for inspection. Escape during an in-flight open cancels navigation; an already-started source save remains bound to its original file. Project identity and mounted-request guards reject late navigation.

## Executed checks

- Full **662/662 tests PASS**, 0 skipped. Four new cases cover ranking/path/Unicode/asset behavior, shortcut/IME modifiers and lock/build command eligibility. Final build/typecheck passes after the reviewer's one-attribute keyboard fix. Existing source recovery/AI/Undo tests remain passing. Logs: `data/verification/quick-navigation/{final-tests,review-build}.log`.
- Actual visible IAB verifies both shortcuts, initial query focus, arrows/Enter, duplicate basenames, full long paths, Unicode matching, binary inspection, empty results, Save/project search/Word count and palette-to-picker navigation. Cmd/Ctrl P is not captured while another native dialog is active.
- An injected503 fails the preflight save: the active file and exact candidate remain, the query/error stay visible, and retry saves before switching. An actual external write causes409; the independent external bytes and unsaved journal candidate remain exact while another file opens and the recovery notice persists.
- A synthetic agent record blocks source save/new compilation but permits file switching. Opening the Unicode file keeps `aria-readonly=true`; an actual keypress cannot modify it. No provider request was made. The one synthetic run later acquires one conversation at normal Store reopen migration; these are fixture records, not generated chat.
- A fixture-only5-second save delay exercises Escape while Opening. After that save completes, the original included file stays active/focused and contains its exact new text; the requested target never opens. `canceled-navigation-audit.json` records the write.
- Actual palette Compile starts real TeX. Palette Stop cancels a second real infinite TeX run; the prior PDF remains. Restoring the synthetic source compiles again. All **three** job groups are empty, with TeX-start log evidence. Final source matches authoritative baseline bytes plus the explicitly inserted comment; a first check used DOM `innerText`, which included one display-only trailing newline, and was replaced by this byte-based assertion. External bytes and pending recovery candidate remain exact. `completion-audit.json` records these checks.
- Final IAB console warning/error log is empty. Local503/409 responses are deliberately injected/exercised; outbound backend attempts and provider generations remain0. No private project, key, holdout, package installation or owner4317 restart was used.

## Review and boundaries

Seven validated IAB captures cover light/dark,1440×900,1280×720 and requested390×844 (native383×829), plus empty/error states. All carry synthetic provenance. One static/degraded detector pass reports only the deliberate16px narrow-input advisory. The fresh finish reviewer found one material issue: Tab could focus the scrollable listbox without result key handling. Adding `tabIndex=-1` resolves that scored finding; actual Close→Tab→input, input→Shift-Tab→Close, arrows/Enter and Escape focus return pass. Native forward Tab from the final field may reach browser chrome; Shift-Tab returns to the input, with no background-app/listbox focus. This is not exhaustive accessibility certification.

The same reviewer returned **ship for the scored keyboard fix**, after all seven captures were replaced and reopened. This does not broaden the verdict to whole Leaf/mobile/contrast or untested command branches. [Synthetic palette](../screenshots/leaf-command-palette.jpg), [file picker](../screenshots/leaf-quick-open.jpg).

Native delivery, arbitrary external-folder opening/discovery, formatter/environment completion, general shortcut remapping, OS-disconnected/cold-cache acceptance and the remaining Leaf plan are separate work. Managed-project recovery and optional existing AI remain intact.

The documenter preserves exact frontmatter/primitives and all27 earlier extensions/48 components; totals are28/50. Owned IAB tab75 and the isolated5173 server were closed, with viewport reset. Owner4317 remains untouched.
