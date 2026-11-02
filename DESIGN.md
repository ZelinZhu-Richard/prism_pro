---
name: Leaf
description: A light-first local LaTeX writing workspace with a compact neutral interface, recoverable review controls and retained optional assistants.
colors:
  dark-bg: "#080808"
  dark-panel: "#111111"
  dark-panel-raised: "#2a2a2a"
  dark-editor: "#111111"
  dark-text: "#f5f5f5"
  dark-muted: "#b4b4b4"
  dark-faint: "#949494"
  dark-border: "#292929"
  dark-control: "#494949"
  dark-accent: "#ededed"
  dark-accent-dark: "#262626"
  dark-line: "#1d1d1d"
  dark-selection: "#373737"
  dark-pdf-bg: "#202020"
  dark-focus: "#a5c4df"
  dark-positive: "#9fc6ae"
  dark-warning: "#d2bb8f"
  dark-danger: "#e8aaa6"
  light-bg: "#f6f6f6"
  light-panel: "#fafafa"
  light-panel-raised: "#ffffff"
  light-editor: "#ffffff"
  light-text: "#191919"
  light-muted: "#5f5f5f"
  light-faint: "#6b6b6b"
  light-border: "#e4e4e4"
  light-control: "#c6c6c6"
  light-accent: "#202020"
  light-accent-dark: "#eaeaea"
  light-line: "#f4f4f4"
  light-selection: "#dedede"
  light-pdf-bg: "#ededed"
  light-focus: "#315f84"
  light-positive: "#39704d"
  light-warning: "#7a5b27"
  light-danger: "#a33f3a"
typography:
  title:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "20px"
    fontWeight: 500
    letterSpacing: "-0.5px"
  body:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    lineHeight: 1.6
  label:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "11px"
  action:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 600
  code:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
    fontSize: "12px"
    lineHeight: 1.65
  reply:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    lineHeight: 1.7
  reply-title:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  chat-code:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
    fontSize: "11px"
    lineHeight: 1.65
rounded:
  small: "4px"
  row: "5px"
  compact: "6px"
  control: "7px"
  drop: "8px"
  panel: "10px"
  dialog: "14px"
spacing:
  compact: "8px"
  standard: "12px"
  action-inline: "14px"
  section: "20px"
  dialog: "26px"
components:
  button-primary:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-bg}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-light:
    backgroundColor: "{colors.light-accent}"
    textColor: "{colors.light-bg}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-subtle:
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "8px 11px"
  button-ghost:
    textColor: "{colors.dark-muted}"
    typography: "{typography.label}"
    padding: "8px"
  button-icon:
    textColor: "{colors.dark-muted}"
    rounded: "{rounded.compact}"
    width: "29px"
    height: "29px"
  input-text:
    backgroundColor: "{colors.dark-editor}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
    width: "100%"
  sidebar-tab:
    textColor: "{colors.dark-muted}"
    typography: "{typography.label}"
    height: "35px"
  file-row:
    textColor: "{colors.dark-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.row}"
    height: "33px"
  file-row-selected:
    backgroundColor: "{colors.dark-accent-dark}"
    textColor: "{colors.dark-accent}"
    rounded: "{rounded.row}"
  editor-panel:
    backgroundColor: "{colors.dark-editor}"
    rounded: "{rounded.panel}"
  upload-drop:
    textColor: "{colors.dark-muted}"
    rounded: "{rounded.drop}"
    padding: "20px 12px"
  batch-dialog:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.dialog}"
    padding: "26px"
    width: "min(620px, calc(100vw - 32px))"
  chat-row:
    textColor: "{colors.dark-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.row}"
    padding: "10px 7px"
    width: "100%"
  chat-row-selected:
    backgroundColor: "{colors.dark-accent-dark}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.row}"
  chat-reply:
    textColor: "{colors.dark-text}"
    typography: "{typography.reply}"
  table-draft-grid:
    textColor: "{colors.dark-text}"
    width: "100%"
  table-source-disclosure:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.dark-muted}"
    rounded: "{rounded.compact}"
    padding: "12px"
  clipboard-content-preview:
    textColor: "{colors.dark-text}"
    typography: "{typography.reply}"
    padding: "16px"
  comment-message:
    textColor: "{colors.dark-text}"
    typography: "{typography.reply}"
  comment-field:
    backgroundColor: "{colors.dark-editor}"
    textColor: "{colors.dark-text}"
    typography: "{typography.reply}"
    rounded: "{rounded.control}"
    padding: "9px"
    width: "100%"
  comment-passage-disclosure:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.dark-text}"
    typography: "{typography.code}"
    padding: "8px"
  source-mode:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-text}"
    typography: "{typography.label}"
    rounded: "{rounded.compact}"
    padding: "3px 5px"
  review-tool-active:
    backgroundColor: "{colors.dark-control}"
    textColor: "{colors.dark-text}"
    typography: "{typography.label}"
    rounded: "{rounded.compact}"
    padding: "5px 8px"
  tracking-source-disclosure:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.dark-text}"
    padding: "8px"
  tracking-confirmation:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-text}"
    typography: "{typography.body}"
    padding: "12px 0"
  history-content-tab:
    textColor: "{colors.dark-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.compact}"
    padding: "6px 8px"
  history-content-tab-selected:
    backgroundColor: "{colors.dark-control}"
    textColor: "{colors.dark-text}"
    typography: "{typography.label}"
    rounded: "{rounded.compact}"
    padding: "6px 8px"
  history-restore-preview:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-text}"
    typography: "{typography.body}"
    padding: "14px 0 0"
  history-label-field:
    backgroundColor: "{colors.dark-editor}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  history-label-action:
    textColor: "{colors.dark-text}"
    typography: "{typography.label}"
    padding: "6px 8px"
  history-view-selected:
    backgroundColor: "{colors.dark-control}"
    textColor: "{colors.dark-text}"
    typography: "{typography.body}"
    padding: "7px 10px"
  template-control-selected:
    backgroundColor: "{colors.dark-control}"
    textColor: "{colors.dark-text}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "7px 9px"
  template-row-selected:
    backgroundColor: "{colors.dark-selection}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.compact}"
    padding: "10px"
    width: "100%"
  template-field:
    backgroundColor: "{colors.dark-editor}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    width: "100%"
  template-source:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
    padding: "12px"
    width: "100%"
  template-snapshot-field:
    backgroundColor: "{colors.dark-editor}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    width: "100%"
  library-tag-label:
    textColor: "{colors.dark-muted}"
    typography: "{typography.label}"
    padding: "1px 3px"
  library-project-selected:
    backgroundColor: "{colors.dark-selection}"
    textColor: "{colors.dark-text}"
  library-field:
    backgroundColor: "{colors.dark-editor}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
    width: "100%"
  library-review-dialog:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.dialog}"
    height: "min(850px, 85vh)"
  compile-options-dialog:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.dialog}"
    padding: "0"
    width: "550px"
  generated-files-dialog:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.dialog}"
    padding: "0"
    width: "850px"
    height: "min(850px, 85vh)"
  build-options-field:
    backgroundColor: "{colors.dark-editor}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    width: "100%"
  generated-file-row:
    textColor: "{colors.dark-text}"
    rounded: "{rounded.small}"
    padding: "10px 6px"
  generated-text-preview:
    backgroundColor: "{colors.dark-editor}"
    textColor: "{colors.dark-text}"
    typography: "{typography.code}"
    rounded: "{rounded.control}"
    padding: "10px"
    width: "100%"
  build-primary-action:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-bg}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
---

# Design System: Leaf

## Overview

**Creative North Star: "Leaf's compact neutral writing environment"**

Leaf follows the owner's confirmed 简约风 direction: a light-first local LaTeX writing environment within the established compact neutral Operate world. Quiet writing surfaces, fine separators, small line icons and clear actions leave the document at the center. The approved Leaf name clarifies the product identity while retaining the incumbent layout, density, neutral palettes and optional assistant workflows.

The recurring identity is a genuine Lucide leaf outline beside the lowercase leaf wordmark and its terminal dot; compact library navigation uses l. and the local workspace avatar uses L. Fresh settings and the initial page use the existing light theme. A saved light, dark or system preference takes precedence; system follows the operating system rather than becoming a forced light choice. This is the current browser application; native packaging is deferred.

Leaf is the product name, while the existing Prism folder and prism_pro repository, data and integration namespaces remain compatible. Original Prism and Overleaf names still identify import sources, and the independent-software attribution retains its historical Prism reference. Existing assistant, API-provider and local CLI-login controls remain available. Earlier extension records below retain their original names and review boundaries; the identity amendment does not rewrite that historical evidence or certify the full Leaf plan.

The file-manager extension carries that character into upload, move, Trash and restore review. A centered dialog presents context, destination or affected paths, then a named action. Writing checks extends the same tool vocabulary with bundled English (US/UK) spelling, independent LaTeX hints and personal words: active-file context precedes inspectable findings and explicit corrections. Saved chats continue it through named conversation rows, a bounded reading area and compact source/review controls. Existing-table drafts extend the same vocabulary through a schematic source grid, native structure controls and review before one reversible Apply. Clipboard choices reuse that vocabulary through a captured target, native format choices, bounded content/source inspection and a reachable paste/recovery footer. Local comments continue it through the Review sidebar, original source quotes, rule-separated plain-text messages and reachable thread/reply controls. Ordinary source review extends that sidebar through complete removed/added passages, native selection and a reachable explicit decision. Project history continues this vocabulary through a flat timeline, read-only saved discussion/source disclosures and an explicit, bounded recovery plan. Milestone labels extend that history through restrained view/search controls, plain editable rows and recoverable removal beside the selected version. Local templates continue it through flat collections, inspectable frozen source, explicit separate PDF compilation and reachable create/capture actions. The project library continues it through named tag markers, archive navigation, native list/grid selection and exact-target reviews with reachable preparation, confirmation and recovery. Compile tools continue it through explicit next-build choices, immutable generated-file rows, strict read-only text and source/output ZIP review with persistent preparation/recovery controls. Local-first editing is the current product context; this document does not define the appearance of future hosted collaboration.

Persistent unsent chat prompts continue this vocabulary through compact local-save status, retained error text and a bounded comparison of literal window versions before an explicit choice.

Saved-chat search extends the same sidebar through literal title/prompt/reply excerpts, explicit archive restoration and exact saved-turn navigation while retaining each conversation's unsent prompt.

Installed-runtime choices extend the same vocabulary through a native selector, wrapping installation path, explicit unavailable-tool guidance and named refresh actions. Finished-build context keeps the resolved runtime beside the PDF, logs and generated files rather than presenting current settings as the identity of earlier output.

Diagnostic actions extend the same vocabulary through complete wrapping source labels, named inline preparation and recovery, and literal existing/proposed prompt review before Keep, Append or Replace. The actual source opens before composer review; Send remains a separate explicit action.

Source-draft recovery extends the same vocabulary through a persistent, quiet editor notice and a bounded literal disk/editor comparison. The named file and retained writing precede explicit Use disk version or Save edited version choices; inspecting a review does not apply either version.

Editor workflow preferences extend the same native settings vocabulary through independent source-save and automatic-compile timing, a local preference draft and an explicit Save editor settings action. Manual saving keeps recovery active and places a named Save action beside truthful Autosave off source status.

Quick-open and the command palette extend this vocabulary through a protected native dialog, named project/query context and flat wrapping filename/path or command rows. Local search, explicit availability reasons and input-owned result navigation lead to existing guarded actions; sticky tab actions keep discovery reachable beside overflowing file tabs.

Source formatting extends this vocabulary through a named local tool, the selected file and an explicit default-indentation policy before a separate preview. Literal changes and complete read-only source views lead to one guarded, reversible Apply; availability, Stop and retained-error recovery remain explicit.

**Key Characteristics:**

- Light-first neutral surfaces with inverted primary actions and saved light, dark or system preferences respected.
- A recurring Lucide leaf, lowercase leaf. wordmark, compact l. library monogram and L workspace initial.
- Compact toolbars and file navigation; more breathing room inside review dialogs.
- Native inputs, selects, checkboxes and dialogs with visible keyboard focus.
- Lucide line icons paired with labels, paths or accessible names.
- Reviewable path lists, explicit operation states and recoverable file changes.
- Local writing controls, source-context findings and explicit reversible corrections.
- Named saved chats, compact reply metadata and readable local Markdown/math within the existing editor.
- Source-preserving table drafts with truthful cell selection, bounded source review and explicit recovery controls.
- Immediate supported formatted paste with isolated Undo, and explicit clipboard review when content requires choices.
- Local source-anchored discussion with truthful passage status, retained drafts and explicit saved-versus-draft recovery.
- Exact local source review with coherent passages, explicit confirmation and dedicated reversible decisions.
- Review-aware history with truthful availability, scoped restoration and reachable recovery choices.
- Multiple milestone labels with active-name search, stable saved-version context, retained drafts and recoverable removal.
- Inspected local starters and personal snapshots, bounded source/PDF previews and pinned create/capture actions.
- Named local tags, editable archived projects and exact-target selection reviews with persistent recovery context.
- Explicit build options, truthful draft/error labels and immutable generated files with retained selection/download review.
- Persistent per-conversation prompt text with truthful save status, hidden accessible empty context and explicit competing-version recovery.

- Literal project-local saved-chat excerpts, explicit archive restoration and focused old-turn navigation with retained composer text.
- Explicit installed-runtime selection with no silent substitution, reachable recovery and truthful captured-build identity.

- Target-aware diagnostic preparation with retained literal prompts, explicit choices and named stale-state recovery before Send.
- Project-bound recoverable source drafts, literal disk/editor inspection and explicit version choices with retained error and download recovery.
- Independent editor timing, explicit preference/source saves and retained recovery in Manual mode.

- Project-local quick-open and commands with wrapping paths, explicit availability, bounded results and protected input-owned navigation.
- Local source formatting with a captured target, truthful tool availability, literal comparison and explicit one-edit Apply.

This is a source-backed record of `src/styles.css`, the shared modal and the delivered file-manager components named in the `FILE-BATCHES-2026` contract in `index.html`. Visual references are `docs/screenshots/prism-reference-review-dark.png` and `prism-reference-review-light.png`; current captures are `.impeccable/review/desktop.png`, `user-997.png`, `mobile.png`, `restore-light.png` and `restore-mobile.png`. These establish the captured dialog compositions, not a certification of unrelated editor, home or collaboration flows. The mobile media was proportionally scaled from a configured viewport (560 × 850); it must not be treated as a different responsive breakpoint.

The `WRITING-CHECKS-2026` extension is recorded from `src/components/WritingChecksPanel.tsx`, its stylesheet rules and the sampled App/Editor integration. Reviewed captures are `.impeccable/review/writing/desktop.jpg`, `user-997.jpg`, `mobile.jpg`, `dictionary-light.jpg` and `dictionary-mobile-light.jpg`. The narrow capture (553 × 839) is proportional media from the configured (560 × 850) viewport. The finish review found the captured compositions consistent with this incumbent world; its follow-up ship verdict covers the PRODUCT.md correction only. Loading, error, off, excluded, focused and scrolled states were not captured, so their visual finish is not certified by this record.

The `CHAT-2026` extension is recorded from `src/components/ConversationList.tsx`, `ChatTranscript.tsx`, `ChatMarkdown.tsx`, the stylesheet's chat rules and sampled App integration. Reviewed captures in `.impeccable/review/chat/` are `desktop.jpg` (1440 × 1000), `user-997.jpg`, `light.jpg` and `failure-light.jpg` (997 × 833), plus `mobile.jpg` (553 × 839, proportionally captured from a configured 560 × 850 viewport). The finish review's ship disposition covers these captured compositions and the sampled extension: the saved-chat sidebar, active title, paging above an internally scrolled transcript, existing composer, reply formatting and saved partial failure. Tables, complete long code blocks, open source disclosures, proposal review and transient/focused states are source-backed rather than visually certified by these stills. Motion is not certified by still captures.

The `TABLE-EDITING-2026` extension is recorded from `src/components/TableEditor.tsx`, `src/table-source.ts`, the table/insertion rules in `src/styles.css` and the sampled `src/visual-editor.ts` and App open/apply/modal integration. Canonical final captures in `.impeccable/review/tables/` are `desktop-dark.jpg`, `desktop-light.jpg`, `desktop-dark-readonly.jpg`, `user-997-dark.jpg`, `user-997-stale.jpg`, `user-997-source-fallback.jpg` and `narrow-light-error.jpg`. They establish the captured neutral dialog, merged selection, read-only, stale-source, source-only and validation compositions. All use embedded synthetic provenance. The configured narrow viewport (560 × 850) produced proportional media (553 × 839); this establishes contained dialog content inside the incumbent desktop shell, not a mobile editor. Superseded `round1*` captures are not canonical evidence.

The table finish verdict resolves the two requested corrections: selection now follows the intended logical cell after merge/unmerge/history changes, and stale recovery exposes a complete raw draft copy before close/reload. Its ship disposition covers those scored fixes, not whole-surface or whole-app certification. Functional verification records (325 passing tests including ten new table tests, the build, three compiled synthetic fixtures, one browser Apply/compile, stale-source rejection, byte-exact Undo/restart and synthetic Manual Type locking) support behavior rather than visual claims. The one static detector pass used a degraded fallback because optional HTML parser modules were unavailable; its inherited wider-file findings do not certify this surface. No second detector or URL detector was run. Uncaptured states and motion remain uncertified; no private paper or paid provider was used. See `docs/verification/table-editor.md` for the evidence boundaries.

The `CLIPBOARD-2026` extension is recorded from `src/components/ClipboardPaste.tsx`, `src/prepare-clipboard.ts`, `src/editor-clipboard.ts`, `src/visual-clipboard.ts`, `src/rich-clipboard.ts`, the clipboard/insertion stylesheet rules and the sampled SourceToolbar, EditorSettings, UploadFiles, Editor and App integration. Canonical final captures in `.impeccable/review/clipboard/` are `round2-desktop-dark.jpg`, `round2-desktop-dark-readonly.jpg`, `round2-desktop-light.jpg`, `round2-user-image.jpg`, `round2-user-replacement.jpg`, `round2-narrow-light-warning.jpg`, `round2-narrow-light-stale.jpg`, `round2-narrow-light-expired.jpg`, `fix-package-review.jpg` and `fix-format-loss-review.jpg`. Desktop media is (1440 × 1000), user-sized media is (997 × 833), and configured narrow (560 × 850) captures produce proportional rasters (553 × 839). These provenance-bearing synthetic captures establish the shown preview, read-only, image/replacement, warning, stale and expired-source compositions within the incumbent desktop shell. The resize-transition image was replaced; `round1*` media is superseded.

The clipboard finish verdict in `.impeccable/review/clipboard/finish-verdict.md` resolves package-dependent default routing/notice and detected formatting-loss disclosure. Its ship disposition covers those two scored fixes, not whole-surface or whole-app certification. `docs/verification/clipboard.md` records (348 passing deterministic tests), the production build, five real confined compile cases, native paste/Undo, package/loss review with the preview preference off, image consent, stale/expired-source recovery and cross-view locking. These support behavior separately from the captured visual evidence. One static detector pass was degraded to regex because its optional parser modules were unavailable; no rerun or URL detector was run, and this does not certify computed contrast. Motion and uncaptured states remain outside the still-image evidence. No paid request, private paper or owner's port (4317) server change was used.

The `COMMENTS-2026` extension is recorded from `src/components/CommentsPanel.tsx`, `src/comment-markers.ts`, `src/use-comments.ts`, the comments rules in `src/styles.css` and the sampled App, Editor and SourceToolbar integration. Canonical final captures in `.impeccable/review/comments/` are `round2-desktop-dark-thread.jpg` and `round2-desktop-light-readonly.jpg` (1440 × 1000), `round2-user-comparison.jpg` (997 × 833), plus `round2-narrow-comparison.jpg`, `round2-narrow-thread.jpg` and `round2-narrow-stale-draft.jpg` (553 × 839 from a configured 560 × 850 viewport). `docs/screenshots/prism-comments-dark.jpg` and `prism-comments-light.jpg` are the final documentation copies. All carry embedded synthetic provenance. Superseded `round1*` captures are not canonical evidence.

The full comments finish review in `.impeccable/review/comments/finish-verdict.md` returned SHIP for all six final captures and the sampled implementation, with no material fixes requested. This establishes the shown thread, read-only, saved-versus-draft comparison, sticky navigation/reply and retained stale-new-draft compositions. Lists, Trash, focused states, motion and unsampled backend branches are not visually certified. The narrow images retain the incumbent desktop horizontal-overflow layout; they do not establish a mobile editor. `docs/verification/comments.md` records (361 passing deterministic tests), the production build and three real confined pdfLaTeX builds with identical extracted PDF text, alongside the then-current source/history-isolation checks, retry/conflict recovery, restart, cross-file, keyboard and synthetic Manual Type checks. Those results support behavior separately from visual evidence. The once-only changed-target detector degraded to regex because its optional parsers were unavailable, reporting (106 findings: six warnings and 100 advisories), mostly inherited shared-stylesheet choices. It did not evaluate computed contrast; no URL detector was run. Only synthetic fixtures were used, with no paid request or private paper.

The `TRACKING-2026` extension follows its body contract in `index.html` and current `PRODUCT.md`, recorded from `src/components/TrackingPanel.tsx`, `src/tracking-markers.ts`, `src/use-tracking.ts`, `shared/tracking.ts`, the tracking stylesheet region beginning at (5423), and sampled App/Editor integration. Canonical final captures in `.impeccable/review/tracking/` are `fix1-desktop-dark-confirm.jpg`, `fix1-desktop-light-readonly.jpg`, `fix1-desktop-stale.jpg` and `fix1-desktop-visual-paused.jpg` (1440 × 1000), `fix1-user-confirm.jpg` (997 × 833) and `fix1-narrow-confirm.jpg` (553 × 839 from a configured 560 × 850 viewport). The final documentation copies are `docs/screenshots/prism-tracking-dark.jpg` and `prism-tracking-light.jpg`. All six final captures were opened and are valid; the provenance scan found embedded provenance on all (19 rasters, zero missing). Earlier `round1*` and `round2*` tracking captures are superseded.

