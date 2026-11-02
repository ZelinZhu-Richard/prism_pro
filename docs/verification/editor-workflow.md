# Configurable source saving and automatic build timing

Implemented 2026-11-02 after source recovery. This is a local editor workflow increment; optional assistant behavior and compiler execution policy remain unchanged.

## Behavior

Open **Settings → Editor → Saving and compilation**, adjust the choices, then **Save editor settings**. Previewing fields does not persist them or change source. Preferences apply to every managed project on this computer and survive backend restart. Invalid writes reject the entire preference patch before persistence; unrelated theme/provider/model choices remain intact.

| Setting | Legacy/default behavior | Valid backend values |
| --- | --- | --- |
| Source saving | Automatic | Boolean automatic/manual choice |
| Autosave after typing | 600 ms | Integer 250–30,000 ms |
| Compile delay after saving | 1,800 ms | Integer 250–60,000 ms |

The UI offers common second-based choices and also displays a valid custom saved value. Autosave delay is disabled in manual mode without forgetting its value. Existing configurations with missing/invalid individual fields recover the old defaults independently.

Manual mode shows **Autosave off** beside source status and exposes **Save**. Cmd/Ctrl S and that button save explicitly. Switching files, leaving a project and explicit compilation retain their existing preflight saving. Manual compilation starts after saving rather than waiting for the automatic build delay. Recovery journaling remains active before any source save. AI typing saves its progress through its existing separate path.

Automatic compilation still uses its toolbar toggle. Its delay begins after source is saved; an unsaved manual buffer cannot start an automatic build. Source save and build delays are independent. Changing preferences cancels the earlier timer. Turning the automatic action off, changing source/destination, opening a recovery review or acquiring a source lock prevents stale work from firing.

`afterEditorIdle` cancels its scheduled task and rechecks eligibility at execution. Source writes bind captured project/file/revision/content and current save preference; automatic builds bind project, current toggle, source cleanliness and source/agent/recovery locks. Existing generation/options/runtime checks still prevent repeating the same build. Explicit actions remain revision-checked through normal APIs.

## Executed checks

- Full **658/658 tests pass**, 0 skipped. Production/typecheck build passes, including the final copy/explicit-label correction. Four new tests exercise replaced/canceled timers, late destination/lock/dirty changes, migration/custom values, API range/type rejection, exact restart persistence and source/history/compile-policy neutrality. Existing AI, Manual Type Undo and editor preference tests remain passing.
- Built-in IAB on a synthetic5173 fixture verifies local-only settings preview, retained manual/delay choices after a 503 failure, successful retry, unsaved manual source with exact recovery draft, Cmd/Ctrl S, visible Save, file-switch preflight and explicit compilation. Four manual source saves produced one requested build; explicit compilation began **17 ms** after saving, bypassing the configured 1-second automatic delay.
- An owned backend restart retained 10-second autosave, 5-second compile delay and the selected toggle. A fresh typed change saved **10,012 ms** after the first receipt of its exact final text; a real confined build started **5,025 ms** after that save. Exactly one save/build occurred. These are observed fixture timings, not realtime scheduling guarantees or performance benchmarks. The original latest-draft timestamp was unsuitable because Save refreshes the journal; accepted timing uses the first-seen content timestamp recorded by the fixture.
- Turning Automatic compilation off canceled its pending 5-second build. Switching to manual canceled a pending 10-second source save. After both deadlines, source/build counts remained unchanged and the exact unsaved recovery draft remained. A final explicit Save/build succeeded. All **five** real build process groups drained.
- A second clean restart retained the exact project, source, history and preferences, with no resumed save/build or AI request. Fresh UI shows Manual save, retained 10-second delay disabled, and 5-second build delay. Generations/runs/chats from AI are 0 throughout.
- Keyboard checks: Tab skips the disabled save-delay select, backward navigation remains inside the native dialog, and Escape restores Open settings. Seven validated provenance-bearing IAB captures cover 1440x900, actual 1280x720, narrow requested 390x844 (native 383x829), light/dark manual status and a settings failure. The three new narrow selects render at 16px and stay contained. This does not certify the complete editor on mobile.

Evidence stays in ignored `data/verification/editor-workflow/`: full-tests.log, build.log, preview-audit.json, failure-audit.json, manual-unsaved-audit.json, manual-actions-audit.json, automatic-timing.json, timing-raw.json, cancellation-audit.json, keyboard-audit.json, process-audit.json, restart-audit.json and restart-ui.json. The dedicated synthetic app root is `data/verification/editor-workflow-real-1793624947631`.

The single detector pass reports 6 inherited warnings and 101 advisories across the full incumbent stylesheet. The warnings predate the only stylesheet change; one new advisory is the intentional local 16px narrow-select adaptation. No second detector or unrelated font/border rewrite was performed. The fresh finish reviewer returned **ship**, no material scoped fixes. The documenter preserved primitives and all 26 earlier extensions/46 components exactly; totals are 27/48. [Synthetic interface example](../screenshots/leaf-editor-workflow.jpg).

The owned server/tab were closed and viewport reset. Owner 4317, private papers, keys and holdout were untouched; no package install or live provider generation occurred. Full offline acceptance, arbitrary-folder opening/discovery, formatting/quick-open/command palette and native packaging remain separate work. Native delivery remains deferred by the owner.
