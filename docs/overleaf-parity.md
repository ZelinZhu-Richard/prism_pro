# Overleaf comparison and delivery ledger

Reviewed 2026-10-31 against the official [feature overview](https://www.overleaf.com/about/features-overview), [documentation index](https://docs.overleaf.com/llms.txt), [history documentation](https://docs.overleaf.com/writing-and-editing/history-and-versioning), [editing documentation](https://docs.overleaf.com/writing-and-editing/writing-and-editing), and [integrations](https://docs.overleaf.com/integrations-and-add-ons/integrations-and-add-ons).

This is a parity backlog, not a claim of complete coverage. “Present” means implementation exists; verification limits are recorded in verification.md. The owner chose **local-first now**, with hosted collaboration later. Hosted items remain visible below rather than being counted as delivered.

| Capability | Prism evidence / current gap | Work remaining |
| --- | --- | --- |
| Code editor, syntax colors, folding, brackets | `src/components/Editor.tsx` | Broader LaTeX package command coverage |
| Visual/rich text editor | Absent | Design source-preserving structured editing; arbitrary LaTeX round trips must remain safe |
| Formatting toolbar | Absent | Bold, emphasis, sections, lists, math insertion |
| Figure insertion wizard | Upload and source editing present | Caption, label, sizing and placement UI |
| Table generator | Absent | Editable grid with LaTeX output |
| Math symbol palette | Absent | Searchable symbols and insertion |
| Command completion | Generic CodeMirror completion only | LaTeX commands, environments, packages |
| Citation/label completion | Absent | Index BibTeX entries, labels and project inputs |
| Spelling and grammar | Absent | Language settings and spelling provider decision |
| Word count | Absent | TeX-aware counts by section, captions and references |
| Find/replace within a file | Present, CodeMirror | Regression coverage for replacements |
| Project search | Literal source search present | Results by line and project replace with preview |
| File tree, folders, rename, upload | Present | Drag/drop move and multi-select workflows |
| ZIP import/export | Present with limits and path validation | More exported-template compatibility fixtures |
| New blank/demo projects | Present | Broader template chooser and personal templates |
| Project copy | Absent | Copy source/settings without old history, following Overleaf semantics |
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
| Reference search | Absent | Search entries locally; external literature lookup is a separate opt-in |
| Git/GitHub project synchronization | App source Git is unrelated to document sync | Safe document-specific Git connector with conflict review |
| Dropbox/Google Drive document sync | Absent | Explicit connection and conflict semantics |
| R/knitr, executable workflows | Disabled imported scripts intentionally | Separate opt-in sandboxed execution design |
| Templates/public gallery | Two local starter choices | Local template catalog; publishing and gallery hosting later |
| Journal submission integrations | Absent | Destination-specific workflows and authorization |
| Accessible PDF creation assistance | Source can use installed TeX packages | Tagged-PDF templates and validation |
| Custom editor preferences/shortcuts | Theme, panes, existing keymaps | Font, indentation, wrapping, Vim/Emacs settings |
| AI explanations/error fixes/project tools | Present but previously stateless | Conversation continuity and better edit lifecycle under implementation |
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

Current verification: 115 deterministic tests and production build pass. Live Codex and Claude Code each resumed the same native session across two synthetic turns. The draft workflow passed built-in-browser checks, including separate real compilation and recovery from a fresh view. Remaining parity rows are still open.

The selected next group is delivered: history timeline, current/saved-version comparisons, version labels, historical source ZIP export, and revision-checked individual-file restore. Verified by 115 tests and built-in-browser checks in both themes. Further local editor gaps remain in the table above; the overall parity goal is still active.