The fresh full tracking finish review in `.impeccable/review/tracking/finish-verdict.md` found the six captured compositions consistent with the incumbent neutral world and requested one FORM performance correction. The same reviewer then scored that correction resolved and returned SHIP for the scored fix: a monotonic newline cursor replaces repeated full-prefix line scans, with fallback rewind handled. The recorded (1,902,890-byte) fixture checks (1,000) positions, fallback line accuracy and exact Reject reconstruction; line counting took (7.78ms). Its actual bounded diff used the exact grouped fallback, so this is not a claim that (1,000) detailed hunks finish within the diff budget. All six recaptures showed no visible regression from this fix. The verdict does not certify the whole application, unsampled App/Editor/backend branches, uncaptured states, computed contrast or motion.

`docs/verification/tracking.md` records (374 deterministic tests), the production build and five real confined pdfLaTeX builds after the correction. Extracted PDF text matches original/rejected source and separately tracked/accepted/Undo Reject source. The final source audit found both original files byte-exact and zero pending files; three local stub turns in the same conversation ended completed/stopped/stopped. These are recorded behavioral results, not checks rerun by the documenter. No paid request or private paper was used. The once-only static detector degraded to regex because optional parsers were unavailable, returning zero errors, six warnings and 100 inherited advisories outside the new tracking-style region; this undercount does not establish computed contrast or a new design rule, and no URL detector ran. Narrow captures retain the incumbent desktop horizontal overflow, not a mobile editor.

The `REVIEW-HISTORY-2026` extension follows its body direction and QUALITY BAR in `index.html` and the owner's confirmed default in `PRODUCT.md`. It is recorded from `src/components/HistoryPanel.tsx`, `HistoricalReview.tsx`, history styles beginning at (5618), the shared `Modal`/App integration, `shared/history-recovery.ts`, `server/history-recovery.ts` and `server/review-history.ts`. This is an established-world Operate extension with no new seed or approved composition. Canonical captures in `.impeccable/review/review-history/` are `round2-desktop-light-archive.jpg`, `round2-desktop-dark-restore.jpg`, `round2-desktop-dark-error.jpg` and `round2-desktop-light-readonly.jpg` (1440 × 1000); `round2-user-stale.jpg` (1004 × 844); `round2-user-997-restore.jpg` (997 × 833); `round2-narrow-legacy.jpg` (full document, 650 × 850); and `round2-narrow-legacy-viewport.jpg` (553 × 839, proportional raster from the configured/DOM viewport of 560 × 850). All eight were opened and validated by the reviewer and carry embedded built-application/synthetic-fixture provenance. `docs/screenshots/prism-review-history-dark.jpg` and `prism-review-history-light.jpg` are documentation copies of the validated captures. Narrow content retains the incumbent shell's (650px) minimum width and horizontal pan; the contained dialog actions do not establish a mobile editor.

The fresh history finish review in `.impeccable/review/review-history/finish-review.md` found no material UI correction at the sampled history/archive scope and returned FIX solely for persistence documentation. The verdict pass scored that documentation fix resolved and returned SHIP at that correction scope. The review establishes the shown archive, restore, inline error, stale-review, source-only legacy and read-only compositions, not whole-app approval, full Overleaf parity, unsampled Store/comments/tracking integrations, uncaptured states or motion. Still images do not certify animation or computed contrast.

`docs/verification/review-history.md` records (390 passing deterministic tests), the production build and six real sandboxed pdfLaTeX builds; exact source/review recovery; a lost-response retry with a single application; stale-comment rejection; capture preference after restart; and two synthetic Manual Type stub turns in the same saved conversation, including unchanged draft source, Pause, read-only notes/history inspection, Stop and exact Undo. These are recorded behavioral results, not checks rerun by the documenter. No live provider, private paper or paid call was used. The once-only detector degraded to regex because optional parser modules were unavailable: six warnings and 100 advisories were inherited stylesheet findings, with none in the added history-style region or changed TSX. It is an undercount, not new system guidance; no detector rerun or URL detector was performed.


The `HISTORY-LABELS-2026` extension follows the first body direction and inline QUALITY BAR in `index.html`, extending the established compact neutral Operate world without a new identity, seed or composition. It is recorded from `src/components/VersionLabels.tsx`, `HistoryPanel.tsx`, the label stylesheet region beginning at (5850), `shared/history-labels.ts` and sampled `server/history-labels.ts` metadata behavior. Canonical captures in `.impeccable/review/history-labels/` are `round2-desktop-dark.jpg`, `round2-desktop-light.jpg`, `round2-desktop-readonly.jpg` and `round1-desktop-error.jpg` (1440 × 1000); `round2-user-dark.jpg`, `round1-user-light.jpg` and `round1-user-conflict.jpg` (997 × 833); and `round2-narrow-light.jpg` (553 × 839, proportional raster from configured/DOM 560 × 850). The fresh reviewer opened and validated all eight, including their embedded built-application/synthetic-fixture origins. The `round1` files named here remain canonical state evidence; there was no material UI correction between the two builder rounds. `docs/screenshots/prism-history-labels-dark.jpg` and `prism-history-labels-light.jpg` are exact copies of the validated desktop captures. Deliberate scroll positions show field, conflict or retry content while the heading/Close remains fixed. The narrow dialog retains the incumbent (650px) shell minimum and horizontal pan; it does not establish a mobile editor.

The fresh finish review in `.impeccable/review/history-labels/finish-review.md` returned SHIP with no material fixes for those eight captures and the sampled label/history implementation. It establishes the shown view/search, multiple wrapping names, removed-label recovery, retained stale draft, ambiguous-response retry, narrow keyboard controls and read-only compositions. Full App/routes/recovery implementation, test bodies, production-build log and external parity documentation were not independently read by the reviewer. Uncaptured loading, empty, limit and validation compositions, unsampled branches, maximum-size responsiveness, motion, computed contrast and whole-app/Overleaf parity are outside this review's certification.

`docs/verification/history-labels.md` records (406 passing deterministic tests, including 16 new tests), the production build and two real macOS-sandboxed pdfLaTeX builds with exact active source, immutable snapshot payload, generation and history count across label-only changes, plus identical extracted PDF text. Recorded browser checks cover lifecycle, case/accent search, empty filters, long Unicode wrapping, restore-target preview/Cancel, a committed save with a synthetic (503) response, replay-safe retry, a two-view (409) conflict retaining the draft and backend restart. Two local Manual Type stub turns reused one conversation: drafts left source/history unchanged; approved partial insertion exercised Pause, Resume, Stop, read-only notes/history/label metadata and exact Undo. The final audit records exact original source and all three original snapshots unchanged, label revision (9) with nine operations, three active labels and one removed label; generation (4) and six history entries include intentional AI progress and Undo. These are recorded results, not checks rerun by the documenter. No live provider/CLI retest, paid call, private paper or owner port (4317) server change was used.

The label detector ran once and degraded to regex because optional parsers were unavailable, reporting six inherited warnings and (101 advisories). Its sole new-region advisory is the intentional narrow (16px) search/name input step, retained for the mobile-input floor rather than treated as a type-ramp defect. Inherited (9px) timeline metadata is not new guidance. No detector rerun or URL detector was performed, and the static result does not certify computed contrast.

The `TEMPLATES-2026` extension follows the first-body direction contract in `index.html`, current `PRODUCT.md` and the established compact neutral Operate world. It is recorded from `src/components/TemplateBrowser.tsx`, `SaveTemplate.tsx`, `templates.css`, the shared `Modal`/theme rules and sampled App/ProjectHome integration. New project now opens the local catalog: seven generic built-in starters, including an intentionally empty Blank, and immutable personal snapshots. Built-in plus personal is a recorded implementation assumption after an unanswered optional preference question, not an owner-confirmed preference. No new identity, seed or approved composition is introduced.

The fresh `.impeccable/review/templates/finish-review.md` returns SHIP with no material fixes at the screenshot and sampled-UI-code scope; all twelve required confirmed captures are valid. Canonical captures in `.impeccable/review/templates/` are `confirmed-desktop-dark-source.jpg`, `confirmed-desktop-dark-save.jpg`, `confirmed-desktop-light-preview.jpg`, `confirmed-desktop-light-trash.jpg`, `confirmed-desktop-create-retry.jpg`, `confirmed-home-save.jpg`, `confirmed-ai-readonly.jpg`, `confirmed-ai-catalog-lock.jpg` and `confirmed-ai-undo.jpg` (1440 × 1000); `confirmed-user-dark-source.jpg` (997 × 833); and `confirmed-narrow-catalog.jpg` / `confirmed-narrow-save.jpg` (553 × 839, proportional rasters from configured 560 × 850). They establish the shown collection/source, successful separate personal PDF, recoverable Trash, pinned capture/creation, retry and source-lock compositions. The old narrow Save footer is superseded; current Save has a fixed heading, scrolling body and fixed Save/Cancel footer. Earlier save/metadata retry and stale-create stills remain supplemental state evidence, not the current Save layout.

The packet records (426 passing deterministic tests), a production build, eight real sandboxed TeX builds plus preview cancellation, exact source/assets/folder audits, restart persistence and deterministic Manual Type/Undo regression in one conversation. These were not rerun by the documenter and support behavior separately from visual review. The single detector used a degraded regex fallback with two intentional (16px) advisories and provides no computed-contrast certification. No browser, detector, test or provider was run for this documentation pass. Motion, every loading/empty/limit composition, exhaustive assistive-technology behavior, extreme-content performance, unsampled backend code and full Overleaf parity remain outside the finish review. Only synthetic source was used in the supplied captures; no live provider or private paper was involved.

The `LIBRARY-2026` extension follows the first-body direction contract in `index.html`, current `PRODUCT.md` and the established compact neutral Operate world. It is recorded from `src/components/ProjectHome.tsx`, `LibraryDialogs.tsx`, `TagDot.tsx`, `library.css`, incumbent `project-home.css`/theme/`Modal` rules, and sampled source-neutral metadata and prepared-download behavior in `shared/library.ts` and `server/library.ts`. It adds local organization without a new identity, seed or composition. Source, automatic history, chats and review remain independent; bibliography stays fully local by owner decision, hosted collaboration is later work and full Overleaf parity remains open.

The final `.impeccable/review/library/finish-review.md` returns `ship` only for two scored findings: a connected native HTTP prepared-ZIP link with persistent truthful prepared/requested status and preparation/Refresh/Close recovery; and named busy-project context that retains exact targets, states no projects moved, disables confirmation and recovers through Refresh. Both are resolved. This is not whole-surface or whole-app approval. All eighteen current captures are valid: eleven recaptured `confirmed-*` views plus seven `fix1-*`/`fix2-*` states in `.impeccable/review/library/`. Current viewports are desktop (1440 × 1000), user (997 × 833), narrow (560 × 850) and editor regression (1280 × 720). The four unchanged first-pass recovery captures remain supplemental evidence for their shown retries/conflicts/restoration, not current color-field/header topology. Shipping proof copies with embedded origins are `docs/screenshots/prism-library-dark.jpg`, `prism-library-light-grid.jpg`, `prism-library-narrow-tags.jpg`, `prism-library-download.jpg` and `prism-library-busy-project.jpg`. Review records name each current capture; the verdict-pass section of `review-packet.md` supersedes its earlier counts, captions and detached-download baseline.

`docs/verification/library.md` reports (448 passing tests, including 22 new library tests), the production build and three real sandboxed pdfLaTeX builds before organization, while archived and from nested source-ZIP round-trip. It records exact source/history/comment/tracking/chat audits, retained drafts, replay-safe retry, restart and deterministic Manual Type/read-only/Undo checks. These are reported evidence, not runs by the documenter. A real IAB-retrieved attachment is recorded with exact nested source bytes; clicking the native link leaves Download requested visible. Neither the native download event nor an OS Save notification is certified. The detector ran once in degraded regex mode with one intentional (16px) narrow-input advisory and no warnings; it does not certify computed contrast. Native color-popup interaction, exhaustive keyboard/assistive-technology behavior, motion, all loading/empty/limit compositions and extreme collection sizes remain outside visual certification. No browser, detector, tests or provider calls were made for this documentation pass.

The `BUILD-TOOLS-2026` extension follows the inline direction and QUALITY BAR in `index.html` and the owner-confirmed Normal + Stop defaults in `PRODUCT.md`. It extends the established neutral Operate world without a new identity, seed or composition. This record uses `src/components/BuildTools.tsx`, `build-tools.css`, the shared `Modal`, `shared/compiler.ts`, sampled App/PdfPreview integration and compiler/build-file behavior. The two final corrected captures, `.impeccable/review/build-tools/confirmed-user-files.jpg` (997 × 833) and `confirmed-narrow-files.jpg` (553 × 839 from configured 560 × 850), were opened for this documentation pass. They show Find, Select all/Clear and the selected count above independently scrolled rows, alongside `.bbl` text and reachable Review ZIP. The packet's other validated options, draft/error, last-good, replacement, prepared/requested, retry/conflict and AI captures remain evidence for their shown states; narrow containment does not establish a mobile editor.

The fresh `finish-review.md` requested one material correction: retain file-selection context while generated rows scroll. `finish-verdict.md` scores that correction resolved and returns `ship` for that scored fix, not whole-surface or whole-app approval. `docs/verification/build-tools.md` reports (464 deterministic tests, including 16 new tests), the production build, thirteen real macOS-sandboxed builds plus cancellation, exact source/output ZIP round-trip, persisted options, replay-safe save/conflict recovery, delayed-response protection and deterministic Manual Type/Pause/Resume/Stop/exact Undo in one saved conversation. Compiler/file-only inspection and option changes preserve source, automatic history and chats; intentional AI edits/Undo and their turns/history are recorded separately. These are reported results, not checks rerun by the documenter. No live provider request, private paper or owner server change was used.

The exact prepared link's HTTP payload is verified (61,249 bytes and 16 byte-exact source/output entries, including empty directories and a consented archive-only replacement); browser-native saved-file delivery was not observed. ZIP prepared and Download requested therefore remain distinct. The once-only static detector used a degraded regex fallback, with no non-advisory findings and one intentional (16px) narrow-input advisory; it does not certify computed contrast. No browser, server, detector, test or provider was run for this documentation pass. Native OS save UI, exhaustive assistive-technology behavior, motion, extreme-content performance and full Overleaf parity remain outside certification.

The `CHAT-DRAFTS-2026` extension follows the first-body contract and inline QUALITY BAR in `index.html`, current `PRODUCT.md` and this incumbent world. It is recorded from `src/components/ChatDraft.tsx`, `chat-draft.css`, `src/chat-drafts.ts`, the shared draft key/types and sampled composer/submission/Modal integration. The documenter opened `.impeccable/review/chat-drafts/fixed-short-empty-dark.jpg` and `fixed-short-saved-dark.jpg` (1280 × 720), plus `confirmed-narrow-stale-choice-light.jpg` (553 × 839 from configured 560 × 850). They show the corrected empty treatment, compact confirmed-save status and retained literal comparison with separated, reachable choices. The correction verdict also validates `fixed-short-manual-paused-dark.jpg`; the pre-correction empty and paused captures are superseded for that description treatment.

The fresh `finish-review.md` requested two corrections: hide the accessible empty description and reconcile PRODUCT.md's persistence language. `correction-verdict.md` scores both resolved and returns `ship` for those scored fixes, not whole-surface or whole-app approval. The packet reports (517 passing tests, including 21 draft regressions), the production build, confirmed-save reload/backend-restart recovery, exact draft-only source/history/chat/run audits, lost/stale-response recovery and synthetic Review/Manual Type/Undo checks. These are reported behavioral results, not runs by the documenter. Confirmed local saves survive reload/restart; unsaved in-memory text before debounce/commit has no abrupt-crash guarantee. No live-provider/paid-request testing, full Overleaf parity, draft version history, exhaustive accessibility, computed contrast or motion is certified. Narrow controls remain inside the inherited horizontally panning desktop shell. That earlier prompt-draft disposition did not score installed runtimes; the current TEX-RUNTIMES-2026 record below supersedes the earlier final-converter documentation deferral. The separately fixed cross-file Undo record is unchanged. No browser, server, detector or tests were run for this documentation merge.

The `CHAT-SEARCH-2026` extension follows the first-body contract and inline QUALITY BAR in `index.html`, current `PRODUCT.md` and the incumbent neutral Operate world. It is recorded from `src/components/ConversationList.tsx`, `ChatTranscript.tsx`, `chat-search.css`, shared chat styles and the sampled App `chooseConversation` integration. No new identity, seed or comp is introduced. The documenter opened all six required final captures in `.impeccable/review/chat-search/`: `final-default-light.jpg`, `final-expanded-light.jpg`, `final-expanded-dark.jpg`, `final-turn-error-light.jpg`, `final-narrow-archive-dark.jpg` and `final-narrow-match-dark.jpg`. They show default/expanded assistant layouts in both themes, literal marked excerpts, explicit archive restoration, exact-turn failure recovery and retained narrow composer text. Desktop rasters are (997 × 833); narrow rasters are proportional (553 × 839) captures of the configured (560 × 850) viewport. The finish reviewer opened all ten final/round-one captures and verified their embedded synthetic-fixture provenance; the six final captures govern the accepted composition.

The fresh `finish-review.md` returns `ship` for this bounded extension with no material fixes. `docs/verification/chat-search.md` reports (525 deterministic tests, including eight new search/navigation tests), the production build, old-turn focus, Earlier/Newer paging, archive restore, exact draft retention across navigation/restart, source/history/chat neutrality during search and zero search-triggered generations. It also reports one separate deterministic Manual Type/Pause/read-only inspection/Resume/exact cross-file Undo sequence; those intentional changes are separate from the search-only audit. These checks were not rerun by the documenter. The once-only static detector has one intentional (16px) narrow-input advisory and no nonadvisory findings. The (185px) sidebar contains the added search controls and snippets; the inherited (650px) editor minimum still requires horizontal panning. Still captures do not certify motion or computed contrast; exhaustive accessibility, extreme browser history performance, live providers, complete Overleaf parity and installed-runtime verification remain outside that search disposition; the current runtime record below supplies the later fourth-pipeline evidence. No browser/server, detector, test or provider was run for this documentation merge.

The `PREVIEW-BUILD-2026` extension follows the first-body contract and inline QUALITY BAR in `index.html`, current `PRODUCT.md` and the incumbent neutral Operate world. It is recorded from the replacement-preview/status integration in `src/App.tsx`, `src/components/preview-build.css`, `src/preview-compile.ts` and the shared draft/modal styles. No seed, comp or replacement identity is introduced. The documenter opened all eight required final captures in `.impeccable/review/preview-builds/`: `final-success-dark.jpg`, `final-success-light.jpg`, `final-uncertain-dark.jpg`, `final-stopping-dark.jpg` and `final-stopped-dark.jpg` (997 × 833), plus `final-success-narrow-light.jpg`, `final-recovered-narrow-light.jpg` and `final-cancel-before-start-light.jpg` (553 × 839 proportional rasters from configured 560 × 850). They retain the replacement/PDF hierarchy, named inline status, fixed heading/footer and bounded scrolling body. The finish reviewer opened all twelve final/round-one captures and checked embedded synthetic in-app-browser provenance; the final images govern the current composition.

The fresh `finish-review.md` returned `fix` for two state-truth defects. `correction-verdict.md` scores both resolved and returns `ship` for those fixes: cancellation before a job exists visibly acknowledges Stopped, and recovered failed/no-PDF output uses truthful earlier-result wording. The two matching narrow captures were replaced and reopened after correction. This is a verdict on the scored fixes, not whole-surface or whole-app approval. `docs/verification/preview-builds.md` reports (540 passing deterministic tests, including 15 preview tests), the production build, four confined real pdfLaTeX jobs, eleven browser compile attempts, exact request/recovery/cancellation audits and source/history/chat neutrality for compile-only operations. Intentional approved typing/Pause/read-only inspection/Resume/Undo checks remain separate. Saved compile identity/status survives SQLite restart and a fresh view can reopen it without generating or recompiling; edited unapproved replacements and suggestions remain session-only. These behavioral checks were not rerun by the documenter.

The once-only static detector reports only two intentional (16px) narrow-textarea advisories; this local adaptation and the preview log's (11px) legibility treatment do not replace global type tokens. Sampled contrast values support the shown text/help only. Still captures do not certify motion, exhaustive accessibility, uncaptured states or abrupt-server-exit process supervision. Narrow containment remains inside the inherited desktop shell. Broader Overleaf parity and live paid providers remain open; the later TEX-RUNTIMES-2026 record below supersedes the earlier Ghostscript-dependent fourth-pipeline deferral. No browser/server, detector, test or provider was run for this documentation merge.

The `TEX-RUNTIMES-2026` extension follows the first-body direction contract in `index.html`, current `PRODUCT.md` and the incumbent neutral Operate world. It is recorded from `src/components/BuildTools.tsx`, `build-tools.css`, `shared/tex-runtimes.ts` and sampled runtime/engine/PDF/log/replacement integration in `src/App.tsx`. Native fields, wrapped paths, flat context and explicit recovery extend the existing system without new colors, primitive tokens, identity, seed or comp. The documenter opened all four actual-converter captures in `.impeccable/review/tex-runtimes/`: `fourth-pipeline-options.jpg`, `fourth-pipeline-pdf.jpg`, `fourth-pipeline-generated.jpg` and `fourth-pipeline-draft-preview.jpg`, each (997 × 833). They show the selected runtime, actual classic PDF and EPS figure, literal PostScript inspection and a separate compiled replacement. The earlier nineteen-capture layout assessment remains the baseline; these four stills do not replace that matrix or establish motion, computed contrast or a mobile editor.

