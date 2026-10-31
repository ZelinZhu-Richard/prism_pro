# Overleaf comparison and delivery ledger

Reviewed 2026-10-31 against the official [feature overview](https://www.overleaf.com/about/features-overview), [documentation index](https://docs.overleaf.com/llms.txt), [history documentation](https://docs.overleaf.com/writing-and-editing/history-and-versioning), [editing documentation](https://docs.overleaf.com/writing-and-editing/writing-and-editing), and [integrations](https://docs.overleaf.com/integrations-and-add-ons/integrations-and-add-ons).

This is a parity backlog, not a claim of complete coverage. “Present” means implementation exists; verification limits are recorded in verification.md. The owner chose **local-first now**, with hosted collaboration later. Hosted items remain visible below rather than being counted as delivered.

## Reference checks and local design choices

The owner questioned whether three proposed next groups were Overleaf features. These are the verified names and their limits:

- Overleaf's [Review area includes Comments and Track Changes](https://docs.overleaf.com/getting-started/how-do-i-use-overleaf/redesigned-overleaf-editor#left-bar). A local anchored-discussion workflow in Prism would be an implementation choice; online shared discussion remains deferred.
- Overleaf documents [Copy Project](https://docs.overleaf.com/managing-projects-and-files/copying-a-project), [creating a project from a template](https://docs.overleaf.com/templates/creating-a-project-from-a-template), and [personal templates via project copies](https://docs.overleaf.com/templates/submitting-to-the-overleaf-template-gallery/alternatives-to-templates). A local reusable-template library would be Prism's implementation choice. No next-group selection was made by that question.
- Overleaf's [Editor settings include a spell-check dictionary and editor language](https://docs.overleaf.com/getting-started/how-do-i-use-overleaf/redesigned-overleaf-editor#project-settings). These settings do not establish a particular spelling engine or service for Prism; that decision remains open.

Overleaf's [project-search documentation](https://docs.overleaf.com/navigating-in-the-editor/searching-within-a-project) specifies grouped source matches, case/word/regex options, exact-location navigation, and a 2 MB exclusion. Prism's reviewed multi-file replacement is an additional workflow; this source does not document project-wide replacement.

## Capability ledger

| Capability | Prism evidence / current gap | Work remaining |
| --- | --- | --- |
| Code editor, syntax colors, folding, brackets | `src/components/Editor.tsx` | Broader LaTeX package command coverage |
| Visual/rich text editor | Source-backed styled prose, heading/list editing, equation/figure/table previews and custom-source chips implemented | Rich clipboard formats, wider structure coverage, and incremental projection for large documents |
| Formatting toolbar | Text styles, headings, lists, equations, comments and shortcuts implemented and checked | Rich-text editor styling remains separate |
| Figure insertion wizard | Existing/uploaded PNG, JPEG and PDF assets; caption, label, width and placement controls | More figure layouts, subfigures and previews |
| Table generator | Editable grid, spreadsheet paste, alignment, rules, captions and source preview | Existing-table editing, merged cells, per-column widths and advanced styles |
| Math symbol palette | 88 searchable symbols, inline math choice and package hints | Broader package and custom-symbol catalogs |
| Command completion | Common LaTeX command/environment snippets implemented and checked | Broader package-specific completion catalogs |
| Citation/label completion | Project-aware citation and label completion implemented and checked | More custom macro/command families |
| Spelling and grammar | Absent | Language settings and spelling provider decision |
| Word count | Bundled TeXcount with category/section counts and matching compiled bibliography support | Broader custom macro and biblatex counting guidance |
| Find/replace within a file | Present, CodeMirror | Regression coverage for replacements |
| Project search | Grouped source matches with exact-location navigation, case/word/regex and include/exclude patterns; reviewed selected-file replacement with persistent project Undo | Bounded to 1,000 displayed matches / 5,000 replacement matches and 32 MB scope; broader large-project navigation remains |
| File tree, folders, rename, upload | Present | Drag/drop move and multi-select workflows |
| ZIP import/export | Present with limits and path validation | More exported-template compatibility fixtures |
| New blank/demo projects | Present | Broader template chooser and personal templates |
| Project copy | Library and editor actions; exact active files/assets/settings, fresh chat/history, stale-preview checks and idempotent requests | Hosted ownership and TeX distribution/version selection remain in their separate phases |
| Library search, sort, list/grid | Present, `ProjectLibrary.tsx` | Tags, archive, bulk actions |
| Project and file Trash | Present with restoration | Recovery tests after new history migration |
| Root-document selection | Present | Multi-root compile presets |
| pdfLaTeX/XeLaTeX/LuaLaTeX | Present through installed TeX | User-selected TeX distribution/version profiles |
| BibTeX/Biber | Detection and compilation paths present | Live Biber unavailable on this machine |
| Automatic/manual compilation | Present | Distinct draft cancellation, richer scheduling feedback |
| Compile logs, diagnostics, error links | Present | More package-specific diagnostics and warnings |
| Continuous PDF, zoom, navigation | Present | PDF text-selection/accessibility layer |
| Source/PDF navigation | SyncTeX present | Broader nested-root fixtures |
| PDF/source download | Present | Historical source ZIP implemented; historical PDF association/download remains |
| Offline operation | Local app present | Packaged installer and dependency guidance |
| Automatic project history | New: baseline, idle batches, maximum interval, AI boundaries | Timeline, comparison, labels and per-file restore now implemented and checked; more usability/regression coverage remains |
| Named versions/checkpoints | Present | Labels and historical ZIP export implemented |
| Compare arbitrary versions | Present: timeline and multi-file comparison | Improve large-document navigation |
| Restore whole version | Present, backs up current state | Version comparison and per-file restore implemented; add more restore UX fixtures |
| Comments and discussion threads | Absent | Local anchored comments; hosted sharing later |
| Tracked changes | AI proposals only | Track ordinary source edits, accept/reject individual hunks |
| Reference manager integrations | Absent | Zotero/Mendeley/Papers connection decisions |
| Reference search | Local key/title/author/year/journal search implemented | External reference manager connections and literature lookup remain opt-in work |
| Git/GitHub project synchronization | App source Git is unrelated to document sync | Safe document-specific Git connector with conflict review |
| Dropbox/Google Drive document sync | Absent | Explicit connection and conflict semantics |
| R/knitr, executable workflows | Disabled imported scripts intentionally | Separate opt-in sandboxed execution design |
| Templates/public gallery | Two local starter choices | Local template catalog; publishing and gallery hosting later |
| Journal submission integrations | Absent | Destination-specific workflows and authorization |
| Accessible PDF creation assistance | Source can use installed TeX packages | Tagged-PDF templates and validation |
| Custom editor preferences/shortcuts | Theme, panes, existing keymaps | Font, indentation, wrapping, Vim/Emacs settings |
| AI explanations/error fixes/project tools | Persistent conversations and reviewed editing workflows implemented | Long-conversation navigation and additional provider live checks |
| Durable chatbot conversations | New SQLite conversation IDs and turn replay | Passed native-session and restart checks; improve chat rendering and long-history navigation |
| Manual Type draft workflow | New editable draft and separate compile snapshot | Browser checks passed for revise, compile, approve, pause/resume, Undo/Redo, and draft recovery |
| Model/API/CLI choices | Five APIs plus two CLI backends present | Live API generation remains unverified without keys |
| Accounts, teams, permissions, share links | Absent | Hosted collaboration phase, explicitly chosen by owner |
| Simultaneous edits/cursors/collaborator chat | Absent | Hosted collaboration phase |
| Hosted compiler/storage, autoscaling | Absent | Hosted collaboration phase |
| SSO, admin, institutional controls | Absent | Hosted/organizational phase |
| Billing/subscriptions | Absent | Decide only if commercialization is requested |

## Current execution order

1. Persistent conversations and exact native CLI resume, with scope isolation.
2. Automatic history with deduplicated assets and migration/restart recovery.
3. Manual Type review workspace: editable source draft, AI suggestions, isolated compiled PDF, explicit approval, reliable animation and Undo.
4. Full browser and real CLI regression checks. Owner selected **history timeline, version comparison, and individual-file restore** as the next group.
5. Deliver remaining local feature gaps above. Keep hosted features scheduled for the later phase; do not claim full Overleaf parity until the applicable rows are implemented and verified.

## Owner decisions recorded

- Local-first editor now; hosted collaboration later.
- Manual Type must preview before source insertion. User can edit the draft, give suggestions, and request another proposal. Prefer a compiled draft in a separate view. Draft creation must not change source/history. Start typing is explicit, with Pause/Continue and one-step Undo.
- History retains saved versions; no automatic deletion is introduced. Automatic snapshots currently batch after 10 seconds of idle edits with a 60-second maximum while editing, and save at AI boundaries and orderly shutdown. The owner prioritized a history timeline, version comparison, and individual-file restore next. Abrupt crashes retain ordinary autosaved file revisions; the last pending grouped checkpoint can be missing.

Current verification: 189 deterministic tests and production build pass. Live Codex and Claude Code each resumed the same native session across two synthetic turns. The draft workflow passed built-in-browser checks, including separate real compilation and recovery from a fresh view. Remaining parity rows are still open.

The selected next group is delivered: history timeline, current/saved-version comparisons, version labels, historical source ZIP export, and revision-checked individual-file restore. Verified by 115 tests and built-in-browser checks in both themes. Further local editor gaps remain in the table above; the overall parity goal is still active.

The owner selected citation completion, bibliography search, and word count next. This group is implemented and verified: 127 fixture tests, 9 sandboxed TeXcount checks, and built-in-browser checks in both themes. Source formatting tools, visual editing, spelling, comments, and other rows remain open; the overall parity goal is not complete.

The owner selected the formatting toolbar with table, figure, and symbol tools next. This group is implemented: 140 deterministic tests and three real compilation checks pass. Built-in-browser checks cover selection recovery, source Undo/Redo, spreadsheet paste, figure upload, symbol search, normal compilation, invalid inputs, AI read-only browsing, and both themes. Advanced existing-table editing remains open. The later visual-mode release below adds source-backed prose and basic cell editing.

The owner prioritized a visual editor that preserves LaTeX and custom commands, choosing compact LaTeX chips with a source editor for unsupported commands. This release shares the CodeMirror source/history between Code and Visual views. It provides styled prose, headings/lists, local equation previews, figure/basic-table previews, isolated fragment/cell editing, and paragraph insertion after objects. Verified by 153 deterministic tests, four real compilations, and built-in-browser checks in both themes. Rich clipboard interchange and advanced table operations remain open; this is not a claim of full Overleaf parity.

Project content search and reviewed multi-file replacement are now implemented and verified by 177 tests, three real compilation checks, and built-in-browser checks. Replacement preview leaves source/history unchanged; Apply and persistent one-step Undo validate every selected file and preserve unrelated bytes. This adds a local replacement workflow beyond the cited project-search documentation. The next group remains undecided after the owner questioned the earlier feature labels; the reference checks above record the precise official names and separate Prism design choices.

The documented Copy Project workflow is implemented in both the library and editor, with fresh history/chat, exact active file/assets/settings preservation, source-generation checks, duplicate-request recovery, and transactional creation rollback. Verification: 189 tests, three real XeLaTeX compilation checks, and built-in-browser checks in both themes, including restart recovery. Prism uses the installed local TeX runtime and retains the selected compiler; Overleaf's cloud-specific newest-TeX default remains distinct. Reusing a project as a personal starter is now possible through copying; a template gallery/catalog remains a separate gap. The overall parity goal stays open.
