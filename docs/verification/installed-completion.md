# Installed-package completion — 2026-11-02

Code view now combines existing project-local package suggestions with the [selected installation's filename catalog](tex-packages.md) inside literal `\usepackage{…}` and `\RequirePackage{…}` arguments. Project-local packages keep precedence. Installed matches identify their provenance separately; the native information panel names the selected runtime, indexed paths and metadata limits. Ordinary command/environment/citation completion stays synchronous.

Typing activates completion under the existing preference. Explicit completion rechecks installed metadata; use Ctrl+Space, or Option+backtick on macOS. The list keeps source names separate from compact provenance text and bounds its width to the viewport. No new palette, global type primitive, asset, dialog or source layout was introduced.

## Safety and recovery

The async source captures project/runtime/settings identity and its original document. Document changes, completion cancellation, file switching, hidden editors, read-only ownership and runtime changes invalidate pending results. Responses must match the captured request and contain safe bounded metadata. A five-second deadline aborts stalled work. Canceled/obsolete results remain silent; failures retain project suggestions with an actionable error and explicit retry. They do not claim installation was checked.

Acceptance uses the original literal name/suffix range, preserving options, neighboring comma-separated names and arguments. Previewing metadata never saves source, starts a compiler, installs packages, sends an AI request or changes the selected runtime. The existing guarded file/save/recovery flows remain authoritative. Escaped package heads, comments, raw content and nested definition bodies do not start installed lookup.

## Executed verification

- Full **803/803 tests pass**, zero skipped, and final production typecheck/build passes. Twelve new tests cover complete suffix replacement, duplicate provenance, local precedence, class/path-only exclusions, partial-index notes, other source contexts, unavailable/network fallback, malformed/mismatched responses, owner changes, cancellation, timeout/retry and query limits.
- Visible Codex IAB verifies a real selected-runtime suggestion, native acceptance with exact surrounding options/comma names/newline, one Undo, Redo and exact recovery. The final compact layout repeats the exact native Enter/Undo/Redo check. A fresh typed character activates a normal lookup without forced refresh. Native Option+backtick explicitly refreshes suggestions.
- A synthetic project `xcolor.sty` keeps the **Project package** result over installed xcolor. A controlled 503 retains the used-project suggestion with **installation not checked**, preserves the exact draft, and explicit retry restores installed provenance.
- A deliberately delayed 15-second request actually reaches the backend, then Escape/file switching cancels it. The late response leaves the newly inspected file untouched and produces no obsolete error. An earlier immediate Escape canceled before dispatch; that observation is separate from the dispatched-request check.
- The final filesystem/API audit finds canonical source/supporting bytes, generation zero and unchanged file revisions, no active recovery draft, runs or chats, and zero AI/outbound backend calls. One real generation-zero two-page multi-file/pdfLaTeX/BibTeX/PNG build succeeds with resolved references and a drained process group. Served PDF bytes match the immutable result; source ZIP round-trip preserves every supporting file. Imported script/configuration markers remain absent.
- Six final native IAB captures were reopened and validated: desktop light/dark/local precedence at 1440×900, actual 997×833 normal/error, and a visible-caret narrow case at reported 383×829 (376×814 proportional raster). Origins are embedded and the scan reports six rasters, none missing provenance. A fresh scoped finish review returns **ship**, no material fixes. It does not certify the entire editor or rerun the parent's tests/final audit.

The first visual pass found overwide single-line rows. One correction batch separated label/detail text and bounded the list/information width; the second batched pass validates the final captures. The once-only detector used degraded regex fallback, not computed contrast. Its 107 findings all refer to inherited global stylesheet lines outside the changed package block; `detector-scope.json` records that interpretation without a second scan.

Evidence remains under `data/verification/installed-completion/`: test/build logs, observations and named accessibility captures, dispatched-cancellation and final status/audit JSON, detector/scope results, finish review and additive design documentation. The synthetic fixture is `data/verification/installed-completion-real-1793665382933`; build `f6c36188-e761-40e1-a333-6b22d24ada10`. [Actual-width screenshot](../screenshots/leaf-installed-packages-light.jpg).

## Boundaries

Installed suggestions cover package basenames from the selected distribution, not document-class completion, user-local TEXMF trees, global command definitions, TeX expansion, dependencies or search-order guarantees. Backend catalog/cache/query bounds still apply; typing a more specific name narrows limited results. Native completion information may overlap lower rows on narrow screens; arrow navigation and the selected row remain available. The existing desktop shell still needs horizontal panning when a source caret lies outside the viewport, so this is not full mobile-editor acceptance.

No live provider, owner paper or owner-server restart was used. Restart the local app when convenient to load new backend routes; rebuilding alone does not replace an already running Node process. Native packaging and OS-disconnected/cold-cache acceptance remain separate work.