A fresh substituted reviewer, because the original reviewer was unavailable, returned `ship` in `fourth-pipeline-verdict.md` and scored only the sole outstanding full-pipeline demonstration fix resolved. `docs/verification/tex-runtimes.md` reports genuine pdfLaTeX, XeLaTeX, LuaLaTeX and LaTeX → DVI → PS → PDF, including the actual final converter, Normal/draft and Stop/Continue behavior, recorded runtime, SyncTeX, generated/source ZIP round-trip and live-backend cancellation through the running converter. The reported (540 passing tests) and production build were not rerun by the documenter. This fulfills the earlier fourth-pipeline documentation deferral; preserved older sidecar extension objects remain historical scope records, with `extensions.texRuntimes` carrying the current reconciliation. Package provenance and the owner-authorized converter installation are recorded in `docs/verification/ghostscript.md`, rather than made into a design token or package-install guarantee.

The evidence uses one physical TeX Live installation; distinct-version live behavior, Biber and live providers remain untested in this round. Abrupt backend exit can still leave detached compiler processes alive, and combined diagnostics still retain intermediate warnings after later bibliography passes resolve the final output. Normal cancellation must not be described as backend-exit safety, and final PDF success must not erase that diagnostic limitation. Cross-file typing Undo is separately fixed; this converter verdict makes no new typing/recovery claim. No whole-app, security-audit, exhaustive-accessibility or full Overleaf-parity certification follows. No browser/server, detector, test or provider was run for this documentation merge.

The `DIAGNOSTIC-ACTIONS-2026` extension follows the first-body contract and inline QUALITY BAR in `index.html`, current `PRODUCT.md` and the incumbent neutral Operate world. It is recorded from `src/components/DiagnosticAction.tsx`, `diagnostic-action.css`, `src/diagnostic-actions.ts`, the diagnostic wrapping rules in `src/styles.css` and sampled App target/composer integration. It hardens the existing Logs → Fix with AI action without a new identity, seed, comp or global token. The documenter opened five accepted captures in `.impeccable/review/diagnostic-actions/`: `draft-review-actual.jpg`, `light-review.jpg`, `long-label-dark.jpg` and `long-label-light.jpg` (997 × 833), plus `mobile-long.jpg` (390 × 844). They show literal draft comparison, both-theme source-label wrapping and reachable wrapped choices in the contained native dialog. The finish reviewer opened all eleven supplied synthetic-origin captures, including desktop (1440 × 900), preparing, failure and response context. The actual user-width captures are (997 × 833), not (1280px) wide.

The fresh `data/verification/diagnostic-actions-browser/finish-review.md` returns `ship` with no material fixes for this action/dialog/label extension. `docs/verification/diagnostic-actions.md` reports (594 passing tests, including 29 new controller tests), TypeScript/production build success, two real confined TeX fixture builds and browser checks for exact Keep/Append/Replace, correct target/caret, retained scope, failure/retry, slow-read scope change, keyboard recovery and long drafts/labels. Before Send, the synthetic audit records exact source/history/project state, the same existing conversation and zero AI requests, runs or provider invocations. Two subsequent explicit fixture Sends use Document and Whole Project in that conversation, with the nested target `sections/with space.tex`, revision (0) and collapsed line-two caret (16..16). Four deterministic adapter invocations cover inspection/response; no live or paid provider request occurred. These checks were reported, not rerun by the documenter; ordinary pending source autosave before navigation remains separate from preparation.

The once-only detector used a degraded regex fallback, with no findings in the new component/CSS and six warnings in unchanged incumbent styles; its (106) total findings do not establish computed contrast. The narrow native review is contained at (350px) within a (390px) viewport, while the incumbent editor retains its (650px) minimum width. This establishes dialog containment rather than full-workspace mobile support. Stills and this bounded ship disposition do not certify motion, exhaustive accessibility, native screen-reader/touch behavior, broader diagnostic formats, live providers, backend scope changes or complete Overleaf parity. No browser/server, detector, tests or provider were run for this documentation merge.

The `LEAF-IDENTITY-2026` amendment follows the first-body direction and inline QUALITY BAR in `index.html` and the explicit owner decisions in `PRODUCT.md`: use Leaf, retain the Prism folder/repository and all existing AI assistants/API calls, and keep browser delivery now with native packaging later. It is recorded from `src/components/LeafMark.tsx`, the library/editor/help integration in `src/App.tsx` and `ProjectHome.tsx`, `src/styles.css`, `project-home.css`, the settings/appearance controls and the fresh preference fallback in `server/app.ts`. This is an approved identity clarification inside the established world; no seed, comp, new palette or primitive token is introduced. Historical extension evidence above remains unchanged at its original scope.

The fresh full review in `data/verification/leaf-audit/identity-finish-review.md` returns `ship` with no material fixes for the identity, fresh light default and retained-AI UI. The reviewer validated all seven current synthetic-origin JPEGs in `.impeccable/review/leaf-identity/`: `desktop.jpg` (1440 × 900), `user-997.jpg` (997 × 833), `mobile.jpg` and `mobile-settings.jpg` (390 × 844), plus `editor-light.jpg`, `editor-dark.jpg` and `connections.jpg` (997 × 833). The initial dark-editor capture had an unpainted PDF canvas and yielded `recapture`, not a valid ship/fix review. That file was replaced after both canvases rendered; a fresh decode resolved a stale tool-image display, and the subsequent full seven-image review governs this amendment. The supplied provenance scan reports seven rasters and zero missing origins. These captures establish the shown library, compact identity, settings, real two-page synthetic PDF and retained assistant/connection compositions. The documenter read the review records and source; it did not reopen images or operate a browser.

The supplied packet reports (602/602 passing tests) from `leaf-tests.log` and a final production/typecheck build from `leaf-build-final.log`. The suite precedes the final literal-only l./L/help-label correction; the final build and captures cover that correction. Theme regressions cover a fresh light default and saved light/dark/system across backend reopen. The browser audit reports exact source/history/project records with zero generations, runs or chats during navigation/theme/settings checks. These are recorded results, not checks rerun here. The once-only regex-degraded detector reports (19 advisories, zero warnings); it cannot certify computed contrast and was not rerun.

This bounded UI ship disposition does not certify the full Leaf plan, ordinary filesystem/offline safety, a mobile editor, native packaging, motion, exhaustive accessibility or live-provider compatibility. The audit's unresolved P0 startup disk-overwrite issue remains open. Separate compiler timeout/lifecycle evidence is outside this visual amendment. No browser, server, detector, implementation test, build or provider call was run by the documenter. **Not canonized:** the inherited tiny tracked LOCAL badge and other tiny shell metadata are not a reusable heading or typography system; neither degraded-detector advisories nor a screenshot correction establishes a new design primitive.

The `SOURCE-RECOVERY-2026` extension follows the first-body direction and inline QUALITY BAR in `index.html`, current `PRODUCT.md` and the owner's local-first/browser-delivery amendments in `docs/LEAF_IMPLEMENTATION_PLAN.md`. It is recorded from `src/components/SourceRecovery.tsx`, `source-recovery.css`, the shared `Modal`/theme controls, sampled App notice/editor/navigation integration, and `server/source-recovery.ts`. It extends the established neutral 简约风 Operate world without a seed, comp, replacement identity or new primitive token. The documenter opened all eight corrected synthetic-origin captures in `.impeccable/review/source-recovery/`: `desktop.jpg` (1440 × 900); `user-1280.jpg`, `save-failure.jpg`, `conflict-dark.jpg`, `stale-review-dark.jpg`, `editor-recovered-dark.jpg` and `navigation-target-dark.jpg` (1280 × 720); and `mobile.jpg` (383 × 829 native raster for the requested 390 × 844 viewport). They establish literal recovery/conflict fields, retained failure/stale candidates, both neutral themes, reachable narrow actions, the persistent editor recovery notice, retained assistant/fully rendered real PDF and a destination without a foreign recovery lock. Narrow evidence establishes dialog containment, not a mobile editor.

The initial `data/verification/source-recovery-browser/finish-review.md` requested three material corrections: project/file callback and journal isolation, stale review/navigation locks, and the obsolete reopen instruction. `correction-verdict.md` scores all three resolved and returns `ship` for that scored scope, not the whole surface or application. Its corrected conflict captures direct the user to the live Review file versions action and confirm preserved writing. Supplied `final-full-tests.log` reports (654/654 passing tests) and `final-build.log` records the production/typecheck build. Browser records demonstrate failed autosave with exact Unicode text kept in SQLite through a backend restart, separate-origin draft inspection without application, retained candidate after (503), stale external-change rejection, physical-disk preservation on Use disk version, and a later explicit edited save with earlier source in History. `navigation-audit.json` records editable destination/return states, zero dialogs and the original project's retained draft notice. Reported generations, runs and chats remain zero. The recovered real PDF contains “Reviewed unsaved writing survives restart.” These are supplied results, not checks rerun by the documenter.

The once-only `detector.json` contains one advisory for this dialog's intentional narrow (16px) textarea adaptation; it does not establish computed contrast. The earlier identity audit's then-open startup finding remains a historical scope snapshot; the indexed-file restart repair is documented separately in `docs/verification/disk-recovery.md`. This amendment does not certify complete filesystem watching/import, ordinary external-folder support, full offline acceptance, native packaging, whole-editor mobile behavior, motion, exhaustive accessibility or live providers. No browser, server, detector, implementation test, build or provider was run for this documentation merge. **Not canonized:** incidental compact timestamps/status metadata are not a new type role, and the local narrow-input adaptation is not a new global primitive.

The `EDITOR-WORKFLOW-2026` extension follows the first-body direction and inline QUALITY BAR in `index.html`, current `PRODUCT.md` and the owner-approved local-first/browser-delivery plan. It is recorded from `shared/editor-preferences.ts`, `src/editor-workflow.ts`, `src/components/EditorSettings.tsx`, the scoped settings-select rule in `src/styles.css` and sampled App save/build/status integration. It extends the neutral 简约风 Operate world without a seed, comp, replacement identity or new primitive token. The documenter opened all seven synthetic-origin captures in `.impeccable/review/editor-workflow/`: `desktop.jpg` (1440 × 900); `user-1280.jpg`, `settings-dark.jpg`, `manual-unsaved-light.jpg`, `manual-unsaved-dark.jpg` and `save-failure.jpg` (1280 × 720); and `mobile.jpg` (383 × 829 native raster for the requested 390 × 844 viewport). They show both neutral themes, the named settings group, contained stacked native fields, active Manual Save/status, retained assistant and actual stale PDF, plus retained save-failure choices with reachable retry. The existing settings dialog scrolls normally; the error capture deliberately shows its lower form/actions. It does not have a pinned footer. The failure image predates only the singular-second/explicit-label copy correction, outside its shown error/action region.

The full `data/verification/editor-workflow/finish-review.md` returns `ship` with no material scoped fixes. Its supplied results report (658/658 passing tests), including canceled/replaced idle tasks, destination/lock/dirty eligibility, preference persistence/validation and source/history/compiler neutrality; the final production/typecheck build passes after the copy/aria correction. Preview makes no preference, source or build mutation; a (503) preference-save failure retains Manual/600ms/1000ms choices. Manual mode preserves the exact recovery draft beyond the ordinary debounce. Cmd/Ctrl S, Save, file switch and explicit compilation produce four source saves; explicit compilation starts (17ms) after its save, bypassing the automatic delay. After an owned-backend restart, `automatic-timing.json` records exactly one source save (10012ms) after the first observation of the exact final typed text and one successful confined build (5025ms) later. `timing-raw.json` supplies the accepted first-seen timestamps; the earlier late observer and refreshed journal timestamp are not valid debounce baselines. Cancellation records show Automatic compilation off cancels its pending (5s) build and Manual mode cancels its pending (10s) save while retaining the exact draft. Final state records explicit Save/build, cleared drafts, successful terminal jobs and zero AI generations, runs or chats. These are supplied checks, not tests rerun by the documenter.

The single detector reports (six inherited warnings and 101 advisories); only the local narrow-select (16px) advisory is new, with no new warning from this change. It does not change the global type ramp or certify computed contrast. Keyboard evidence records skipping the disabled autosave-delay field, native-dialog containment on backward navigation and Escape returning to Open settings, without asserting a specific last focusable button. This bounded ship review does not certify complete offline/filesystem behavior, native delivery, a mobile editor, motion, exhaustive accessibility or live providers. No browser, server, detector, implementation test, build or provider was run for this documentation merge. **Not canonized:** inherited tiny source-status/shell metadata is not a reusable type role, and the workflow selects' local narrow adaptation is not a new global primitive.

The `QUICK-NAVIGATION-2026` extension follows the scoped Operate direction contract, current `PRODUCT.md` and the owner's neutral, light-first 简约风 local-editor direction. It is recorded from `src/components/QuickNavigation.tsx`, `quick-navigation.css`, `src/quick-navigation.ts`, the shared `Modal` and targeted shortcut, tab-action, file-navigation and command integration in `src/App.tsx`. It introduces no seed, approved comp, concept roll, replacement identity or global primitive. The documenter opened all seven current captures in `data/verification/quick-navigation/`: `desktop.jpg` and `desktop-dark.jpg` (1440 × 900); `user-1280.jpg`, `save-failure.jpg` and `empty.jpg` (1280 × 720); and `mobile.jpg` and `mobile-dark.jpg` (383 × 829 proportional rasters of the requested 390 × 844 viewport). Their embedded JPEG provenance identifies the built in-app browser and synthetic fixture. They show complete long paths, both neutral themes, bounded commands, retained query/error and empty-state recovery. Narrow evidence establishes this contained picker, not a mobile editor.

The full `data/verification/quick-navigation/finish-review.md` found one material keyboard issue: Chromium could focus the scrolling result list while the query alone handled arrows and Enter. The same reviewer's `finish-verdict.md` scores the explicit negative listbox tab index resolved and returns `ship` for that scored fix only. The follow-up is not a fresh whole-surface or exhaustive accessibility verdict. `keyboard-review-audit.json` records forward Tab avoiding the listbox, Shift+Tab returning to the combobox and Escape restoring focus; forward Tab can enter browser chrome, so no exhaustive focus-loop claim follows. Supplied final checks report (662/662 passing tests) and a passing production/typecheck build after the one-attribute fix. Reported browser checks cover retained source/query after synthetic (503) save failure and retry, external (409) conflict with the draft retained, Unicode and binary paths, read-only switching, existing Save/Compile/Word count/Search actions and (5s) delayed navigation canceled by Escape while the original save completes. These checks were not rerun by the documenter. No live AI request was made; the lock run and its associated local record are synthetic fixtures, not generated assistant work.

The single supplied static detector reports one advisory for the intentional narrow (16px) search field; its degraded result supplies no computed-contrast certification. Arbitrary-folder discovery, a formatter and native packaging remain outside this delivery. The bounded review, still captures and supplied checks do not establish whole-app, complete offline/filesystem, mobile-editor, motion, exhaustive accessibility or live-provider acceptance. No browser/server, detector, implementation test, build or provider call was run for this documentation merge. **Not canonized:** inherited tiny shell/status metadata is not a new type role, and the local narrow search-input floor is not a new global typography token.

The `SOURCE-FORMATTING-2026` extension follows the supplied scoped Operate direction, current `PRODUCT.md` and the owner's neutral, light-first 简约风 writing environment. It is recorded from `src/components/FormatPreviewDialog.tsx`, `format-preview.css`, `SourceToolbar.tsx`, `src/format-preview.ts`, the shared `Modal` and targeted formatter/command integration in `src/App.tsx` and `src/quick-navigation.ts`. This is a narrow existing-surface extension; no new world, concept seed, approved comp or primitive token is introduced. The documenter opened all nine required current captures in `data/verification/formatting-browser/`: `desktop-light.jpg` and `desktop-dark.jpg` (1440 × 900); `mobile-light.jpg` and `mobile-dark.jpg` (383 × 829 native rasters for the requested 390 × 844 viewport); and `changes.jpg`, `tool-error.jpg`, `stale-apply.jpg`, `stopped.jpg` and `no-change.jpg` (997 × 833). Every JPEG embeds provenance naming the visible built-in browser, synthetic project and deterministic test executable. They show missing-tool guidance, both neutral themes, literal changes, focused complete source, retained stale/error context, Stop and no-change disabling. Narrow evidence establishes dialog containment and reachable controls, not a mobile editor.

The fresh full `data/verification/formatting-browser/finish-review.md` returns `ship` with no material scoped fixes. Supplied final checks report (678/678 passing tests) and a passing production build. Parent-reported actual in-app browser checks cover unchanged source/history through preview and source inspection, explicit external-version recovery before Apply, one-event Undo/Redo, saved formatted source and real TeX/BibTeX/PDF compilation, failure/Stop/deadline/no-change behavior, keyboard focus and exact restart without resumed formatter requests. These are reported functional evidence, not tests rerun by the documenter. The successful formatting captures use a deterministic fixture through the actual local sandbox and supervisor; real latexindent is not system-installed. No live-formatter compatibility pass is claimed by this record. Any independently verified standalone-release result belongs in a separate functional addendum and does not widen this visual verdict.

The single supplied static detector degraded to its fallback and reports only the intentional local narrow (16px) complete-source textarea advisory. No second detector ran, and that advisory neither changes the type ramp nor establishes computed contrast. No browser, server, detector, implementation test, build or provider request was run for this documentation merge. No live generation, private paper or owner-port (4317) service was used. The bounded review does not certify whole-feature/backend security, arbitrary formatter compatibility, full offline/filesystem behavior, native delivery, whole-editor mobile layout, motion or exhaustive accessibility. **Not canonized:** the narrow textarea adaptation stays local, and the deterministic formatter's output is verification content rather than a formatting-style standard.

## Colors

The palette uses near-black, white and gray for structure; restrained color carries focus, source syntax and status.

### Primary

- **Inverted action:** the `accent` role gives primary actions a pale fill in dark mode and a dark fill in light mode, with the theme's `bg` as the action text. It also marks active navigation and native checkbox accents.
- **Quiet selected surface:** `accent-dark` supports active files and compact selected controls without introducing a brand hue.

### Neutral

- **Shell ground:** `bg` frames the application.
- **Panel ground:** `panel` grounds dialogs and preview chrome. **Dark dialogs use `dark-panel`; light dialogs use `light-panel`.**
- **Raised surface:** `panel-raised` distinguishes menus and other raised containers.
- **Editing surface:** `editor` grounds source areas and fields. It shares the dark panel value while remaining a separate role; in light mode it is brighter than the panel.
- **Text hierarchy:** `text`, `muted` and `faint` distinguish primary content, supporting information and quiet metadata. Keep full paths readable in the operation review.
- **Structural strokes:** `border` separates panes and rows; `control` is the stronger control/scrollbar tone. `line` is a quiet hover fill, while `selection` supports text/search selection.
- **Paper surround:** `pdf-bg` separates the rendered page from the editor chrome; the page itself is document content.

Focus uses `focus`; success, caution and failure use `positive`, `warning` and `danger`. These are semantic signals, not additional decorative accents. The source also has syntax and revision-diff colors; their specialized contracts remain in the stylesheet rather than being generalized from this file-manager scope.

Writing findings reuse `selection` behind the marked source span, primary text on the mark and a wavy `warning` underline. Supporting excerpts and line/type metadata use `muted`; underlined text actions remain neutral. This introduces no writing-specific color palette.

Chat rows reuse `accent-dark` for selection and `line` for hover. Prompt blocks, quotes, inline code, table headers and fenced-code headers also use `line`; replies use primary text while context and actions use `muted`. Saved failure text uses `danger`. These are applications of the existing theme, not a chat-specific palette.

Saved-chat excerpts reuse `selection` behind the literal match with primary `text` and semibold emphasis. Flat result rules use `border`, hover uses `line`, and helper/count/field/date text uses `muted`. Archived excerpts retain normal legibility while their opening button is disabled; restoration remains a separate named action. The matched transcript article uses `line` and a thin `control` outline, with `focus` for keyboard focus. Search errors reuse `danger`; no search-specific palette is introduced.

Unsent chat-draft status uses `muted`; load/save/conflict problems use `danger` with explicit text and an underlined `accent` recovery action. Competing versions reuse the shared `panel` dialog and `editor` fields; Save my draft is the existing inverted primary action. No draft-specific palette or elevation is introduced.

Table cells reuse `selection` and an inset `focus` outline for selection; numbered headers and compact structure actions use `panel-raised`, and explanatory/selection text uses `muted`. Source disclosures use `bg`. Draft diffs reuse the existing paired `diff-add-*` and `diff-remove-*` CSS variables, reinforced by visible plus/minus prefixes. These specialized revision colors remain in the stylesheet rather than becoming a table-specific palette.

Clipboard review reuses `panel` for the dialog and opaque footer, `control` for the content/table boundaries and `bg` with `muted` for source disclosures. Native format radios use `text` as their accent. Conversion-loss lists use `warning`, while failed paste/stale-source alerts use `danger`; package requirements retain the existing supporting-copy treatment. Read-only is explained in text alongside disabled actions. No clipboard-specific palette is introduced.

Comments reuse primary text for messages and muted text for locations, dates, notices and secondary actions. Original passages and current-saved conflict bodies sit on `bg`; message separators use `border`, while list hover uses `panel-raised`. Source passages receive a dotted `focus` underline and the gutter marker uses the same focus tone. Errors use `danger`; changed/removed passage and read-only states are explained in text. No comment-specific palette or author color is introduced.

Tracking reuses `control` for the active Comments/Changes choice and native scope/file fields, `panel` for the opaque confirmation ground and `bg` for complete source disclosures. Inserted source has a double `focus` underline; removed source uses a line-through and an explicit Removed label, with a compact neutral Deletion widget at the source location. Read-only and stale states are explained in text rather than author colors or a new revision palette.

