# Diagnostic fix preparation

Verified 2026-11-01 with synthetic projects. **Fix with AI** now opens the diagnostic's source before preparing its request. Long source labels wrap inside Logs. The owner chose an explicit comparison when an unsent prompt exists: **Keep draft**, **Append diagnostic**, or **Replace draft**. This is a bounded editor reliability fix; the broader parity backlog is not complete.

## Behavior and boundaries

Preparation preserves the selected Document/Whole Project scope and the current conversation. It selects Review Edits, clears the earlier explicit file/selection context, opens the current diagnostic source, places the caret on the reported line and focuses the composer. Diagnostics without a source path use the build's root document. Preparation does not send to a provider, create a chat/run, apply source changes or compile. The user reviews the composer and explicitly chooses Send.

The local action controller captures the project, conversation, scope, mode, prompt and editor navigation/content. It flushes the existing draft, saves any ordinary pending source edit, fetches the current project and opens only the named editable target. File/navigation/content changes, failed saves/reads, read-only targets, revision mismatches and changed chat/scope/draft reject stale preparation. Cancel/dispose invalidate late results. Duplicate preparation clicks do not create parallel actions. Removed/renamed targets require refreshed diagnostics rather than falling back to the wrong source.

A draft comparison retains exact whitespace, combining characters and emoji. Append adds two newlines and the literal diagnostic request; Replace uses the request alone. Combined text over 16,000 UTF-16 code units fails visibly without truncation. Keep/Escape preserve the prompt. Errors retain both texts and offer review of the current draft. Empty-draft preparation has inline target/status/retry/cancel controls. An existing unsaved source edit may create its normal autosave/history entry before navigation; this is separate from AI preparation.

The backend already confined Document-scope file tools and compilation diagnostics. This change fixes the frontend target selection; it does not introduce a new backend scope boundary. An older diagnostic may describe source that has since changed: the action opens current source for inspection, and recompilation remains the way to refresh the diagnostic. No automatic edit is inferred from an old build.

## Verification

**594 tests** pass, including 29 new action-controller tests. TypeScript and the production Vite build pass with the existing chunk-size advisory. Ignored evidence: `data/verification/diagnostic-actions-tests.log`. The existing process-supervision tests require normal process-list access; the restricted shell cannot inspect `ps`, so the passing full run used approved normal process access. No application confinement was removed.

Only visible Codex IAB was used, on an isolated server at 5173. The owner's server at 4317 and private projects were untouched. Two genuine sandboxed TeX builds provide nested-source and long-filename errors. Browser checks cover wrong-active-file preparation, old selection reset, Manual Type → Review Edits, retained Document/Whole Project scope, literal Keep/Append/Replace, source-read failure and retry, slow source read followed by a scope change, Escape/focus recovery, long source labels and large Unicode drafts.

Before Send, the fixture audit proves exact project/source/history records, zero AI requests/runs/provider invocations and one unchanged existing conversation. Two explicit deterministic fixture Sends then use Document and Whole Project in that same conversation. Both request `sections/with space.tex`, revision 0, with the collapsed line-2 caret `{from:16,to:16}` rather than the earlier main-file selection. Four provider-fixture invocations perform inspection and response; **no live or paid provider request** occurred. Both builds are terminal, no owned process group remains, and source/history bytes stay exact.

Reports: ignored `data/verification/diagnostic-actions-browser/pre-send-audit.json`, `post-send-audit.json`, `fixture.json` and `review-packet.md`. The final isolated fixture root is `data/verification/diagnostic-actions-1793592659854`. Earlier synthetic fixture attempts are retained separately; a fault-injection predicate initially matched review-file reads too and was restricted to the actual source endpoint before the authoritative failure/audit checks.

## Interface evidence

The batched inspection covers desktop 1440×900, actual IAB 997×833, and narrow 390×844, with dark/light comparisons and loading/error/long-input states. The new native dialog is contained at 350 px on narrow viewports, with reachable actions and 16 px native text fields. The existing editor workspace retains its 650 px minimum width; this is not a claim of full-workspace mobile support. Eleven settled captures were opened and validated and carry synthetic-origin metadata. An early unsettled narrow screenshot was replaced before review.

The single static detector pass used a degraded regex fallback. It reported 106 findings over complete incumbent files, none in the new diagnostic-action component/CSS; its six warnings point to unchanged existing styles. It cannot certify computed contrast or full accessibility. Broader macro/package diagnostic formats, native screen-reader behavior, touch and live provider integrations were not newly tested in this batch.

The fresh Impeccable finish reviewer returned **ship**, with no material fixes, after opening all eleven captures. Its five-section report is retained at `data/verification/diagnostic-actions-browser/finish-review.md`. The verdict covers this action/dialog/label extension, not whole-application accessibility, mobile support or full parity.

[Diagnostic draft comparison](../screenshots/prism-diagnostic-draft-review.jpg).

The documenter recorded the built extension in DESIGN.md and its sidecar, retaining exact token frontmatter and all 23 prior extension/42 component objects; totals are 24/43. Its report is retained beside the finish review. The isolated test server and owned browser tab were closed; the owner’s 4317 server was not restarted. The owner requested a pause after this batch.