History reuses `selection` for selected timeline/file/thread rows, `control` for the active Source comparison/Saved review choice, `bg` for saved source disclosures and `panel` for the opaque restore plan and its sticky action strip. Fine `border` rules separate messages and regions; `muted` carries availability/count/state context and `danger` marks failed or stale recovery. Availability stays explicit as With review or Source only text rather than a color-only signal. No history-specific palette is introduced.

Milestone labels reuse `control` and `text` for the pressed All history/Labels choice, `editor` for native search/name fields and `border` for flat label-row separators. Full names use primary text; timeline previews, field labels, saved dates and Removed labels use `muted`. Stale and ambiguous-response feedback uses the existing `danger` alert treatment with explanatory text and named recovery actions. Labels introduce no category colors, pills or new palette.

Templates reuse `control` for pressed collection/preview choices, `selection` for the active list row, `editor` for native fields and `bg` for literal source and build-log wells. Fine `border` rules divide catalog panes, snapshot rows and opaque action footers. Primary names/source use `text`; descriptions, file kinds/counts and lock notices use `muted`; failures use `danger` with a focused text alert. The existing PDF reader retains `pdf-bg` around the author's paper. Templates introduce no category colors or palette.

Library organization keeps the same neutral action and surface roles: `selection` marks chosen project rows and tag navigation; `control` marks pressed selection/tag-operation choices and outlines the tag dots; `text` and `muted` keep project and tag names readable. Nine presets and custom HEX colors belong only to small user-chosen tag markers beside names, not to the brand palette or text color. The markers are decorative to assistive technology; readable labels, accessible names and pressed/selected state carry meaning. Archive, Trash, busy and download status remain explicit text, with failures using `danger`.

Compile tools reuse `panel` for opaque modal/context/action grounds, `editor` for native fields and literal generated text, `selection` for the inspected row and row/action hover, and fine `border` rules for pane/row separation. Build identity, status, selected counts and explanations use the existing `text`/`muted` hierarchy; errors and erroneous-PDF notices use `danger` with explicit wording. Native output/source/replacement checkboxes use `accent`. There is no new build palette.

Replacement-preview recovery reuses `text` and `muted` for named state/build identity, `danger` for uncertain/error feedback, `control` for inline Stop/Retry borders, `border` for the action divider and `pdf-bg` for the separate result surface. Start typing retains the existing inverted primary action. Progress, stopping, stopped and earlier-result states remain explicit text; no preview-specific palette is introduced.

The frontmatter records theme values as `dark-*` and `light-*` because the portable token schema has no theme switch. At runtime, use the existing unprefixed CSS custom properties: the base `:root` declarations supply dark values and `:root[data-theme="light"]` supplies light values. The page now starts with the light attribute, and the settings/App fallbacks are light. Saved light/dark/system values govern the resolved theme. Historical component-token examples retain their dark references; live CSS variables select the actual theme, so those references do not define the fresh-install default.

**The Neutral Actions Rule.** Keep primary operations neutral and inverted; use semantic color to explain state rather than recolor the entire review surface.

**The Saved Theme Rule.** Start fresh preferences in the existing light theme; preserve an explicit light, dark or system choice and resolve system through the operating system.

Source-formatting review reuses `panel`, `editor`, `text`, `muted`, `border`, `accent-dark`, `danger` and the existing focus treatment in both themes. Literal additions/removals reuse the specialized revision-diff variables and visible plus/minus prefixes; selected views use the quiet neutral selected surface. Missing-tool and stopped/no-change states explain availability in words rather than introducing another status palette.

## Typography

**Interface Font:** Inter with the platform sans-serif fallbacks recorded above. This is the declared stack; it does not imply that a bundled Inter font is available on every machine.

**Code Font:** SFMono-Regular, Consolas and monospace for reference diffs and chat source/plain text. Source-editor typography is configurable and is not fixed by these tool tokens. Document content and PDF typography follow the author's document; locally rendered chat math uses KaTeX's bundled math faces.

The interface uses a compact utility hierarchy rather than a marketing display scale. Modal titles use `title`; descriptions and path-review rows use `body`; field labels, file navigation and secondary actions use `label`; primary actions use `action`. Upload target names use medium weight (500) with status beneath them at the smaller label size and a line-height of (1.5). Move-dialog introductions are slightly larger (13px) with a line-height of (1.6).

The writing panel uses the existing body size and line-height (12px / 1.6), with line/type metadata and the collapsed help summary at (11px). Its fields retain the shared field-label treatment. Incumbent `.field-help` text is (10px / 1.7); this is existing supporting-copy styling, not a new general body-size recommendation.

Chat replies use `reply`, with a reading measure capped at (75ch). Markdown headings share `reply-title`, keeping content hierarchy within the tool rather than adding a display scale. Prompts retain `body`; provider/status, source context, paging and copy controls use `label`. Fenced source uses `chat-code`; plain text uses the same family and size with the reply line-height. Saved-chat titles use `label`; the incumbent date/turn-count metadata remains (9px) and is not a new general metadata recommendation.

Search-result titles use medium body text (12px / 500); literal snippets use body size with a reading line-height (1.65). Match text uses semibold emphasis (600); field/date metadata and count/recovery actions use the existing label size (11px). The native search input intentionally steps to (16px) at its local (700px) breakpoint. Preserve this narrow-input legibility adaptation without expanding the global compact type ramp.

Chat-draft status uses the compact label size (11px / 1.6), with recovery actions at (12px). Comparison copy, ordinary field labels and literal draft fields use the interface body size (12px / 1.6), beneath the existing modal title. At the local comparison breakpoint (700px), read-only draft textareas intentionally use (16px). This legibility adaptation does not change the global compact type ramp.

Table cell content and cell/caption editing use the existing monospace family at the tool body size (12px); the editable textarea and source disclosures use a line-height of (1.6). Numbered grid headers retain the compact label size (11px) and medium weight (500). Grid coordinates and selection use tabular numerals. This is literal LaTeX source, while widths and typeset appearance are explained as compiled-PDF behavior. It introduces no display face or new general type scale.

Clipboard review uses the existing tool body size (12px). Its projected content and warning lists use a line-height of (1.7); preview headings are compact semibold content headings (16px / 600), while preview code and source disclosures use the incumbent monospace family at (12px). Source disclosures retain the insertion-tool line-height (1.6). Package/image setup notes use the existing small supporting-copy style, not a new type role. The projection can expose literal LaTeX for unsupported source; it is content inspection rather than a compiled-PDF preview.

Avoid promoting the incumbent tiny, tracked shell metadata into a general heading or label system. The file-manager extension uses sentence-case titles and direct operation labels. Long paths wrap in review lists; compact sidebar filenames truncate with ellipsis.

Comments reuse `reply` for plain message prose and native textarea content. The thread/new-comment heading uses the existing compact content-heading treatment (14px / 600); the panel heading is (12px / 600). Locations, field labels, dates, Updated and secondary message actions use `label`. Original source quotes reuse `code`; they wrap with preserved whitespace. Saved-versus-draft comparison labels remain ordinary compact bold text. There is no comment display scale or decorated author identity.

Tracking uses `body` for notices and confirmation copy, `label` for mode/navigation, selection, source summaries and compact actions, and a compact confirmation heading (12px). Complete removed/added source uses the configurable editor font at (12px / 1.6), retaining whitespace and wrapping long source; it is not fixed to the interface or chat-code face.

History uses the existing compact tool body (12px / 1.6), compact controls and saved-review labels (11px), and a local restore heading (14px). Saved passages and pending removed/added source use literal monospace (12px / 1.6), with preserved whitespace and wrapping. The timeline retains incumbent (9px) date/kind/availability metadata; that inherited small text is not a new general metadata recommendation.

Milestone names and recovery copy use the tool body (12px / 1.6); field labels, row actions, timeline label previews and the saved-version date reuse `label`. The selected version name and Labels heading use a compact local heading (14px), with the saved date immediately below the name. All history/Labels controls use the body size; desktop search inherits its field label size. At the existing history breakpoint (760px), search and label-name inputs deliberately step to (16px). This is the local mobile-input legibility floor, not an expansion of the global compact type ramp; retain it even though the static detector flags the off-ramp size. The inherited timeline (9px) metadata remains outside new type guidance.

Template names in the list use compact semibold body text (12px / 600 / 1.5), with description and category/file count at the label size (11px / 1.6). The selected detail name is a local subordinate heading (16px / 1.5), while Source snapshot uses the existing compact heading size (14px). Dialog introductions, details and alerts retain body (12px / 1.6); source uses monospace (12px / 1.65), and bounded build logs use monospace (11px / 1.6). Those two template rules use the generic monospace fallback through `--font-code`; Save identity fields use the generic sans-serif fallback through `--font-ui`. Neither variable is defined by the current theme, so these are not evidence of a new bundled font. At the template breakpoint (760px), search, file/entry/engine selects and editable template fields step to (16px) for native-input legibility. This is a local accessibility adaptation, not a new display scale; PDF typography remains document content.

Library project/tag controls and review prose reuse body (12px), compact tag names/counts/archive labels reuse label (11px), and review names use medium weight (500) with line-height (1.6). Tag/action section headings and prepared-download status use the existing compact heading (14px / 600). The incumbent library heading remains its local (17px / 550 / 1.4) role. At (760px), library edit inputs intentionally use (16px); retain this native-input legibility floor without making it a new general type scale. Long tag names wrap in review lists; compact navigation/tag links truncate with a title or accessible name, and native single-line input scrolling preserves editing access.

Build dialogs use the existing tool body (12px / 1.6) for explanations and field labels, label size (11px) for selected counts, sizes and preview notices, compact semibold headings (14px / 600) for file/review/status names, and literal generated text at `code` (12px / 1.65). Option/build selects and file search declare `var(--font-ui, sans-serif)`; the current theme does not define that variable, so the generic sans-serif fallback applies. At (760px), these native fields intentionally use (16px), preserving the local input-legibility floor rather than changing the global type ramp. PDF type remains the author's document.

Replacement-preview status uses the tool body (12px / 1.6), with build identity at label size (11px). Actual replacement source retains monospace (12px / 1.7); failure logs use a local readable monospace treatment (11px / 1.6), preserving whitespace and wrapping long output. At the local (760px) breakpoint, replacement and suggestion textareas intentionally use (16px). Preserve those two native-input adaptations without turning them into new global typography tokens; compiled paper remains document content.

Source recovery retains the existing modal title and compact body/field labels. Literal disk and candidate text use the existing code treatment (12px / 1.65), with preserved whitespace, native text selection and vertical resizing. At its local (640px) threshold both textareas deliberately use (16px) for narrow native-input legibility. Keep that adaptation local; incidental date/status metadata does not define a reusable type role.

Source-formatting review retains the native modal title and compact body (12px), with the resolved tool name at semibold weight (600). Paths, status and inline errors use the same body size and wrap anywhere. Literal diff, full source and formatter logs use the incumbent code face (12px / 1.65). Only the read-only complete-source textarea steps to (16px) below the local (560px) threshold; this narrow-input adaptation introduces no global type role.

## Layout

The incumbent desktop workspace has a header, a compact left file sidebar and adjacent source/PDF panes. Pane dividers, not oversized gutters, organize the writing area. Editing and preview containers have gently rounded edges; toolbars are dense and horizontally aligned.

The base dialog is centered, padded with the `dialog` spacing token, limited to (85vh) and constrained to the viewport minus (40px). Its ordinary width is (460px); the wide reference-review variant is (850px). File-batch dialogs request the frontmatter's batch width; the shared maximum-width constraint still applies. Keep the heading and close action together, then context, fields/review content and footer actions.

Upload choice controls wrap inside a centered dashed drop region. Summary controls also wrap. Batch lists scroll independently at a maximum of `min(300px, 32vh)`; move paths use a two-column source/destination grid with an arrow between them. Review paths can break anywhere. Trash and restore use the same path-list vocabulary. Review footers are sticky within the modal with a panel-colored ground, so scrolled content does not compete with the action.

At the captured desktop (1440 × 1000), user-sized (997 × 833) and configured narrow (560 × 850) viewports, the upload and restore dialogs fit the available width. This extension does not redesign the editor behind them: below (800px), the incumbent shell keeps a minimum width (650px), and the workbench keeps a minimum width (520px). Preserve that documented scope boundary; these captures do not establish a fully mobile editor.

The existing shell also has density adjustments below (1050px) and above (1500px). These belong to the incumbent editor, not a newly invented dialog breakpoint system.

Writing checks requests a (760px) centered dialog and inherits the shared viewport and height limits, padding, backdrop and native scrolling. Dictionary selection and the independent LaTeX checkbox use a two-column layout, followed by a wrapping active-file/exclusion row and adjacent tool tabs. Below (600px), the options stack and the findings maximum reduces from `min(360px, 38vh)` to (30vh). The findings and personal-word lists have their own vertical scroll regions; personal words are limited to (220px) high. Status, retry, filter and text-action groups wrap, and paths/excerpts can break anywhere. Native outer-dialog scrolling keeps lower narrow actions reachable. The editor behind the dialog retains its incumbent (650px) minimum width; these captures establish a bounded writing tool, not a fully mobile editor.

Chats use the existing left sidebar: the Search chats field, saved-message/project scope and archive/refresh controls precede a separately scrolling list. Named rows wrap their titles and reserve inline space for compact rename/archive actions. The assistant header truncates a long active title while its expand, browse and new controls retain their space. History count and Earlier/Newer controls form a nonshrinking, wrapping strip above the independently scrolling transcript; a search jump adds Return to latest within that same strip. The ordinary Latest messages control remains available when reading away from the bottom outside a search/history view. Internal transcript scrolling is the intended reading topology. Turns are separated by rules and the standard spacing rhythm, not repeated elevated cards.

Search snippets occupy flat full-width rows within the existing list padding. Each row uses a fine bottom rule, vertical separation (3px) and an opening target padded (10px 7px) with the existing small row radius. Titles, metadata and whitespace-preserving snippets wrap anywhere rather than widening the sidebar. More matches and Restore & open match remain named underlined actions. The narrow captures show the complete restoration label and composer within the (185px) sidebar/editor panes; the search input adapts at (700px), while the inherited desktop shell boundary remains unchanged.

Chat content wraps prose and source paths; tables, fenced code and display math scroll within their own bounds. The saved transcript introduces no new breakpoint. The narrow capture establishes chat-pane containment within the incumbent shell; the shell's (650px) minimum width and horizontal clipping remain. It does not establish a responsive mobile editor.

Unsent chat-draft status sits directly between the prompt field and model controls. Its baseline-aligned row wraps text/actions with a gap (8px), small vertical padding (3px above / 5px below) and anywhere wrapping. An empty, nonproblem state retains an accessible description without a visible row or reserved layout space. Conflict comparison uses the ordinary shared modal width/padding, with a column layout, hidden outer overflow and maximum height `min(760px, calc(100dvh - 32px))`. The heading/Close and wrapping action footer do not shrink; only the minimum-height-zero body scrolls. Two labeled, read-only, vertically resizable textareas have a (110px) minimum height. Keep reviewing, Use saved draft and Save my draft remain outside body scrolling, separated by (8px) with a (20px) top margin. At (700px), the draft fields use the local (16px) floor; this is bounded comparison containment within the existing editor shell.

Existing-table editing reuses the wide shared dialog (850px) and viewport/height constraints. Its heading is a separate bordered strip; the inner tool scrolls within `calc(85vh - 86px)` with horizontal padding (24px) and bottom padding (20px). The schematic grid has its own two-axis scroll region capped at (280px), with a stronger control border and no forced cell compression. Numbered rows/columns and the current selection precede wrapping selection actions and native row/column selects. Column settings wrap as groups with a basis of (180px); no new table breakpoint is introduced.

The local cell/caption textarea appears below those controls and can resize vertically. Source disclosures follow notices/errors, each with bounded scrolling content (260px maximum). The footer remains sticky within the inner scroll region, uses an opaque panel ground and a fine top rule, and wraps its copy/recovery group and primary Apply action. Scroll padding and the error's scroll margin reserve room around that footer. Keep complete draft recovery and the final action reachable when content grows or a narrow error wraps; retain the existing desktop shell boundary.

Clipboard review reuses the wide shared dialog (850px), with its heading/Close strip outside the independently scrolling body. The inner body is bounded by `calc(85vh - 86px)`, uses horizontal padding (24px), bottom padding (20px) and scroll padding (16px above / 90px below). Native format choices wrap with row/column gaps (12px / 20px). The projected content scrolls at a maximum height (270px), and generated/selected-source disclosures scroll at (220px). Preserve the stronger content border and wrapping source rather than letting long content widen the dialog.

The clipboard footer wraps its recovery group and inverted action over an opaque panel ground and top rule, remaining sticky inside the body. Image previews contain the local bitmap within a maximum height (220px). Image fields wrap with a basis (180px) and gap (16px); the nested upload review keeps the existing full-width Destination field and flat path list. There is no new clipboard breakpoint. Narrow captures establish contained dialogs and reachable choices/footer inside the existing desktop shell, not a responsive mobile editor.

Comments occupy the existing left sidebar under Review, alongside Files and Chats. The fixed panel-heading row contains refresh/add icon controls; notices and errors precede the independently scrolling body. The body has standard padding (12px) and scroll padding (44px above / 16px below). In a thread, All comments stays sticky at the top (−12px) on an opaque panel ground with a fine bottom rule. The Reply form stays sticky at the end of the thread (bottom −12px), with matching ground, a fine top rule and vertical padding (12px). Preserve both return and posting access as the message column grows. The unrelated sidebar footer is hidden while Review is active.

The comments list uses wrapping native status/scope selects and flat, full-width rows; summaries are bounded to (50 per page) with a wrapping paging strip. Thread paths and plain message bodies break anywhere when necessary. Original-quote and saved-conflict bodies scroll at a maximum (160px); textareas resize vertically between (78px) and (300px). Source underlines merge overlapping ranges rather than stacking decorations. No comments breakpoint is introduced: narrow captures retain the desktop shell's horizontal overflow and do not establish mobile-editor behavior.

Source review adds no breakpoint. Editing/Reviewing sits beside Code/Visual as a native compact select, capped at (105px). Review has a separate Comments/Changes row with compact rounded choices above the existing panel heading. Changes keeps an independently scrolling body with standard padding (12px) and scroll padding (16px). Scope and optional file selects fill the sidebar width; selection controls stack, action groups wrap and paths break anywhere. Passage articles are flat and rule-separated with vertical padding (14px).

Removed and Added are initially open native disclosures. Their complete, focusable source bodies wrap and scroll at a maximum height (180px), keeping large passages inspectable without widening the sidebar. Confirmation stays inline in that same body, sticky at top (−12px), on an opaque panel ground with fine horizontal rules and vertical padding (12px). Preserve reachable Confirm Accept/Reject and Cancel as the author scrolls; this is a sidebar decision, not a new modal or raised card. Narrow captures retain the incumbent desktop shell's horizontal overflow.

History reuses the wide native modal (850px), now arranged as a bounded column at `min(850px, 85vh)` high with hidden outer overflow. Its heading/Close strip does not shrink or scroll; it uses padding (18px 24px) and a bottom rule. The inner workspace has padding (0 24px 20px); introduction and future-capture choice remain outside the independently scrolling timeline/comparison grid. Desktop retains a timeline column (210px) and gap (18px), with separate timeline and comparison scrolling. At the existing history breakpoint (760px), the grid stacks: timeline occupies a bounded (90–120px) row and comparison takes the remaining height. This is dialog containment within the incumbent shell, not a new mobile editor layout.

History file summaries scroll at (120px maximum), saved-thread summaries at (200px), plain saved message bodies at (240px), and saved passage/pending source disclosures at (200px). Long paths and messages wrap rather than widening the modal. The restore plan is inline and sticky at the comparison bottom on an opaque panel ground, with a top rule, padding (14px 0 0) and its own maximum height `min(50vh, calc(100% - 12px))`. Confirm/Cancel form a wrapping sticky bottom strip within that plan. Keep the heading and final choices reachable while source, discussion or a long legacy notice scrolls. Comparison and plan use scroll padding (12px); preparing a plan scrolls it into view and focuses it without scrolling the whole page. Standalone errors are focused and bounded (100px); confirmation errors remain beside the plan's actions. Shared native dialog focus return and keyboard control behavior remain authoritative.

History view/search wraps above the bounded timeline/comparison grid, with gaps (12px / 20px) and a bottom margin (12px); search grows from a minimum (140px). The selected version's name/date precede its label manager inside the scrolling comparison. That manager is flat, with fine block rules and vertical padding (12px). Active and removed lists each scroll at a maximum (180px); full names break anywhere and compact action groups keep their inline space. Add/Rename uses a wrapping field/action row. At (760px), navigation gaps reduce to (8px), each name takes a full row before its actions, and the two input types use the local (16px) floor. Deliberate scroll positions can focus the field or recovery message while the dialog heading/Close stays fixed. No new breakpoint or mobile editor shell is introduced.

The template catalog reuses the native wide modal with a specific bounded frame: width `min(1080px, calc(100vw - 40px))`, height `min(900px, 90vh)`, zero outer padding and hidden outer overflow; the shared modal maximum (85vh) still caps its effective height. Heading/Close is a nonshrinking strip with padding (18px 24px) and a fine bottom rule. Introduction and wrapping collection/search/refresh controls stay above a flexible, separately scrolling list/detail region. The desktop list is (230px) wide, with a (20px) gap and a fine end divider; both regions use minimum height zero, and long names/descriptions/paths wrap. The project settings and Create/Cancel form a nonshrinking, wrapping footer below a top rule, with padding (14px 24px 18px). Project name grows more than the native Main document and Compiler fields. Keep creation and its source-lock explanation reachable while detail content scrolls.

At (760px), the catalog stacks into one column: the list takes a bounded (70–100px) row above the flexible detail, the end divider becomes a bottom rule and list descriptions hide while names and file/category metadata remain. Project name and creation actions each take a full row; controls wrap. This contained tool adapts within the incumbent desktop shell, whose (650px) minimum width/horizontal pan remains. The narrow detail source is below its internal scroll position, not omitted; these captures do not establish a mobile editor.

Literal template source is a native read-only, vertically resizable textarea, initially (260px) high and bounded between (160px) and (450px); whitespace is preserved and long lines scroll inside it. The existing PDF reader occupies a bounded (330px) region with a (200px) minimum. Build logs have an independently scrolling (180px) maximum. Catalog errors scroll at a (100px) maximum and receive programmatic focus.

Save as template uses the existing wide modal width with height `min(820px, 90vh)`, zero outer padding and hidden overflow, still capped by the shared (85vh) maximum. Its nonshrinking heading/Close and introduction precede a flexible form: only the body scrolls, with padding (0 24px 12px), while Save/Cancel remains outside that scroll region on an opaque, bordered footer with padding (14px 24px 18px). The source-snapshot list is a flat, independently scrolling region capped at (220px); file paths wrap, kind/byte metadata retains its inline space and rows wrap at (760px). Description fields resize vertically between (70px) and (160px). Keep the current fixed-footer topology rather than restoring the superseded clipped narrow layout.

The library home retains its own contained layout: sidebar navigation beside a bordered project collection with an independently scrolling list/grid. Its home shell permits minimum width zero; the editor's separate (650px) minimum is unchanged. A wrapping native selection strip sits above the collection, names the visible selection and offers only applicable Archive/Unarchive actions. List rows preserve their fine separators; grid items preserve saved-PDF thumbnails or the existing paper placeholder, with selection checkboxes in the top corner. Selection uses the same quiet fill in either view. Tag navigation scrolls separately while bottom utility controls retain their space.

Library reviews reuse the native wide modal (850px), with height `min(850px, 85vh)`, zero outer padding and hidden outer overflow. The fixed heading/Close strip has padding (18px 24px) and a bottom rule. Focused errors, status and ambiguous-response recovery sit outside the flexible body; errors have a scrolling maximum (100px). Only the body scrolls, with padding (14px 24px 18px); the fixed wrapping action footer uses the same padding and a top rule. Exact target names wrap, with archive/return context alongside; a failed preflight retains the captured selected names without pretending they were reviewed. Keep preparation, confirmation, Refresh and Close/Cancel reachable as content grows.

Tag colors use a wrapping preset strip followed by native Color picker, HEX and grouped equal RGB fields. At (760px), Color picker and HEX occupy two columns and RGB takes a full-width row; target rows wrap names above state, and edit inputs step to (16px). At the home breakpoint (600px), the existing sidebar collapses to icons/markers with accessible names and titles, library controls wrap, long tag headings break across lines, selection spacing reduces and project identity takes its own row. Existing home adjustments at (1100px) and (900px) retain their sidebar/toolbar/grid behavior. These establish library and dialog reflow, not a redesigned mobile editor.

Compile options reuse the native modal at requested width (550px), zero outer padding and hidden outer overflow; the shared maximum width `calc(100vw - 40px)` and height (85vh) still apply. The nonshrinking heading/Close strip has padding (18px 24px), with a bottom rule. Its body has padding (14px 24px), a (60vh) maximum and internal scrolling; the ruled wrapping action footer has padding (14px 24px 18px).

The runtime selector sits above Compile mode and Error handling inside that same scrolling body. Installation paths break anywhere, and the underlined Refresh runtimes action remains visibly named. During assistant ownership, persistent read-only guidance sits outside the body scroller beneath the heading; native option fields and Save are disabled, while metadata refresh remains available. Keep heading, lock/error context and footer from shrinking as the runtime explanation grows. Runtime metadata wraps in the existing compact PDF notice, log context and generated-build context; this adds no breakpoint, elevation or shell reflow.

Generated files and Review build ZIP reuse the wide native modal at (850px), height `min(850px, 85vh)`, zero outer padding and hidden outer overflow. The fixed heading and build context precede a flexible minimum-height-zero content region; focused error and prepared/requested status strips do not shrink. Desktop file selection and inspection use `minmax(220px, 2fr) minmax(0, 3fr)`. The selection pane keeps a nonshrinking search/Select all/Clear/count header above a separate flexible row scroller. The inspection pane scrolls independently; its nonresizable read-only textarea has a (140px) minimum and preserved literal whitespace. The source-snapshot choice and wrapping final actions stay outside these scroll regions. Review ZIP replaces the two-pane region with a scrolling entry/replacement review, retaining build identity, status and preparation/change/close actions.

At (760px), selection and inspection stack as two `minmax(140px, 1fr)` rows; the inspection divider moves from the side to the top, context spacing tightens, search/selection controls stay above the row scroller, and native field text uses the intentional (16px) floor. The generated-files modal maximum width becomes `calc(100vw - 32px)`. Long build context, paths and review entries wrap. Errors scroll at a (100px) maximum. These contained dialogs coexist with the inherited horizontally panning desktop editor.

Replacement preview reuses the wide native dialog (850px) and shared viewport/height limits, with a flex-column frame and hidden outer overflow. Heading/Close, introduction and wrapping Compile preview / Discard / Start typing footer do not shrink; only the minimum-height-zero body scrolls, with small inset padding (2px 3px 6px). Inline build status precedes a two-column replacement/PDF grid with an (18px) gap. The replacement textarea retains a (240px) minimum; suggestions retain (70px). The separate PDF/result region is bordered, independently scrollable and (50vh) high, with a (350px) desktop minimum. Its notices do not shrink; failure logs wrap inside the result region.

At (760px), the replacement/PDF columns stack within that scrolling body, modal padding becomes (18px), textareas use the local (16px) floor and the PDF/result minimum reduces to (300px). The footer wraps with an (8px) gap and flexible buttons, retaining its top rule and reachable final actions. Status wraps with row/column gaps (8px / 14px), and text can break anywhere; named Stop/Retry remain beside the status when space permits. These changes contain this dialog within the existing desktop editor; they do not establish a mobile editor shell.

Diagnostic request review reuses the shared native prompt-comparison modal: requested width (460px), maximum width `calc(100vw - 40px)`, padding (26px), and a flex-column frame capped at `min(760px, calc(100dvh - 32px))`. Heading/Close and the wrapping action footer do not shrink; only the minimum-height-zero body scrolls. Source paths break anywhere above two full-width, read-only, vertically resizable textareas with a minimum height (110px). Fields retain (12px / 1.6) text, adapting locally to (16px) at the existing (700px) narrow threshold. The footer right-aligns with an (8px) gap and top margin (20px); its named choices wrap without clipping. Inline preparation/recovery wraps its target and actions inside Logs, with vertical margin (12px) and a (12px) action gap. Long diagnostic source labels use full-width, minimum-width-zero targets with normal whitespace and anywhere wrapping. These changes add no breakpoint or editor-shell reflow.

The Leaf library retains its own responsive navigation: at the existing (900px) threshold the toolbar wraps and the sidebar narrows; at (600px), the sidebar becomes a compact (60px) icon rail and the visual brand becomes l. Library rows and controls reflow within the narrow view. These home/settings captures do not remove the editor's inherited (650px) minimum or establish a mobile editing workspace.

Source recovery reuses the wide native modal (850px), shared viewport maximum `calc(100vw - 40px)`, maximum height (85vh), padding and restrained depth. The outer flex-column frame hides overflow; the minimum-height-zero comparison grid scrolls, while the introduction and wrapping action footer do not shrink. Desktop fields are two equal minimum-width-zero columns with a (16px) gap; each textarea is (32vh) high with a (230px) minimum. At the local (640px) threshold, fields stack, use a (150px) minimum and (22vh) height, and footer actions left-align with a minimum height (36px). The footer wraps with an (8px) gap and top padding (20px), keeping download, refresh, later and both version decisions reachable. The editor notice wraps within its panel with a fine bottom rule, padding (8px 14px) and an (8px) gap; source text takes the flexible space and actions keep their width. This contains recovery inside the inherited editor shell rather than changing its mobile layout.

Quick navigation requests a (620px) native modal, retains the shared viewport width minus (40px), padding, radius and overlay depth, and caps its flex-column frame at `min(680px, 85vh)`. The outer frame hides overflow; only the minimum-height-zero results region scrolls between fine top/bottom rules. Heading/Close, project context, labeled query, count/recovery summary and keyboard hint remain outside that region. Rows use (10px 8px) padding and a (12px) gap; complete labels and paths wrap anywhere. At the existing local (560px) threshold, rows become icon/text columns and shortcut badges move beneath the text; the query explicitly uses the local (16px) input floor. The tab action group is nonshrinking and sticky at the right edge of the horizontally scrolling tab strip, with a panel-colored ground and (8px) left inset, retaining Open a file, Command palette and Find beside overflowing tabs. These are local containment rules, not an editor-shell redesign.

Source formatting reuses the wide native dialog (850px), shared viewport width minus (40px), maximum height (85vh), padding, corners and restrained depth. Its outer flex-column frame hides overflow; only the minimum-height-zero body scrolls. The heading/Close, named source, default-indentation policy, retained Apply error/read-only guidance and wrapping footer remain outside that body. The tool row has fine top/bottom rules, vertical padding (12px) and a (16px) gap; the resolved executable path wraps rather than widening the dialog. Below (560px), that row wraps. View choices wrap with a (4px) gap and (7px 10px) button padding. Complete-source fields fill their column, resize vertically and have a (260px) minimum height. The footer right-aligns and wraps with an (8px) gap, fine top rule, top margin (12px) and top padding (16px); Close, Preview/Run again/Stop and Apply remain reachable as source grows. These local containment rules preserve the inherited editor shell.

## Elevation & Depth

Flat tonal layers and thin borders provide most of the structure. Real elevation is reserved for overlays and paper, rather than repeated cards inside the file workflow. Dialogs and menus use the shared overlay shadow; the PDF page has a smaller paper shadow. Exact shadow and backdrop values are in the sidecar because they are outside the frontmatter schema.

Native modal backdrops dim the editor, preserving recognizable context while giving the operation priority. Dialog grounds remain opaque. Light mode has a gentler shadow, while dark mode relies more heavily on the panel boundary and backdrop.

## Shapes

The form language uses restrained curves: small rows and utility controls, medium field and action corners, softly rounded editor panes, and a larger shared dialog corner. Use the frontmatter's existing radius roles for tool controls and dialogs. The incumbent library keeps its pill-shaped search, import/new-project controls and view switch; those home patterns do not redefine review-dialog controls. Borders are generally thin (1px); the upload area uses a dashed border to identify its drop affordance.

Lucide icons use a consistent outline vocabulary. File and folder markers are commonly (14px); progress icons are (15px), the close icon is (19px), and the upload-region icon is (22px). Preserve native selection controls rather than replacing them with decorative glyphs.

The table grid keeps square, collapsed cell boundaries inside the shared rounded dialog. Selected cells use an inset focus stroke, while the cell buttons remain borderless and square. Compact table actions reuse the small radius; full-width native fields retain the existing field corners. The grid is a source-editing tool, so its cell boundaries are independent of the author's chosen PDF border preset.

Library tag markers are small circles with a thin control-colored outline: the recurring name marker is (10px), and color presets enlarge it to (16px) inside compact (30px) buttons. These are user metadata beside names, not colored pills or a replacement icon system.

## Components

### Leaf Identity and Appearance

The identity is compact application navigation, using the existing interface font and neutral theme roles. `LeafMark` renders the genuine Lucide Leaf outline with stroke width (1.6), ordinarily (27px) beside the brand and (18px) in the sidebar signature. The lowercase leaf wordmark and terminal dot retain the incumbent medium weight and tight spacing; the editor wordmark is (28px) and the library uses its existing (26px), then (23px) treatment. These local brand values do not expand the global type ramp.

Library navigation uses the accessible Leaf home link; editor branding remains the Back to projects button with the existing hover/focus behavior. The narrow library substitutes l. at its existing (600px) threshold; the local workspace avatar uses L. Settings is titled Make Leaf yours and retains Appearance, Editor and Connections, including native Dark/Light/System choices. The assistant composer, Review Edits, Manual Type, model/scope controls, all five API-provider connections and Codex CLI/Claude Code controls remain part of the delivered UI.

**The Compatible Identity Rule.** Name the current product Leaf while preserving original-source names, saved preferences, data and integration identifiers and existing assistant controls; a visible brand change does not authorize a namespace migration.

### Buttons

Primary actions are compact, filled and explicit. They use the primary token, a thin transparent border and medium-bold text. Hover mixes the accent with white (10%) while retaining inverted text. Buttons and icon links transition background and color over (0.15s). Disabled buttons reduce opacity to (0.4).

Subtle buttons use a border and restrained padding. Footer alternatives are plain muted text with padding; upload choice buttons are bordered, labeled controls inside the drop area. Icon buttons are square, use a quiet foreground and gain the `line` fill on hover. File-toolbar icon buttons have a smaller incumbent size (23px) than the general icon-button token.

Buttons and links receive a focus-visible outline (2px) with an offset (3px). Keep their accessible names when an icon stands alone.

### Inputs / Fields

Fields use the editing-surface ground, primary text, a thin border and the shared control radius. **Destination is a native select styled with the same full-width text-field pattern as other dialog fields**, including the frontmatter's text-input padding. Its current captured/computed height is (40px); the stylesheet derives this from native control metrics and padding rather than declaring a fixed height.

Labels stay above the field. Inputs, selects and textareas receive a focus outline (1px) with no offset. Placeholder text uses the muted role. Preserve native select arrows and keyboard behavior. In-progress operations disable the relevant fields and actions, with operation text or a spinner explaining the state.

### Navigation / File Rows

Sidebar tabs use compact text and an active underline (2px). File rows use the row radius and height; hover uses `line`, the active file uses `accent-dark` plus `accent`, and batch-picked files use `line` plus primary text. Selection tools wrap and show a selected count. Drop targets add an inset neutral outline and selected-surface fill.

Row actions appear on hover **and focus within**. Keep file/folder icons, filename text and selection checkboxes aligned. Sidebar ellipsis is appropriate for navigation; reviewed operation paths must remain discoverable through wrapping rather than being silently clipped.

### Panels / Containers

Source and preview panes use borders, tonal grounds and the panel radius. Menus and dialogs may elevate; ordinary file lists are separated with rules instead of being presented as nested cards. There is no general-purpose chip component established by this extension; the small local badge remains incumbent shell branding.

### File Review Dialogs

Upload places Destination above a dashed drop area and the review list. The loaded review uses a target path, supporting status, a native checkbox and an optional check icon. New files are selected by default; replacement rows require selection, while blocked and merged-folder entries cannot be selected. The footer names the selected entry count. These loaded-row details are source-backed, rather than inferred from the empty upload captures.

Trash lists recoverable files with selection and restore actions. Restore review shows affected paths and explains conflicts before the named action. Move review shows original and destination paths; when reference changes exist, it expands into the existing wide dialog with disclosure rows and scrollable monospaced diffs.

**The Review Before Apply Rule.** Put affected paths and the operation's current status before the final action; gate that action while a valid review is unavailable or an operation is running.

The shared native dialog owns labeling, Escape handling, focus containment and restoration to the invoking control. A running apply step can make dismissal unavailable. Errors appear as text with alert semantics, and progress is announced as status. Motion is limited to the shared color/background transitions and a status spinner (1s linear); reduced-motion preference removes transitions and nearly eliminates animation duration. Still captures do not prove loaded collision-list motion or completion of any uncaptured workflow.

### Writing Checks

The sidebar's labeled Writing checks action opens the shared tool dialog. The first controls choose Off, English (US) or English (UK) and toggle LaTeX checks independently. The active path and eligible-file exclusion follow, with automatic-save context. Preserve this separation: switching spelling off does not visually merge or disable the independent LaTeX preference.

Issues and Personal dictionary are adjacent, sentence-case tabs with a neutral (2px) active underline and a fine shared bottom rule. The implementation supplies tab/tabpanel relationships, one tab stop, Arrow Left/Right switching and Home/End navigation. Status text, Retry checks and the conditional All issues/Spelling/LaTeX filter form a compact row above the scrollable findings. Errors use the existing alert treatment; loading, off, excluded and unavailable-source messages are source-backed states whose uncaptured appearance remains outside the visual review.

Each finding is a rule-separated disclosure row with a message and line/type metadata. Expanded content shows a wrapping source excerpt with the affected span marked, local replacement buttons and underlined text actions. Spelling actions locate the source, ignore for this browser session or add the word to the current language's dictionary; the explicit Ask AI action for a LaTeX hint is separate from the local checks. Corrections use ordinary editor Undo and the integration rejects stale source. Code mode receives inline diagnostics; Visual mode uses this list. These integration behaviors are established by sampled source and functional evidence, not by still images.

Personal dictionary keeps the same native field vocabulary: language select, new-word field with Add word, search field, saved count and flat word rows with Remove. Personal words are stored locally per language across projects and restarts; the rendered list shows up to 100 matches. The collapsed How local checks work disclosure explains heuristic LaTeX limits, skipped spelling contexts and local operation without adding another persistent panel.

**The Explicit Correction Rule.** Keep the active-file context, finding and source excerpt ahead of a named correction; apply a source change only after the author chooses it, and keep it reversible through the editor's normal Undo.

### Saved Conversations

The Chats tab uses the existing sidebar navigation. A labeled native Search chats field leads into the saved-message/project scope, archive count and refresh actions, then recent named conversation rows with a Lucide message marker and date/turn count when the query is empty. Selection uses a quiet tonal fill. Rename opens a native inline input with labeled save/cancel icon controls; archive and restore reuse the same compact actions. These controls remain explicit rather than depending on hover alone. The saved-chat search extension below replaces the original title-only filtering; archived-empty and unsampled operation states remain source-backed rather than visually certified here.

### Saved-chat Search

Search chats is a native search field whose accessible description and visible helper say Titles and saved messages · this project. The placeholder names title, prompt and reply. A nonempty query shows a count, literal excerpt rows and bounded More matches paging. Each row keeps the conversation title, Title / Your prompt / Assistant reply label and date above the original-text excerpt; only the literal matched span is marked. Preserved whitespace, Unicode and LaTeX punctuation remain readable text. Results stay flat with a fine separator, quiet hover and visible native keyboard focus rather than becoming cards.

Active and archived scopes are explicit through Archived / Back to chats. An archived excerpt stays readable while its ordinary opening target is disabled; the separate Restore & open chat or Restore & open match action makes restoration explicit before navigation. Searching saved chats… / Loading more matches… announce progress; No saved titles, prompts or replies match gives scope-aware recovery; a failed request retains readable alert text and Retry search. Refresh requests current saved data. Match-opening/restoration actions are disabled while editing/request selection is locked; read-only search itself starts no AI request.

Search is project-local, case insensitive and literal across saved titles, prompts and replies. It excludes unsent drafts, source snapshots, tool payloads and private native-session identifiers. These are product/behavior boundaries, not a new visual material or global search rule.

### Assistant Transcript

The active conversation title anchors the assistant header beside expand/compact, browse and new-chat icon controls. A saved-turn count and chronological paging controls remain above the reading region; pages contain up to 20 saved turns. A turn starts with the author label and reuse-prompt action, followed by a softly filled prompt, model/provider/status metadata and a native source-context disclosure. Source paths wrap and use underlined, labeled actions. Paging limits and action behavior are source-backed, not inferred from their still appearance.

Replies retain document structure with paragraphs, compact headings, lists, quotes and ruled tables. Fenced code has a bordered control-radius frame, quiet language/copy header and monospaced scrolling content. Local KaTeX renders inline/display equations; unrenderable math falls back to readable source. Reply copy and plain-text/formatted controls are compact text actions with line icons where present. Sanitized provider errors follow preserved reply text using the semantic error role; the saved light-theme failure capture establishes that composition. Raw HTML and remote images are omitted by the renderer; those restrictions are source behavior, not a visual material rule.

Per-turn proposals reuse the bordered, flat review vocabulary: file count/status and summary precede Review changes or View changes. The existing shared modal and revision-bound review flow remain authoritative. Prompt reuse, source opening, archive recovery, proposal actions and partial-run handling are supported by sampled source and functional verification; the captures do not certify every resulting state. Keep the existing composer below the transcript and reuse its established editing-mode and provider controls.

**The Reachable History Rule.** Keep conversation identity and chronological paging outside the scrolling reply region, with the existing composer reachable below it; contain long code, math and tables within the reply.

### Exact Saved-turn Navigation

Opening a message hit requests its exact saved turn even beyond the latest page, focuses that article and positions it within the existing internally scrolling transcript. The compact status says Search match · followed by the saved-turn count. Return to latest, Earlier and Newer share one wrapping navigation strip above the reading region; keep it as the single search-history control group. The matched article has a quiet tonal fill and a thin outline (1px with 3px offset); keyboard focus uses the shared focus stroke (2px with 3px offset). A failed exact-turn load retains a readable alert and Retry loading messages with the same navigation target.

Before changing conversation or opening a hit, the App flushes the current unsent prompt, then loads the chosen conversation's own draft. Keep the existing composer reachable below the transcript and disable match opening during a busy source-changing request. Searching and reading a saved hit do not generate a new AI response. Bidirectional saved-turn cursors and stale-response guards are source-backed behavior; still captures alone do not certify every paging or transient state.

**The Exact Saved Match Rule.** Keep the project/saved-message scope, literal excerpt and explicit archive restoration ahead of exact-turn navigation; retain one reachable Earlier/Newer/Return to latest group and preserve each conversation's unsent prompt without starting generation.

### Persistent Unsent Chat Drafts

The existing prompt field remains the entry point; its accessible description points to the local draft status between the field and model controls. Visible states say Loading draft…, Draft not saved yet, Saving draft… or Draft saved locally. Problems retain the prompt, announce their explanatory text as an alert and offer Retry draft or Review drafts inline. Ordinary progress uses a status announcement. Recovery actions retain the shared visible focus outline and are disabled while request/chat selection is locked. For an empty, nonproblem state, No unsent draft remains in an absolutely positioned, clipped (1px × 1px) accessible span, without a visible status row; do not restore the superseded standalone empty-description line.

Choose a chat draft uses the shared native modal and sentence-case title. Your text in this window and Saved draft from the other window label two literal, read-only textareas, preserving exact whitespace and text rather than summarizing or merging it. Supporting copy states that comparison does not send an AI request. Keep reviewing closes without choosing, Use saved draft explicitly adopts the shown saved version, and the inverted Save my draft explicitly attempts a revision-checked save of the local text. During a chosen save, controls and dismissal are gated and the primary label becomes Saving…. A stale choice or failed/ambiguous save retains the comparison, local text and an alert; a renewed conflict shows the newer saved version for another explicit choice. Do not close the comparison merely because saving has started.

Draft text is keyed by project and conversation, including a separate New conversation slot, and autosaves after the controller's debounce (400ms). Confirmed saves persist locally across reload/restart; pending in-memory changes before commit remain distinct. Draft metadata is prompt text plus identity/revision/update bookkeeping: current source, selected passage, model/provider, editing mode and scope are chosen from the current workspace when sending, not restored from the draft. Drafting, retrying a save or comparing versions makes no automatic AI request and creates no chat/session, source revision or checkpoint. A failed start retains unsent text. Accepted runs consume only the submitted saved draft with their run/chat record in one database transaction; newer local text is retained. This is separate from saved turns and provides no draft version history.

**The Confirmed Prompt Save Rule.** Keep exact unsent text with its project/conversation, distinguish pending text from a confirmed local save, and require an explicit choice between literal competing versions while retaining stale/error recovery; drafting never sends an AI request or changes source/history/session state.

### Diagnostic Actions

Fix with AI remains a labeled action in the existing flat diagnostic row. Complete source labels wrap within the row instead of widening or truncating it. When the composer already contains different text, Prepare an AI fix opens the shared native modal: the explanation and named source precede Your unsent prompt and Prepared diagnostic request, each shown literally in a labeled read-only textarea. Keep draft and Escape preserve the existing prompt. Append diagnostic inserts two newlines plus the prepared request; Replace draft uses the request alone. A combined request above the existing (16,000 UTF-16 code-unit) limit fails visibly without truncation. Replace uses the incumbent inverted primary treatment; the other choices retain ordinary native actions.

Preparation opens the named current editable source, selects Review Edits, clears earlier explicit file/selection context, places the caret on the reported line and focuses the composer. Diagnostics without a source path use the build root. The current conversation and Document/Whole Project scope remain selected. An older diagnostic opens current source for inspection; recompilation refreshes the diagnostic. A removed, renamed, read-only or revision-changed target requires explicit recovery rather than a fallback to another file.

Preparing names its source in a flat (12px / 1.6) muted status with Cancel preparation; failure uses the existing danger alert and Prepare again / Dismiss. In the comparison, pending opening and errors remain above the fixed action footer; a failed choice retains both literal texts and offers Review current draft. Append/Replace are disabled while preparing, and Send is gated until preparation finishes. Native modal focus containment, Escape and return focus remain shared behavior. Buttons retain existing hover, disabled and visible-focus treatments; no new elevation or motion grammar is introduced.

The controller captures project, conversation, scope, mode, prompt and editor navigation/content, flushes the prompt draft and saves ordinary pending source work before opening the current target. Changed context, navigation, source, prompt, scope, mode, save/read results or assistant ownership reject a stale result. Cancellation invalidates late responses, duplicate preparation does not race another action, and changing project/conversation dismisses the old action. Preparation itself has no provider/source-write port, creates no AI chat/run and does not compile or apply a fix. Ordinary pending-source autosave is distinct. The user inspects the composer and explicitly chooses Send.

**The Target-aware Preparation Rule.** Name and open the actual diagnostic source, preserve the conversation, scope and literal unsent prompt, reject stale preparation, and keep Keep/Append/Replace separate from explicit Send.

### Source Draft Recovery and Live File Conflicts

Recovery is a quiet, persistent status strip above the editor, using existing panel, text and border roles. It names available unsaved writing or an external-file conflict, retains storage warnings, and offers a native Recover draft picker with file/date context or a labeled Review file versions action. The editor footer also exposes File versions for an open text file. This persistent entry point survives transient toast dismissal; recovery stays attached to the active project rather than appearing in another project's picker.

Recover unsaved text and Review file versions reuse the shared native modal. A full wrapping source path and short explanation precede Disk version and Your edited version. Disk text is literal, read-only and uses the quieter background role; the candidate remains literal and editable. Disk context distinguishes checking, matching saved source, external changes, deleted or unavailable text. Opening or refreshing the comparison reads current versions without updating source; ordinary pending-source saving before reviewing a different draft is a separate operation. Candidate edits immediately enter the browser journal and are mirrored to the backend recovery copy, with visible storage-failure guidance. Exact Unicode and empty text are content, not an invitation to normalize or drop a draft.

The footer keeps Download edited text, Refresh comparison, Keep for later, Use disk version and Save edited version visible as named choices. Download exports the current candidate. Keep for later, Close and Escape retain writing. Use disk version imports physical disk bytes without rewriting them and keeps the recoverable browser candidate; Save edited version explicitly commits the reviewed candidate and retains earlier source in History. Only an exact confirmed saved candidate consumes its matching draft. Save edited version is the existing inverted primary action; other choices use restrained native controls. Comparison, journal, refresh and these source decisions make no AI or paid request.

Save/refresh errors remain inline above the comparison; the operation error receives focus and the editable candidate remains available for correction, refresh, retry or download. Refresh updates disk context without resetting the candidate. A second disk change rejects the stale review token. Missing or non-text paths show their real state; edited saving is unavailable for non-text disk content. During a write, candidate editing, repeated actions and dismissal are gated. Assistant ownership disables application with a visible inspect/download explanation. Shared native dialog focus containment, Escape and return focus remain in use; inherited button/link focus outlines and field focus treatment apply in both themes.

Project/file identity governs editor callbacks, journal publication, picker entries and review application. Successful project/home navigation retires the old review; return offers retained drafts through a fresh comparison rather than reopening stale state. An off-project review cannot lock the destination. The review opening path rechecks project, navigation and unsaved state after awaiting an ordinary save. Keep these guards alongside revision-bound disk choices; neither a path name shared by two projects nor a late journal response establishes the active source identity.

**The Explicit Source Choice Rule.** Show the named file, literal disk text and retained editable candidate before Use disk version or Save edited version; inspection and refresh do not apply a version, and failure preserves writing plus reachable recovery.

**The Project-bound Recovery Rule.** Scope draft notices, callbacks, journal publication and review locks to the current project and file; retire comparisons on project navigation and require fresh review without discarding retained drafts.

### Editor Saving and Compilation

Saving and compilation is the first named field group in Editor settings. Native Source saving, Autosave after typing and Compile delay after saving selects use the existing neutral fields, fine borders and visible focus. The two-column form uses (14px × 18px) gaps, (14px) labels and (36px) minimum-height selects; the existing (560px) narrow threshold stacks the form, with only these three workflow selects raised to (16px). This local native-control adaptation does not add a global typography or breakpoint token. The existing settings modal is (650px) wide, bounded to the viewport and (85vh), and scrolls normally through its form and Save editor settings / Reset editor defaults actions. Its actions are not pinned.

Preference choices remain a component-local draft until Save editor settings succeeds; preview and Reset do not apply writes. Saving submits only changed preferences, disables the form while pending and reports confirmed success through compact status. An inline failure retains choices for retry. The scope is every project on this computer, with LaTeX/PDF formatting unaffected by these timing choices. The ordinary source-save default remains Automatic after (600ms); automatic compilation remains independently delayed (1800ms) after saving. Persisted valid custom delays remain selectable. Compile delay applies only while the existing Automatic compilation toggle is on; an explicit Compile starts after its preflight source save without waiting that delay.

Manual mode disables the inapplicable autosave-delay select while retaining its choice. It keeps the immediate browser source journal and SQLite recovery mirror, and shows Autosave off beside Saved, Unsaved, Saving… or Save failed. A restrained labeled Save button sits in the existing source-status row; Cmd/Ctrl S follows the same explicit save route. Save disables for clean source or source ownership locks. Switching files, leaving the project and explicit compilation continue to save pending source first. AI typing progress remains separately saved; changing ordinary source autosave does not redefine that workflow.

Canceled or replaced idle tasks cannot start later. Save eligibility rechecks current autosave preference, project, file, revision and literal content, plus source/typing locks; automatic compile rechecks current automatic flag, project, source locks and source cleanliness. The existing recovery review, file conflict, assistant, review and file-operation guards remain part of that eligibility. Turning off Automatic compilation cancels its queued build; choosing Manual cancels its queued source save without discarding writing. Native dialog focus, disabled-control skipping and Escape/focus return remain the shared behavior.

**The Independent Editor Timing Rule.** Keep source-save and automatic-build delays independent, save preference drafts explicitly, and retain recovery plus source-adjacent Save/status in Manual mode; stale tasks and agent/recovery locks must not act on another source.

### Quick-open and Command Palette

A quiet native picker keeps project context and a visible query label ahead of flat, inspectable results. Filenames use compact semibold body text (12px / 600), with full paths or command descriptions/reasons at (12px); shortcut badges retain the existing (11px) code treatment. The search wrapper uses the editing surface, control border and shared field radius, with a focus-within outline (2px) offset by (2px). Results use the neutral `line` hover fill and `accent-dark` selection fill. Disabled entries remain readable, expose their explicit reason and cannot execute. Empty results suggest another name/path; a failed file-open preflight retains the query and error for retry. No new palette, type ramp or raised-row system is introduced.

Cmd/Ctrl P opens project files and Cmd/Ctrl Shift P opens commands only outside an existing dialog and IME composition. File results exclude deleted entries/directories, put the active file and recent tabs first, then use local token matching across filenames, complete paths and context. Matching normalizes case, Unicode decomposition and combining marks and ranks exact/prefix/substring/subsequence matches; at most (100) rows render with an explicit refine-search count. This is the indexed current project, not arbitrary-folder discovery. Binary assets retain their named Asset context and use existing inspection behavior.

The focused combobox owns unmodified arrows and Enter, with an active-descendant reference to the selected option. Home/End retain native text-caret behavior; the scrollable listbox has an explicit negative tab index so it adds no result-only keyboard stop. Close and native Escape retire pending navigation and restore the connected origin. The shared modal captures that origin before descendant autofocus, with its existing fallback when the origin becomes disabled. File selection reuses source-save, conflict, assistant and project guards and rechecks the current component/project after awaits; closing during a pending save prevents the delayed destination switch while allowing the owned save to finish.

The palette exposes existing local writing controls with explicit source/root/PDF/operation availability. Save, Compile/Stop, Find/Search, PDF navigation, Code/Visual, bibliography, word count, writing checks, history, file-version review, settings and help route through their existing handlers. It contains no paid-generation or destructive command. Sticky, accessibly named tab icons provide Open a file, Command palette and Find when tabs overflow.

**The Input-owned Navigation Rule.** Keep the query as the result keyboard owner, complete paths and availability reasons visible, and heading/query/recovery outside the bounded result scroller; closing must retire the pending destination and restore focus without discarding the original writing.

### Source Formatting Review

Format source is a named existing-toolbar action with a small Lucide alignment icon (14px); the command palette exposes Format LaTeX source with a literal local-preview description and an explicit locked/non-TeX reason. Both route to the same guarded action. Preparing the target preflight-saves ordinary pending source, then captures the selected project's path, saved revision, exact text and selection; opening tool availability does not start a formatting run. The native review puts that target and the default-only policy before the selected installation/tool path or a real missing-tool problem. Project and user YAML settings are explicitly ignored. Refresh formatter and installation/Perl-dependency guidance provide recovery without automatic installation.

Preview formatting starts a separate source-snapshot job. The same footer control becomes Stop formatting and then Stopping… while the processes drain; uncertain requests expose Check request and Stop before another preview. Closing retires/cancels active preview work. Status text distinguishes ready, unchanged, failed and stopped outcomes and explicitly states when source is kept. Available logs sit in a native disclosure. Missing/failed/stopped/unchanged results, active work, source locks and Apply progress keep Apply disabled; a successful changed candidate exposes the inverted primary Apply formatting action. Read-only guidance and a failed Apply remain outside the body so they accompany reachable recovery.

Changes, Formatted source and Original source are three named, pressed-state choices. Changes shows literal whitespace-preserving, wrapping lines with plus/minus prefixes and the existing paired revision colors. Its (800-line / 100ms) boundary is disclosed when reached, directing the author to the two complete views. Those labeled read-only textareas retain complete candidate/original text, native selection, their own scrolling and vertical resizing; they are source inspection rather than a rendered document preview.

Apply checks the current project, file, saved revision, exact source and operation locks before and after server validation, then checks the returned text/hash/revision/path before one editor transaction. A stale response keeps the candidate and inline error visible while the author reviews file versions; it does not silently overwrite current source. One Undo reverses the applied formatting. The shared native dialog retains Escape, origin-focus restoration and visible focus; the stable Preview/Stop node and focusable status/error targets retain keyboard access through state changes. During Apply, dismissal is disabled until the action resolves.

**The Captured Formatting Rule.** Name the local tool and captured source before preview, keep literal changes and complete source inspectable, and require one explicit guarded Apply; failed, stopped, stale or unchanged work must preserve writing and reachable recovery.

### Cross-file Manual Type Undo

Manual Type recovery is a flat inline action at the end of the assistant transcript, above the existing composer. Undo typing in names the actual target path beside a nonshrinking Lucide Undo2 icon (14px), even while another file is inspected. The normal source-toolbar Undo remains file-specific. Keep the target visible through recovery and failure rather than deriving it from the inspected tab. Saved-chat refresh or restart does not hide an insertion-only Undo.

The recovery group has a small top separation (10px). Its borderless action uses the existing `accent` foreground, compact body text (12px / 1.6), a left-aligned label and icon gap (6px); the literal monospace path uses the label size (11px) and can break anywhere. The action group wraps with a gap (12px), and each button stays within the available width. Dismiss uses the same compact size with `muted` text. Hover follows the shared primary-text treatment; disabled controls retain the shared reduced opacity. This introduces no new palette, card, shadow or breakpoint.

An unconfirmed Undo retains the named target in a plain `danger` paragraph (12px / 1.6), with wrapping text and a small gap (8px) before Retry Undo in and Dismiss Undo recovery. The alert receives programmatic focus; both actions retain the shared focus-visible outline (2px with 3px offset). Dismiss clears the local retry context, without reversing a committed Undo. Recovery prose and actions remain inside the existing scrolling conversation region, while the composer remains below it. At narrow widths, the label/path and actions wrap; scrolling may be needed to reach all error text and Dismiss. This containment does not change the inherited horizontally panning editor shell.

Recovery briefly locks source/navigation mutations, then saves pending edits in the inspected file before restoring the target. Success opens the named target with its original source and selection, then focuses its remounted editor. A valid cached native history retains earlier Undo and the typing Redo; absent, stale or damaged history reconstructs a single ranged typing Redo from the saved edit range and source, validating unchanged surrounding text and deriving the Redo caret from that source. Initial recovery restores the original selection; subsequent Undo/Redo follows CodeMirror's standard selection behavior. Restart recovery does not imply that earlier native history was recovered. Retried ambiguous responses keep the captured target and pre-Undo history; revision and confirmation checks preserve later target edits and the unrelated inspected source.

**The Named Typing Recovery Rule.** Keep the typing target, Retry and Dismiss explicit inside the bounded transcript; briefly lock mutations, save unrelated edits before restoring the target's source and selection, and distinguish preserved native history from reconstructed one-event Redo.

### Existing-table Drafts

Code's Table action captures the existing table at the cursor; Visual mode offers Edit table alongside exact source-fragment editing. The centered tool begins with its draft/Apply explanation, row/column count and labeled Lucide draft Undo/Redo controls. The schematic grid uses numbered headers, wrapping monospaced cell text, a muted Empty placeholder and a clear selection fill/stroke. Cell buttons are at least (95px) wide and (45px) high; wide content scrolls within the grid rather than widening the dialog. This is a source grid, not a PDF preview.

Keep the selected row and logical column range visible immediately below the grid. Shift-click and Shift with horizontal arrows extend within one row; arrows move the focused cell, and Enter starts an edit. The selected first cell is the grid's cell tab stop. After a merge, unmerge or draft history move, selection normalizes to one logical cell; a merged cell reports its full column span and Merge stays disabled until another eligible cell is selected. Native focus remains distinct from selection. These behaviors are source-backed and functionally checked; the corrected merged-selection composition is captured.

Selection actions are compact raised-neutral buttons; row/column operations, alignment and border presets remain native selects with visible labels. Fixed-width settings pair a field with Set width. Cell and existing-caption editing uses a labeled, monospaced native textarea with Update draft and Cancel cell edit. While an edit is pending, the other mutation controls and Apply are disabled; validation remains beside the edit, uses the semantic error role and scrolls into view. Supported limits and structural restrictions produce explicit messages instead of silently changing unsupported content. The bounded parser allows up to (100 rows × 24 columns), with cell/caption input bounded to (10,000 characters); unfamiliar/custom structure offers Open source editor. Keep package requirements and the distinction between grid geometry and compiled widths visible in supporting text.

Review LaTeX changes is a native disclosure with a prefixed, colored source diff; the independent Complete draft LaTeX disclosure exposes the entire unprefixed replacement. Copy draft LaTeX remains available for inspection and stale-draft recovery, including read-only mode. Clipboard failure names the complete-source disclosure as the manual fallback. The footer pairs this recovery path and One document edit · one Undo with the inverted Apply table changes action. A stale-source alert explicitly says to copy before closing/reloading because the draft is held only in this dialog; rejection retains the draft.

The assistant's read-only state is explained above the grid. Selection, source inspection and complete draft recovery remain available while mutation controls, draft history and Apply are gated. Unsupported source can also be inspected through the existing source editor. Unchanged, invalid/unsupported, pending and locked drafts cannot Apply. Opening, selecting, editing and draft Undo/Redo do not change document source or history; one successful Apply uses the captured source/revision checks and one isolated editor transaction. The source-only boundary, stale rejection and exact document Undo are behavior established by source and functional verification, not by still-image appearance.

**The Source-preserving Draft Rule.** Keep table source and document history unchanged while the author selects, edits and reviews a local draft; show truthful logical selection, complete-source recovery and one explicit reversible Apply.

### Clipboard Formats and Recovery

The toolbar's labeled Paste Preview action opens format review on demand. Settings → Editor offers the persistent Preview formatted paste before inserting checkbox; its default is off. Ordinary supported, package-independent formatted paste into Visual mode inserts immediately as one isolated editor Undo, retaining the familiar editing flow. Package-dependent Visual conversions, detected conversion losses, expired/unavailable Prism source records and Code-to-Visual copies require review; intercepted raw clipboard LaTeX also requests a format choice. A bitmap accompanying an editable HTML table does not replace that table. These routing rules are source/functional behavior, not an inference from the screenshots.

Review begins with the captured path and Insert at cursor or Replace selected text plus its line number. Selected text to replace is an independent native disclosure showing source; when selection exceeds (4,000 characters), the disclosure explicitly says it shows only the beginning and that the full captured selection will be replaced. Preserve the captured file/source and insertion range throughout clipboard reading and review. Apply rechecks local target, backend source revision and read-only state; stale rejection keeps the review and clipboard available and names the reload/retry path.

Paste format is a labeled native radio fieldset: Keep formatting when HTML is present, Plain text, and Original Prism LaTeX when the source record is available, or explicit Clipboard LaTeX when raw source is available. Resolved original source is the initial source choice; Visual HTML otherwise starts with formatting. Loading original source gates the choices/action. Conversion errors expose plain-text/smaller-passage recovery. Detected unsupported colors, fonts, spacing, layout, legacy attributes or stylesheet/class presentation show a warning before insertion; this bounded conversion does not promise arbitrary HTML/CSS equivalence. Required preamble packages are named with the explicit statement that packages are not added or installed automatically. Full-document/preamble source is refused in Visual mode with Code view/Document setup recovery, while plain text remains a choice.

The focusable content region offers a bounded readable projection of the proposed source, with restrained headings, native lists and collapsed ruled tables. Review pasted LaTeX independently reveals the complete generated source. Keep Copy pasted LaTeX beside One paste · one Undo in the sticky footer; copying confirms LaTeX copied, and clipboard failure names the complete source disclosure as manual recovery. Read-only gates format changes, image switching and Paste while retaining source inspection and copy recovery. Applying disables dismissal and names progress as Pasting…. Existing focus outlines, native modal focus restoration and both theme variables remain authoritative.

Prism copies carry balanced source through a random opaque identifier, with ordinary HTML/plain-text representations for other destinations. The identifier resolves against the bounded in-memory source record; an HTML attribute itself does not authorize raw source insertion. Expired/restarted records produce an explicit fallback notice and format choice. Source-preserving copying, conversion limits, package boundaries and the prohibition on remote-image fetch are product behavior, not new visual materials. Keep those constraints visible where they affect a choice without inventing a clipboard identity.

Cross-view assistant activity updates source locks using lightweight run metadata, separately from full chat history. An already-open paste dialog reflects read-only changes; supporting files remain readable/navigable while source mutation is blocked. Backend read-only and revision checks immediately before dispatch remain the authority. This extends the incumbent local editor's interaction state and does not establish a hosted collaboration design.

**The Reversible Clipboard Rule.** Paste ordinary supported content as one reversible edit; require review when source recovery, packages or detected losses need a choice, keeping the captured target, complete source and recovery action inspectable before insertion.

### Clipboard Image Review

PNG/JPEG paste opens the same neutral wide dialog with the captured target, contained local image preview and labeled native filename, width, caption and reference-label fields. Width is expressed as a percentage of line width. Review image upload opens the existing nested Upload clipboard image dialog; Destination and the resulting path precede explicit file selection/replacement consent. Existing replacements start unchecked. Keep the underlying image dialog unavailable for dismissal while that nested review is open.

Only a completed upload supplies the saved path and enables valid figure insertion. Review figure LaTeX exposes the generated source; supporting text names `graphicx` and the separate destination/replacement review. Insert pasted figure remains the explicit source action and creates one isolated source Undo. Cancelling after upload leaves the saved asset available and explains that Files offers separate upload Undo. Upload consent and figure insertion are distinct operations with distinct recovery; do not imply that source Undo removes the asset. Filename/type/size and figure-field validation remain explicit, and read-only/applying states gate mutation controls.

**The Reviewed Image Rule.** Review destination and replacement consent before saving a clipboard image, then insert its figure explicitly; keep upload recovery separate from document Undo.

### Local Comment Review

Review joins Files and Chats in the existing sidebar; Comments has labeled refresh/add icon controls. The source toolbar's labeled Comment action adds discussion, while its separate Toggle LaTeX comment action edits `%` source comments. Preserve that distinction. New comment explicitly captures the selected source passage, or the current line when the selection is empty, with a path/line and an initially open Selected passage disclosure before the native body field and Post comment action. Use current selection deliberately retargets the draft; it does not silently replace a captured passage.

The list begins with native Open/Resolved/Trash and Current file/Whole project filters. Flat summary buttons show a wrapping path, excerpt, message count and passage-change/unavailable context, followed by Previous/Next with the current range. Summaries are limited to (50 per page); full thread bodies load on demand. Empty/loading/error messages remain explicit. These list and Trash states are source-backed and functionally exercised; their visual finish is outside the final still-image review.

A thread leads with All comments, its state, source path and Go to passage or Go to former location. Original passage stays independently inspectable in a native disclosure. Changed and removed anchors state what happened and retain the original quote; an unavailable/file-Trash source explains restoration in Files instead of offering a false navigation target. Reattach to current selection is an explicit mutation. Source passages use a dotted underline and compact outline-message gutter marker; overlapping marked spans merge into one underline range. The CodeMirror gutter is hidden from assistive technology, so its pointer buttons have `tabIndex=-1`; Alt+Enter at a marked passage in Code or Visual mode and the accessible Review list provide keyboard access. Do not introduce hidden gutter tab stops.

Messages are flat articles separated by fine rules, with You, the creation date, plain escaped text and labeled edit/Trash icon controls. Updated appears when the saved message has changed. Comments are neither Markdown nor executable source. Resolve/Reopen and recoverable thread/message Trash use compact neutral actions, with explicit restore choices. The Reply form stays at the end of an open thread; it is absent for a resolved/deleted thread or while a message is being edited. Read-only text explains source ownership while the assistant or a file operation runs: comment mutation controls and editing are disabled, while refresh, source inspection, discussion scrolling, list navigation and other files remain available.

Unsent drafts stay in the mounted project workspace: new posts retain their captured target/body, replies are kept per thread, and message edits are kept per message. Sidebar/thread navigation and refreshed saved data do not silently overwrite them. A changed thread shows the editable local body alongside Current saved comment; Save remains disabled until Use refreshed thread explicitly rebases that draft. The action updates its revision basis without replacing the local wording. A rejected stale new anchor keeps both body and original passage and offers Use current selection before retry. The draft notice states the open-workspace lifetime; posted discussion persists, while unsent drafts do not survive an app/browser restart.

Comment actions leave source bytes and source Undo unchanged; posted discussion remains local You-only metadata, separate from hosted/shared comments and ordinary tracked changes. With the owner-confirmed default review-history capture enabled, comment-only mutations schedule grouped history snapshots and source versions include saved discussion. This supersedes the earlier outside-history boundary without putting comments in LaTeX, compiler snapshots or source ZIP exports. Unsent drafts remain open-workspace memory. Keep original context, safe recovery and mutation locks visible where they affect an author's next action.

**The Anchored Discussion Rule.** Keep original source context and changed/removed status truthful, preserve local wording across navigation or conflicts, and require an explicit retarget or saved-thread rebase before a stale draft is posted.

**The Reachable Thread Rule.** Keep thread return navigation and the end-of-thread reply reachable within the scrolling Review sidebar; retain read-only inspection and accessible source navigation while mutations are locked.

### Ordinary Source Review

The native Editing/Reviewing source-mode picker is distinct from the assistant's Review Edits proposal mode. Reviewing is explicit per-project opt-in; that default is a recorded implementation assumption after an unanswered question, not an owner-confirmed preference. Mode and pending passages persist. Changing back to Editing does not silently accept pending work: disjoint new edits become accepted text, while edits touching a pending passage continue its review. Keep the visible mode notice and current-text compile/export notice ahead of review choices.

Review → Changes uses native Current file/Whole project scope and, for project scope, a native file picker. The latter chooses one file to inspect; a decision remains confined to that file. Flat passage rows show a native checkbox, Change/line label, accessible Go to source passage action and complete Removed/Added disclosures with character counts. Each passage has Accept/Reject. Selection offers Select all in file and Use editor selection: an intersecting selection includes each whole coherent passage, rather than claiming to accept an arbitrary subrange. Pure deletions remain reachable through the list and whole-file selection. Nearby edits separated by at most (12 unchanged UTF-16 units) with no newline are grouped; large rewrites retain exact complete source as one explicitly grouped change rather than multiplying tiny fragments or deletion widgets.

Accept selected, Reject selected and per-passage actions first open the inline confirmation. Confirm Accept keeps current source and removes the marks; Confirm Reject restores removed source and removes insertions. Cancel is explicit. Keep the captured decision visible when the exact source, project review revision or hunk-layout token changes: confirmation becomes disabled with a stale-source notice until the author refreshes and chooses again. Complete old source stays in Review, while Code and Visual show double-underlined inserted source and one compact Deletion widget per coherent removed passage. Widgets have no hidden tab stop (`tabIndex=-1`); Alt+Shift+Enter at the passage and the accessible Review list provide equivalent keyboard access in both modes.

AI/file-operation ownership disables mode changes, review selection/mutations and dedicated review Undo, with a visible read-only explanation. Source remains selectable and inspection, scrolling, Review navigation and other-file access remain available. The editor's read-only transaction filter enforces source ownership; an editable DOM attribute alone does not establish permission. Loading, errors with Refresh review, no open text file, no pending changes and file-in-Trash restoration notices remain explicit source-backed states, whose uncaptured visual finish is outside the still review.

Undo last review is a dedicated persisted decision recovery, guarded by exact source/revision/baseline checks; later edits may invalidate it. Ordinary source Undo remains separate. Current text compiles and exports; project copies contain current text with fresh, disabled tracking. Review metadata never becomes LaTeX and stays outside compiler snapshots and source ZIP exports. Review-aware history now saves pending baselines alongside source by default; Accept can therefore schedule metadata history, while Reject also writes an ordinary source change. New-file creation and file deletion remain file-history/Trash operations. Existing-text changes, including applied AI changes and source-only history restores, participate in tracking; recovery including saved review restores its saved pending baseline. Keep this single-user local workflow separate from hosted coauthor identity, permissions and notifications.

**The Exact Passage Review Rule.** Keep complete before/after source and coherent whole-passage selection ahead of an explicit revision-bound Accept/Reject confirmation; never silently accept pending work when Reviewing is turned off.

**The Reachable Decision Rule.** Keep confirmation, Cancel and complete source inspection reachable inside the scrolling Changes sidebar, with keyboard source access and truthful read-only/stale gating.

### Review-aware Project History

The owner confirmed that future history includes comments and pending tracked changes by default. A native per-project checkbox states Include comments and tracked changes in future history snapshots; it persists across restart and affects future capture without deleting older saved review. This confirmed history preference is separate from the still-assumed opt-in default for source tracking. Timeline entries retain their named/automatic identity and add explicit With review or Source only availability text. Comparison names changed source files, compiler settings and whether review matches, differs or is unavailable; paths with review-only changes remain selectable.

Source comparison and Saved review are compact pressed-state controls above their respective contents. The saved archive is read-only: a native Review file picker offers All saved comments or a path; flat thread summaries show path, Open/Resolved/In Trash and message count. Summaries page in groups of (25), and full messages load only when a thread is opened. Original saved passage is an independent native disclosure; messages remain escaped plain text with You and saved Trash context. Saved tracked changes require a selected path and expose complete Removed/Added source by saved line. An exact large rewrite is truthfully grouped, and a saved file-in-Trash notice remains explicit. Choosing a review file also updates the selected source path and file restore target; changing path/version/comparison clears the prepared restore.

Restore one file and Restore whole version first prepare a scoped plan, rather than applying immediately. Restore always addresses the current project, independently of the comparison target; when comparing another saved version, the interface asks the author to compare with Current project and prepare again. The plan names the source version, path or whole project and source-file count. Its native Restore saved comments and pending tracked changes checkbox makes inclusion explicit and initially requests available saved review. Current and saved thread/message counts and the saved pending-file count explain the choice. Confirm restore and Cancel restore remain reachable in the bounded inline plan; errors stay there after a rejected confirmation.

A file restore changes only its exact path and, when included, review for that path; other files and compiler settings stay current. Whole-project recovery restores the saved file set and compiler/root settings, moving newer files to file Trash. Both keep chats and the current Editing/Reviewing mode. Current source is backed up before recovery; review backup is attempted even when future capture is disabled, within the same capture limits. With saved review included, newer threads/messages remain recoverable through comment Trash and the pre-restore backup. A file restore does not steal a thread moved to another path: stable scoped thread/message copies preserve the other file's discussion, and the plan states the copied-thread count. Recoverable extras mean recovery is not a byte-for-byte rollback of the entire database.

Legacy, deliberately omitted, missing, invalid or oversized review has an explicit reason and source-only recovery; unavailable review cannot be reconstructed. Review capture is bounded to (16 MiB), (10,000 threads), (50,000 messages) and (10,000 tracked files). A limit omission still saves source and retains live review. Source-only recovery keeps current discussion mapped to restored source and follows the current source tracking mode, so enabled Reviewing can create pending text changes. Do not promise unlimited review backup or imply a source ZIP contains discussion.

Preparation and confirmation bind source revision/generation and, when restoring saved review, the live review token. Stale source or comment-only changes reject recovery without overwriting newer work and direct the author to Refresh history and prepare again. The prepared restore keeps one operation UUID across an ambiguous-response retry; the backend applies it once and returns its recorded backup. AI/file-operation ownership disables capture-setting changes and restore mutation while retaining timeline navigation, archive/source inspection and scrolling with a visible read-only explanation. Locks and revision checks remain backend behavior, not permission inferred from a DOM control.

**The Explicit Recovery Scope Rule.** Keep the selected version, exact file/project scope, review inclusion and newer-discussion fate visible before Confirm restore; retain current chats and Editing/Reviewing mode.

**The Reachable Recovery Rule.** Keep history identity, saved content and confirmation errors inspectable in bounded regions, with keyboard focus and Confirm/Cancel reachable in both themes.

### Milestone Labels

All history and Labels are plain pressed-state controls; Find a milestone is a labeled native search field. Labels view shows versions with active labels, and search matches every active name without case or accent sensitivity. Removed names do not match. Filtering never silently replaces the selected version: an out-of-filter notice keeps its comparison open and offers Show all history. The first active label supplies the current display name; the immutable version ID and saved date retain the version's identity. The timeline previews the first three active names, counting the display name, then shows a remaining count. Every full name remains inspectable in the manager.

The manager shows the saved-version name/date before Labels and Refresh labels. Flat rows pair a wrapping name with explicit Rename and Remove actions. Add a label uses the native name field and Add label; Rename preloads that same field, focuses it and offers Save label and Cancel rename. Removed labels is a native disclosure with a retained count and an explicit Restore action on each row. Removing every active label leaves the immutable version in All history; it does not delete the saved version. These are metadata rows, not colored tag chips or nested cards.

Names are limited to (120 UTF-16 units), including after NFC normalization; trimming and whitespace collapse produce the saved name, and control characters are rejected. Active canonical/case-insensitive duplicates are rejected within a version; another version can reuse the name. Each version permits (100 active / 500 retained labels), including removed labels; at the retention bound the available path is rename or restore rather than a new purge action. Existing named milestones migrate once without changing snapshot bytes, while automatic versions start unlabeled. Copies start with fresh history and labels.

Stale revisions retain the local Add/Rename text, focus the alert and require Refresh labels before another mutation; refresh preserves the draft and asks the author to check the saved names. An ambiguous response retains the signed request and operation UUID, disables a fresh mutation and offers Retry label action or Refresh labels. Retrying the same request is replay-safe; changed request content or stale metadata cannot overwrite a newer name. Drafts and pending requests live in the open dialog; committed labels and the operation journal persist across restart. AI/source ownership disables Add/Rename/Remove/Restore while label inspection and metadata refresh remain available, with the existing read-only explanation. Native input and button focus treatments remain visible, including the alert's focus outline.

Label changes annotate an immutable saved version without modifying source bytes, source Undo, compiler input, saved review, generation, source history or chat identity, and do not schedule another checkpoint. Source/review restoration does not roll label metadata back. Keep the owner-confirmed default for future review snapshots separate from both label metadata and the opt-in source-tracking assumption.

**The Stable Version Context Rule.** Filter active names without changing the selected saved version; keep its saved date, full label list and an explicit Show all history recovery available.

**The Recoverable Label Rule.** Keep label mutation separate from saved content, preserve local wording across stale or ambiguous responses, and provide explicit Refresh, replay-safe Retry and Removed labels recovery.

### Local Template Catalog

New project opens the same catalog from the library and editor project menu. Built-in, My templates and Template Trash are plain pressed-state controls followed by a native search field and Refresh templates. Search folds case and accents across name, description and category. Flat, full-width list buttons show name, description and category/file count, with a quiet selected fill. A filtered-out selected template retains its detail with an explicit notice rather than silently switching source. Loading and empty states name the collection or search outcome.

The selected name and description precede generic-starter or personal-snapshot provenance, file count and size. Personal templates offer Edit details and recoverable Move template to Trash / Restore template. Edit details opens labeled native Template name and Description fields with Save details / Cancel details; it changes metadata, not frozen source. Trash explains that restore is required before create, compile or source ZIP download, and gates those actions. Template names are capped at (120 characters) in the UI and descriptions at (2,000); local drafts remain in the open dialog.

Source and PDF preview are compact pressed-state controls. Preview file is a native select over the captured entries; text is selectable in the read-only source textarea, while directories/assets/unavailable content show an explicit reason. Download source ZIP is a labeled underlined action. Compile preview explicitly builds a separate frozen snapshot using the chosen Main document and Compiler; it does not run on selection. Starting/queued/running states retain text, Stop preview cancels, and the existing PDF reader shows a successful result. During a later run/failure it identifies the last successful preview as stale, with a native build-log disclosure initially open on failure. Changing snapshot/root/engine clears the preview and cancels its old job; stale selection responses cannot replace current details. Blank is intentionally empty and cannot compile; its message directs creation followed by adding source.

The footer's native Project name, Main document and Compiler fields precede inverted Create project and Cancel. A name is required; a template with .tex entry choices requires a selected main document. The source-backed creation boundary is fresh files/history without copied chats, comments, review marks or file Trash. The author may inspect templates while an AI/file operation owns source; creation is disabled with an explanation. An entered project name survives selection/filter refresh and rejected creation. Alerts receive focus; an ambiguous response retains the exact request and gates fresh mutation behind Retry creation or Retry template change. Refresh templates retrieves current metadata after conflicts, without silently changing the frozen source or retry identity. Committed snapshots/journals persist locally; unsent fields and pending request IDs remain session memory.

**The Inspected Snapshot Rule.** Keep local template provenance, frozen source and explicit separate compilation ahead of creation; distinguish metadata changes and recoverable Trash from the source copied into a fresh project.

### Save as Template

Save as template is a labeled library-row/editor-project action using the existing line-icon vocabulary. App integration saves current active edits before opening source review and disables capture while source is owned by an AI/file operation. The dialog leads with the independent-local-snapshot explanation, native Template name and Description, then Source snapshot with Refresh snapshot. The included-file list names exact paths, Source/Asset/Folder kind and byte size; the summary names active file count, total size, main document and engine. Lists page at (100 entries), retaining explicit Previous/Next and range text. Refresh rereads the saved files rather than silently capturing a changed review.

Supporting copy explains that current source, supporting assets and empty folders are preserved, while file Trash, compiled output, chats, comments, review marks, history and credentials stay with the original. Imported scripts remain inert files. The saved snapshot remains independent after original-project changes or Trash. Reading saved project files is announced as status; capture requires a loaded review and nonblank name. Working capture disables dismissal and relevant controls, with Saving template… text. Errors use a focused alert; an ambiguous save retains the request, freezes new edits and offers Retry save template to recover the same result. A definitive source conflict retains wording and makes Refresh snapshot the review path. Successful save returns to the catalog with that personal template selected.

The shared native dialog supplies labeling, keyboard focus containment, Escape behavior and return to the invoking control when available. Name fields request initial focus; native fields keep their thin focus outline and buttons/alerts keep the stronger focus-visible outline. Preserve the fixed heading, independently scrolling review and nonshrinking Save/Cancel strip in both themes and the narrow layout. This is local source reuse, not an online gallery or institution/publisher compliance system.

**The Reachable Capture Rule.** Keep included source and retained error/retry context inspectable in the scrolling body while the dialog heading and explicit Save/Cancel remain reachable outside it.

### Local Project Library

Your projects and Recently edited exclude archived projects; Archived keeps them editable and compilable. Tag filters include archived projects with an explicit Archived label, while counts omit project Trash. Recoverable Trash is a separate destination that preserves files, history, tags, archive status and conversations; a restored archived project returns to Archived. Removing a tag keeps its memberships for restoration. These organization actions do not change source, history or chat identity.

Native Select projects/Done selecting, Select visible and a live selected count precede both list and grid. Opening a project stays distinct from its checkbox, tag filter and menu actions. The current visible selection is captured when a review opens; Tags provides adjacent Add tags/Remove tags modes and native tag checkboxes. Archive/Unarchive appears only when useful for that selection. Exact names and current/return destination precede an explicit Confirm action. Loading, missing tags, stale preflight or a running operation gates confirmation; a later stale response cannot replace the current tag review.

**The Exact Library Targets Rule.** Keep captured project identities visible before and after preflight, and require a current exact-target review before applying a batch; a busy member blocks the whole Trash action with named no-mutation and Refresh recovery context.

### Tag Editing and Recovery

Project tags opens one native dialog with Tag name, nine preset markers, native Color picker and synchronized HEX/RGB fields. Edit moves focus to Tag name; invalid HEX prevents saving, and RGB channels accept integers (0–255). Active tags/Removed tags is a pressed-state group above flat, rule-separated named rows, with Edit and Remove/Restore actions. Color stays in the marker rather than tinting labels or dialog surfaces. Create/Save tag and Close stay outside the scrolling form/list body.

Refresh tags rereads the expected revision while retaining the name/color draft. A definitive conflict keeps wording and exposes Refresh; an ambiguous response retains the exact request, disables fresh edits and offers Retry tag change. Project batches similarly retain a replay-safe request behind Retry project action. Errors receive programmatic focus and status uses explicit text. Saved organization/journals persist locally; unsent fields and pending request IDs live only in the open modal. A saved action whose library refresh fails says it was saved and provides Close/Refresh guidance, rather than claiming no change.

### Prepared Source Download

Source export first reviews exact active/archived project targets and names source ZIP count, pre-compression size and entry count. Prepare ZIP freezes one ZIP per project inside an outer ZIP without closing the review. The prepared view keeps a connected native HTTP Download ZIP link, Prepare ZIP again, Refresh preview and Close. ZIP prepared means bytes are ready; Download requested means the link was activated, with browser-download checking and repeat/preparation guidance. It never asserts that the author saved a file.

Prepared links expire after (15 minutes) or backend restart; the missing/expired response directs Prepare ZIP again. The backend retains at most (four archives / 200 MiB) as derived session memory, independently of source/history. Download bounds are (20 projects / 100 MiB source / 10,000 entries); preparation checks the captured source generation, while an already prepared archive keeps frozen bytes after later edits. Active source/assets/empty folders are included; compiled PDFs, history, chats, review and credentials stay separate. Library mutations allow up to (100 projects) and (32 tags) per review; these are explicit operational limits, not visual density targets.

**The Truthful Download Review Rule.** Keep prepared and requested states distinct, preserve exact targets and recovery actions after link activation, and never promote a browser request into a saved-file claim.

### Compile Options and PDF State

The compact toolbar adds a labeled Compile options icon beside Compile and Clean rebuild; Logs exposes Generated files and the latest build's mode/error policy. Compile options uses native Compile mode and Error handling selects, explanatory text, Save options, Refresh options and Cancel. Normal + Stop is the owner-confirmed default and legacy fallback. Fast draft requests boxes for standard graphics while naming custom/per-image limits. Continue may retain a usable erroneous PDF, always labeled PDF with errors and never promoted to last successful. Stop/fatal/cancel falls back to the last successful PDF; the error notice offers Show last successful PDF when available. Ordinary and isolated Manual Type draft PDFs show their captured draft/error labels, while stale preview remains explicit.

Options are revision-checked per-project compiler settings, separate from source versions. Save applies to the next build, including the existing automatic-build policy; finished snapshots retain their captured choices. Failed/ambiguous saves preserve the choice draft for an idempotent retry; Refresh options updates the expected revision without overwriting those choices. Relevant fields/Save are disabled with an explanation while the assistant owns source, while generated-file reads remain available. Busy requests prevent dismissal; errors receive focus. Source, automatic history and chats stay unchanged by option saves and inspection. New/copy/template projects and template previews use default Normal + Stop; Manual Type previews inherit the current project's choices. Source/history exports do not capture these additional settings; saved main-document and engine behavior remains separate.

**The Captured Build Choices Rule.** Keep next-build options separate from immutable finished-build context; label draft and erroneous output explicitly and preserve last-successful recovery.

### Installed TeX Runtimes

Use the native TeX runtime select, its full wrapping installation path and direct explanatory text within Compile options. System follows the Mac's selected TeX installation when runtimes are refreshed; a named installed version pins that installation. Keep Refresh runtimes distinct from Refresh options: the former refreshes discovery, while both preserve the author's unsaved choices. The settings entry remains a named underlined TeX runtime and compile options action. Compiler choice stays explicit as pdfLaTeX, LaTeX (DVI → PS → PDF), XeLaTeX or LuaLaTeX.

An absent selection remains visible as Selected runtime · unavailable rather than silently changing selection. Missing installation/tools show a reason and a named recovery path: refresh, choose another installed version or install the named dependency outside the app, then refresh. Do not interpret the dependency guidance as automatic installation. Changed tool identity requires explicit recovery without engine/runtime substitution. Preserve choice drafts and focused failure text through revision conflicts or ambiguous saves. The persistent assistant-lock explanation remains visible while the body scrolls; it disables writes while still permitting metadata refresh.

Saved runtime settings apply to the next build and remain independent of source/history/chats. New/copy/template projects and template previews start with System; Manual Type previews inherit current project settings. Each finished build keeps its resolved runtime identity, path and fingerprint even after settings change. Show that captured runtime in PDF and replacement-preview notices, logs and generated-file context; expose the path as supporting context rather than claiming the current selection produced old output. Older builds explicitly say Runtime not recorded for this older build. New-job source/PDF navigation uses the captured installation, and a runtime mismatch participates in stale-preview signaling.

Keep Normal/draft and successful/erroneous PDF distinctions alongside runtime identity. A real fourth-pipeline PDF is compiled document content, while DVI/PostScript are literal generated outputs; neither the engine name nor a converter-stage log alone is a substitute for actual final output. Retain the earlier successful PDF when a later build fails or cancels. Separate replacement builds remain source/history-neutral until the author explicitly starts typing; runtime inspection does not authorize a generation or source mutation.

**The Explicit Runtime Rule.** Keep System versus a pinned installation, availability and recovery visible before saving; identify finished output by its captured runtime and never silently substitute an engine or installation.

### Generated-file Inspection and ZIP Review

The finished-build picker names timestamp, status, Normal/Fast draft and short build identity; context adds root, engine and source version or isolated preview, explains snapshot-versus-current-editor content and warns about incomplete unsuccessful builds. Loading, empty and no-match states are direct text. Initial inspection selects all generated files. Find filters path names without discarding selections; Select all includes the entire build's output, and Clear clears it. Selection count and total bytes remain visible above the scrolling rows. Flat rows separate the native Include output checkbox, wrapping inspect-name/size button and individually named download link with a (14px) line icon. Inspection uses a neutral selected fill, independently of export selection. Both generated and ZIP lists reveal (200) additional entries per action.

Text inspection is a strict, full read-only UTF-8 view without NUL, bounded to (512 KiB); binary, other-encoding and larger files show a reason and download guidance. Delayed text from an earlier selection/build cannot replace the current inspection. Changing build clears prior selection, source inclusion, text and ZIP state before loading the new snapshot. Refresh preserves still-available selected paths. Native modal labeling, Escape/focus return and accessible field/action names follow the shared dialog; this tool adds focus-visible outlines (2px with 2px offset) on buttons, links and native fields. Hover uses `selection`; the inverted primary action retains its accent and brightens. Disabled actions retain the shared (0.4) opacity.

**The Retained Build Selection Rule.** Keep search, selection actions and count outside the generated-row scroller, with build identity and Review ZIP reachable while literal file text is inspected.

Include this build's source snapshot adds that finished build's captured source/assets/folders, with count/size and explicit limits. Review ZIP lists exact selected entries and pre-compression bytes. Differing same-path source files appear in a bordered native fieldset; an initially unchecked Use the generated versions checkbox is required before preparation. Replacement affects only archive bytes, leaving project files/history/conversation unchanged. Changing selection or source inclusion invalidates the previous plan and consent. Stale content rejects preparation and returns to selection for a fresh review. ZIPs are bounded to (100 MiB), with (5,000 entries) per source/output group; these are operational limits, not density targets.

Prepare ZIP freezes the reviewed bytes and keeps the dialog open. A fixed status strip distinguishes ZIP prepared from Download requested. The connected native HTTP Download ZIP link retains Prepare ZIP again, Change selection and Close beside the review. Link activation asks the author to check browser downloads or retry; it does not assert a save. Links expire after (15 minutes) or restart and derived memory is bounded to (four archives / 200 MiB). The verified exact HTTP payload supports the endpoint/link, while browser-native delivery remains unobserved. Unsafe/changing file access and source/review metadata boundaries are recorded in verification rather than inferred from the interface.

**The Archive-only Replacement Rule.** Name every differing source/output path and require explicit consent before preparing replacement bytes inside a ZIP; keep the immutable build, review and recovery controls visible after preparation and request.

### Replacement Preview Build Recovery

Keep the editable proposed replacement and suggestions beside the separate PDF/result surface, beneath the source/history assurance. Inline status announces checking saved status, starting, running, uncertain, stopping, complete, failed or stopped. Once a job exists, its short build identity and engine stay visible; earlier replacement identifies output whose captured hash differs from current text. The status/result must remain truthful when a cancelled request has no job or a failed build has no PDF.

Retry preview status appears only for an uncertain result and retains the captured request and replacement. Stop preview build targets that preview, remains reachable during recovery and disables its repeated action while the compiler drains. Compile preview, revision and Start typing stay gated while status is busy or uncertain; Discard remains available and cancels the owned preview. Stopped acknowledgement retains the literal replacement, then exposes Compile preview and the explicit Start typing action once terminal. The ordinary compile Stop also stays reachable while AI preview owns source; it is distinct from preview cancellation and source insertion.

The corrected no-job terminal outcome says Preview build stopped · replacement kept. Stale output says This preview result is from an earlier replacement. Compile preview to check the current text. This wording applies even without a PDF; PDF-specific claims require an actual PDF. Existing draft/error/runtime notices remain attached to real compiled output. Source insertion begins only after the author chooses Start typing and the preview compiler has exited. Compile, status recovery and cancellation do not type source, create chat/history changes or make paid requests. Saved compile identity/status can be read after restart without recompile; unapproved edited replacement text and suggestions remain session-only.

**The Retained Preview Rule.** Keep the replacement, named build/status and explicit Stop/Retry inside the bounded review, with heading and approval/recovery actions reachable while the body scrolls; require an explicit Start typing after compiler drain.

**The Truthful Preview Result Rule.** Acknowledge confirmed cancellation even before a job exists, and describe an earlier preview result without claiming a PDF that the build did not produce.

## Do's and Don'ts

### Do:

- **Do** extend the incumbent compact neutral editor for local feature additions, preserving the owner's 简约风 direction.
- **Do** use the live theme's semantic CSS variables for surfaces, text, borders, focus and status.
- **Do** keep Destination full-width and consistent with the existing dialog text-field pattern.
- **Do** keep review paths readable, long lists scrollable and the final operation explicit.
- **Do** preserve visible keyboard focus, native control behavior and accessible icon names.
- **Do** distinguish captured visual evidence from behavior established by source or functional verification.
- **Do** keep spelling selection, independent LaTeX checks and personal-word management within the established native tool vocabulary.
- **Do** show source context and named correction choices, preserving Undo and stale-source checks.
- **Do** keep the active chat title, paging and composer reachable around the bounded transcript.
- **Do** reuse neutral reply formatting, wrapping source context and explicit per-turn review actions.
- **Do** keep prompt save status compact between the field and model controls, with an accessible empty description that takes no visible layout space.
- **Do** retain both literal competing prompts and stale/error feedback above fixed, separated Use saved draft / Save my draft choices.
- **Do** distinguish confirmed local prompt saves from pending text, keeping current source/model/scope outside draft metadata and generation explicit.
- **Do** keep table selection truthful after structure/history changes, with native controls and source review before one Apply.
- **Do** keep the complete raw draft copy and manual source disclosure reachable before a stale draft is closed or reloaded.
- **Do** preserve immediate supported paste and isolated Undo while requiring review for packages, detected losses and source-recovery choices.
- **Do** keep the captured paste target, selected/generated source disclosures and copy recovery reachable in both themes and read-only review.
- **Do** reuse Destination/replacement consent for clipboard images and explain the separate upload and source Undo paths.
- **Do** keep local discussion separate from LaTeX `%` toggling, with an explicit captured passage and truthful original-quote status.
- **Do** preserve per-message, per-thread and new-post drafts, showing saved-versus-draft comparison before explicit rebasing or retargeting.
- **Do** retain sticky thread return/reply controls and read-only inspection, with Alt+Enter and the Review list providing keyboard source access.
- **Do** keep Editing/Reviewing separate from AI Review Edits, with complete source, whole-passage selection and an explicit confirmation.
- **Do** preserve sticky confirmation, dedicated Undo last review, keyboard review access and read-only source inspection.
- **Do** record the tracking default as an implementation assumption and the fresh SHIP verdict as a verdict on its single scored fix.
- **Do** distinguish owner-confirmed default review-history capture from opt-in source tracking, and show With review or Source only availability explicitly.
- **Do** keep saved review read-only, exact restore scope and review counts visible, and newer-discussion recovery explained before confirmation.
- **Do** keep the stable history header, bounded source/archive regions, focused recovery feedback and reachable Confirm/Cancel actions in both themes.
- **Do** keep label filters, stable saved-version context, full wrapping names and Remove/Restore choices explicit in bounded flat lists.
- **Do** retain local label wording through conflicts and ambiguous responses, with named Refresh/Retry actions and read-only metadata refresh.
- **Do** preserve the intentional narrow (16px) history search/name input floor without redesigning the global compact type ramp.
- **Do** keep template provenance, frozen source, separate compilation and native entry/engine/name choices ahead of explicit creation.
- **Do** preserve bounded catalog/detail scrolling, visible focus and fixed capture/creation actions across both themes and narrow containment.
- **Do** retain template wording and the same request for ambiguous retries, with explicit Refresh and recoverable Trash.
- **Do** keep user-chosen tag color in small outlined markers beside readable names, with explicit archive/Trash and selection state.
- **Do** retain exact project targets, named busy-project feedback and a disabled confirmation until Refresh provides a valid review.
- **Do** preserve fixed library headings/action footers, grouped narrow RGB fields and the intentional (16px) edit-input floor.
- **Do** distinguish ZIP prepared from Download requested and retain the connected link, Prepare ZIP again, Refresh preview and Close.
- **Do** keep library metadata independent of source/history/chats and retain tag wording through conflicts or ambiguous retries.

- **Do** keep next-build settings, immutable build identity, explicit draft/error labels and last-successful recovery distinct.
- **Do** keep generated-file search, Select all/Clear and selected counts above the scrolling rows, with strict read-only text and final actions reachable.
- **Do** preserve native build fields and their intentional narrow (16px) floor, visible focus and retained choice drafts through Refresh/conflicts.
- **Do** review the selected build's source/output paths, require archive-only replacement consent and retain preparation/change/close controls after requesting a download.

- **Do** keep saved-chat scope, title/prompt/reply labels, literal marked excerpts, counts and named More/Retry controls visible within the flat sidebar list.
- **Do** retain readable archived excerpts, explicit Restore & open actions and exact-turn focus with one wrapping Earlier/Newer/Return to latest group.
- **Do** flush the current conversation draft before opening a match and preserve the intentional narrow (16px) search-input floor.

- **Do** retain the replacement/PDF hierarchy, named inline preview status and Stop/Retry with fixed heading/footer around the scrolling body.
- **Do** acknowledge a stopped preview without a job, label an earlier result truthfully and gate explicit Start typing until the compiler exits.
- **Do** preserve the local preview textarea (16px) narrow-input adaptation and readable (11px) logs without changing the global type ramp.

- **Do** keep System/pinned runtime, wrapping installation path and named Refresh runtimes recovery visible within the existing native dialog.
- **Do** retain assistant-lock guidance outside the scrolling body, with metadata refresh available and option writes explicitly disabled.
- **Do** label finished PDF, logs, generated files and isolated replacement output with their captured runtime, preserving draft/error and last-successful context.

- **Do** keep the actual diagnostic target, literal existing/prepared prompts and explicit Keep/Append/Replace choices visible before the separate Send action.
- **Do** retain the current conversation/scope, stale-source and assistant-lock guards, and named preparation/retry/cancel recovery.
- **Do** wrap complete diagnostic source labels and retain native review heading/actions outside the scrolling body, including the local (16px) narrow-field adaptation.

- **Do** use Leaf for current product identity, the recurring Lucide leaf/leaf. brand and the established l./L compact forms.
- **Do** start fresh preferences in the existing light palette while respecting saved light, dark or system choices.
- **Do** retain the existing assistant/provider/CLI controls, source-import attribution and compatible data/integration namespaces.

- **Do** keep source recovery findable through its persistent notice and File versions action, with the named file and both literal versions ahead of an explicit decision.
- **Do** retain candidate text, focused inline errors, download/refresh/later choices and native footer containment across stale reviews, storage failures and both themes.
- **Do** preserve project/file isolation, exact saved-draft consumption and the local (16px) narrow-textarea adaptation without adding a new global token.

- **Do** keep editor preference choices local until Save editor settings, with retained choices and an inline retry after failure.
- **Do** show Autosave off and a labeled Save beside source status in Manual mode, preserving recovery and preflight source saves.
- **Do** keep automatic save/build timing independent, stale-task and source-ownership guards intact, and the workflow selects’ narrow (16px) adaptation local.

- **Do** retain named project/query context, complete wrapping paths and explicit disabled reasons within the neutral native picker.
- **Do** keep the query as the arrows/Enter owner, the result scroller out of sequential Tab navigation, and Close/Escape restoration plus pending-navigation guards intact.
- **Do** keep heading/query/count/footer and sticky tab actions reachable, preserving the local narrow (16px) query floor without a new global token.

- **Do** retain the selected file, local tool/path, default-only policy and named Refresh/installation recovery before explicit Preview formatting.
- **Do** keep literal changes, complete read-only source, retained inline errors and Close/Stop/Apply reachable within the native bounded dialog.
- **Do** preserve captured-source/lock checks, one-edit Undo and the complete-source textarea's local narrow (16px) adaptation.

### Don't:

- **Don't** introduce a replacement visual identity or decorative accent palette in a local file-manager, writing-tool, chat or table extension.
- **Don't** turn ordinary review rows into competing raised cards.
- **Don't** replace path/status text or native controls with icon-only explanations.
- **Don't** multiply the shell's tiny tracked metadata into a new heading or component system.
- **Don't** treat narrow dialog captures as proof of a responsive mobile editor or future collaboration design.
- **Don't** treat narrow chat-pane containment or still captures as full-editor mobile, transient-state or motion certification.
- **Don't** silently merge or overwrite competing prompts, close comparison before a chosen save is confirmed or create a chat/session/source/history change from drafting alone.
- **Don't** promise abrupt-crash durability before a prompt save commits, treat a restored draft as saved model/source context or infer live-provider/full-parity certification from synthetic checks.
- **Don't** present the schematic table grid or width controls as a typeset preview, or conceal source-only boundaries.
- **Don't** treat the table fix verdict, contained narrow dialog or functional checks as whole-surface, mobile-editor or motion certification.
- **Don't** imply arbitrary HTML/CSS fidelity, automatically add/install packages or fetch remote clipboard images.
- **Don't** treat the clipboard's two-fix ship verdict, still captures or narrow containment as whole-app, mobile-editor, contrast or motion certification.
- **Don't** silently overwrite a local comment draft, treat escaped messages as Markdown or place hidden gutter buttons in the tab order.
- **Don't** imply that unsent comment drafts survive restart, local You-only comments provide hosted discussion or ordinary tracked changes, or narrow comments captures establish a mobile editor.
- **Don't** treat the comments SHIP verdict as visual certification of uncaptured lists, Trash, focused states, motion, computed contrast or unsampled backend branches.
- **Don't** silently accept pending changes when tracking is disabled, fragment coherent passages into repeated deletion widgets or hide complete removed source.
- **Don't** conflate source Undo with review-decision Undo or imply local You-only source review supplies hosted coauthor permissions or notifications.
- **Don't** treat tracking recaptures, degraded detector advisories or functional verification as whole-app, unsampled-branch, mobile-editor, computed-contrast or motion certification.
- **Don't** describe comments or pending baselines as excluded from history by default, roll current chats/mode back with a version or imply source ZIP exports carry review metadata.
- **Don't** conceal legacy/limit omissions, promise unlimited review recovery or move another file's discussion during a scoped restore.
- **Don't** treat the history documentation-fix review, contained narrow actions or recorded functional checks as whole-app approval, full Overleaf parity, computed-contrast or motion certification.
- **Don't** silently switch the selected version when filtering, encode label categories by decorative color, or make label edits mutate saved source/review/history.
- **Don't** discard a retained label draft on refresh, conflate recoverable removal with deleting a version, or imply open-dialog drafts survive restart.
- **Don't** treat the label SHIP review or degraded detector as whole-app, unsampled-branch, maximum-size, mobile-editor, computed-contrast or motion certification.
- **Don't** present generic built-ins as publisher/institution compliance, treat local snapshots as an online gallery or imply built-in plus personal was an owner-confirmed choice.
- **Don't** mutate template source through Edit details, copy discussion/history into a new project or automatically compile on selection.
- **Don't** revive the clipped narrow Save footer or treat the template SHIP verdict as whole-app, exhaustive accessibility, computed-contrast, motion or full Overleaf parity certification.
- **Don't** tint project/tag text or whole review surfaces with user tag colors, merge editable archive with recoverable Trash or remove captured targets after a failed preflight.
- **Don't** close download review on preparation/link activation, claim a saved file from Download requested or treat link expiry as loss of source.
- **Don't** treat the two-fix library ship verdict, eighteen valid captures or reported checks as whole-surface, native OS Save, computed-contrast or full parity certification.
- **Don't** present generated-file inspection as current-editor source, treat an erroneous PDF as successful or claim draft mode controls all custom graphics.
- **Don't** scroll selection counts away with file rows, silently reuse stale ZIP consent or make inspected output mutate project source/history/chats.
- **Don't** claim a browser-native save from the verified HTTP payload or treat the single-fix ship verdict, degraded detector or narrow containment as whole-surface, mobile-editor, contrast or full parity certification.
- **Don't** silently restore archived chats, search unsent drafts/source snapshots or make search and saved-hit navigation generate an AI request.
- **Don't** treat the chat-search ship review, contained (185px) sidebar or reported synthetic checks as complete mobile-editor, contrast, motion, live-provider or full-parity certification.
- **Don't** infer a PDF from a recovered failed build, discard retained replacement text on Stop or conflate saved compile status with persistence of unapproved edits/suggestions.
- **Don't** treat the preview's two-fix ship verdict, still captures or reported synthetic/real compiler checks as whole-app, motion, exhaustive accessibility, live-provider, abrupt-exit supervision or full-parity certification.
- **Don't** silently substitute a runtime/engine, hide an unavailable selection or turn dependency guidance into automatic installation.
- **Don't** treat the single-fix runtime ship verdict, one physical installation or normal converter cancellation as multi-version, backend-exit, live-provider, security-audit or whole-app certification.
- **Don't** silently replace an unsent prompt, fall back to an unrelated source or send a diagnostic request during preparation.
- **Don't** promote the inherited tiny diagnostic metadata into a new global type ramp or interpret a degraded static detector as computed-contrast certification.
- **Don't** treat the diagnostic-action ship verdict or contained narrow review as whole-app, mobile-editor, live-provider or full-parity certification.
- **Don't** turn the Leaf name or light-first default into a new green palette, a forced theme reset or a filesystem/data/CLI rename.
- **Don't** treat the identity ship review as full Leaf-plan, filesystem-safety, native-packaging, mobile-editor or live-provider certification.
- **Don't** update source merely by opening or refreshing a comparison, discard the candidate when choosing disk, or direct a live conflict away from Review file versions.
- **Don't** let an old project callback, journal response or hidden review lock affect the active project's source or recovery choices.
- **Don't** promote incidental compact recovery metadata into a new type system or treat this three-fix ship verdict as complete filesystem-watching, offline, native, mobile-editor or whole-app acceptance.
- **Don't** equate Manual mode with disabled draft recovery, apply preference previews immediately or make explicit compilation wait the automatic delay.
- **Don't** invent a pinned settings footer, promote tiny source-status metadata into a global type role or treat scoped timing/captures as full offline, filesystem, native or accessibility certification.
- **Don't** make quick-open bypass source-save/conflict/assistant guards or turn palette discovery into paid generation, destructive actions or arbitrary-folder discovery.
- **Don't** treat the one-fix quick-navigation ship verdict, still captures or degraded detector as whole-surface, mobile-editor, computed-contrast, exhaustive accessibility or live-provider certification.
- **Don't** start formatting on inspection, silently apply a result, honor undisclosed project/user YAML or replace missing-tool guidance with automatic installation.
- **Don't** hide the diff boundary, substitute a clipped source excerpt for either complete view or discard a candidate when Apply rejects a changed file.
- **Don't** treat deterministic fixture output as a style standard, the local (16px) textarea as a global token or this visual ship verdict as live-formatter/backend-security, whole-app, mobile-editor or exhaustive accessibility certification.
