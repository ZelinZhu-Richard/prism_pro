---
name: Prism Local
description: A restrained local LaTeX writing workspace with reviewed file operations, writing checks, durable conversations, source-preserving table drafts, reversible clipboard choices, local source-anchored discussion and exact local source review.
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
---

# Design System: Prism Local

## Overview

**Creative North Star: "Prism's compact neutral editor"**

Prism Local follows the owner's confirmed 简约风 direction and familiar Prism-style main page and editor. Its established visual character is quiet, compact and practical: neutral writing surfaces, fine separators, small line icons and clear actions leave the document at the center. This records the incumbent world; it does not establish a replacement identity.

The file-manager extension carries that character into upload, move, Trash and restore review. A centered dialog presents context, destination or affected paths, then a named action. Writing checks extends the same tool vocabulary with bundled English (US/UK) spelling, independent LaTeX hints and personal words: active-file context precedes inspectable findings and explicit corrections. Saved chats continue it through named conversation rows, a bounded reading area and compact source/review controls. Existing-table drafts extend the same vocabulary through a schematic source grid, native structure controls and review before one reversible Apply. Clipboard choices reuse that vocabulary through a captured target, native format choices, bounded content/source inspection and a reachable paste/recovery footer. Local comments continue it through the Review sidebar, original source quotes, rule-separated plain-text messages and reachable thread/reply controls. Ordinary source review extends that sidebar through complete removed/added passages, native selection and a reachable explicit decision. Local-first editing is the current product context; this document does not define the appearance of future hosted collaboration.

**Key Characteristics:**

- Neutral dark and light themes with inverted primary actions.
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

This is a source-backed record of `src/styles.css`, the shared modal and the delivered file-manager components named in the `FILE-BATCHES-2026` contract in `index.html`. Visual references are `docs/screenshots/prism-reference-review-dark.png` and `prism-reference-review-light.png`; current captures are `.impeccable/review/desktop.png`, `user-997.png`, `mobile.png`, `restore-light.png` and `restore-mobile.png`. These establish the captured dialog compositions, not a certification of unrelated editor, home or collaboration flows. The mobile media was proportionally scaled from a configured viewport (560 × 850); it must not be treated as a different responsive breakpoint.

The `WRITING-CHECKS-2026` extension is recorded from `src/components/WritingChecksPanel.tsx`, its stylesheet rules and the sampled App/Editor integration. Reviewed captures are `.impeccable/review/writing/desktop.jpg`, `user-997.jpg`, `mobile.jpg`, `dictionary-light.jpg` and `dictionary-mobile-light.jpg`. The narrow capture (553 × 839) is proportional media from the configured (560 × 850) viewport. The finish review found the captured compositions consistent with this incumbent world; its follow-up ship verdict covers the PRODUCT.md correction only. Loading, error, off, excluded, focused and scrolled states were not captured, so their visual finish is not certified by this record.

The `CHAT-2026` extension is recorded from `src/components/ConversationList.tsx`, `ChatTranscript.tsx`, `ChatMarkdown.tsx`, the stylesheet's chat rules and sampled App integration. Reviewed captures in `.impeccable/review/chat/` are `desktop.jpg` (1440 × 1000), `user-997.jpg`, `light.jpg` and `failure-light.jpg` (997 × 833), plus `mobile.jpg` (553 × 839, proportionally captured from a configured 560 × 850 viewport). The finish review's ship disposition covers these captured compositions and the sampled extension: the saved-chat sidebar, active title, paging above an internally scrolled transcript, existing composer, reply formatting and saved partial failure. Tables, complete long code blocks, open source disclosures, proposal review and transient/focused states are source-backed rather than visually certified by these stills. Motion is not certified by still captures.

The `TABLE-EDITING-2026` extension is recorded from `src/components/TableEditor.tsx`, `src/table-source.ts`, the table/insertion rules in `src/styles.css` and the sampled `src/visual-editor.ts` and App open/apply/modal integration. Canonical final captures in `.impeccable/review/tables/` are `desktop-dark.jpg`, `desktop-light.jpg`, `desktop-dark-readonly.jpg`, `user-997-dark.jpg`, `user-997-stale.jpg`, `user-997-source-fallback.jpg` and `narrow-light-error.jpg`. They establish the captured neutral dialog, merged selection, read-only, stale-source, source-only and validation compositions. All use embedded synthetic provenance. The configured narrow viewport (560 × 850) produced proportional media (553 × 839); this establishes contained dialog content inside the incumbent desktop shell, not a mobile editor. Superseded `round1*` captures are not canonical evidence.

The table finish verdict resolves the two requested corrections: selection now follows the intended logical cell after merge/unmerge/history changes, and stale recovery exposes a complete raw draft copy before close/reload. Its ship disposition covers those scored fixes, not whole-surface or whole-app certification. Functional verification records (325 passing tests including ten new table tests, the build, three compiled synthetic fixtures, one browser Apply/compile, stale-source rejection, byte-exact Undo/restart and synthetic Manual Type locking) support behavior rather than visual claims. The one static detector pass used a degraded fallback because optional HTML parser modules were unavailable; its inherited wider-file findings do not certify this surface. No second detector or URL detector was run. Uncaptured states and motion remain uncertified; no private paper or paid provider was used. See `docs/verification/table-editor.md` for the evidence boundaries.

The `CLIPBOARD-2026` extension is recorded from `src/components/ClipboardPaste.tsx`, `src/prepare-clipboard.ts`, `src/editor-clipboard.ts`, `src/visual-clipboard.ts`, `src/rich-clipboard.ts`, the clipboard/insertion stylesheet rules and the sampled SourceToolbar, EditorSettings, UploadFiles, Editor and App integration. Canonical final captures in `.impeccable/review/clipboard/` are `round2-desktop-dark.jpg`, `round2-desktop-dark-readonly.jpg`, `round2-desktop-light.jpg`, `round2-user-image.jpg`, `round2-user-replacement.jpg`, `round2-narrow-light-warning.jpg`, `round2-narrow-light-stale.jpg`, `round2-narrow-light-expired.jpg`, `fix-package-review.jpg` and `fix-format-loss-review.jpg`. Desktop media is (1440 × 1000), user-sized media is (997 × 833), and configured narrow (560 × 850) captures produce proportional rasters (553 × 839). These provenance-bearing synthetic captures establish the shown preview, read-only, image/replacement, warning, stale and expired-source compositions within the incumbent desktop shell. The resize-transition image was replaced; `round1*` media is superseded.

The clipboard finish verdict in `.impeccable/review/clipboard/finish-verdict.md` resolves package-dependent default routing/notice and detected formatting-loss disclosure. Its ship disposition covers those two scored fixes, not whole-surface or whole-app certification. `docs/verification/clipboard.md` records (348 passing deterministic tests), the production build, five real confined compile cases, native paste/Undo, package/loss review with the preview preference off, image consent, stale/expired-source recovery and cross-view locking. These support behavior separately from the captured visual evidence. One static detector pass was degraded to regex because its optional parser modules were unavailable; no rerun or URL detector was run, and this does not certify computed contrast. Motion and uncaptured states remain outside the still-image evidence. No paid request, private paper or owner's port (4317) server change was used.

The `COMMENTS-2026` extension is recorded from `src/components/CommentsPanel.tsx`, `src/comment-markers.ts`, `src/use-comments.ts`, the comments rules in `src/styles.css` and the sampled App, Editor and SourceToolbar integration. Canonical final captures in `.impeccable/review/comments/` are `round2-desktop-dark-thread.jpg` and `round2-desktop-light-readonly.jpg` (1440 × 1000), `round2-user-comparison.jpg` (997 × 833), plus `round2-narrow-comparison.jpg`, `round2-narrow-thread.jpg` and `round2-narrow-stale-draft.jpg` (553 × 839 from a configured 560 × 850 viewport). `docs/screenshots/prism-comments-dark.jpg` and `prism-comments-light.jpg` are the final documentation copies. All carry embedded synthetic provenance. Superseded `round1*` captures are not canonical evidence.

The full comments finish review in `.impeccable/review/comments/finish-verdict.md` returned SHIP for all six final captures and the sampled implementation, with no material fixes requested. This establishes the shown thread, read-only, saved-versus-draft comparison, sticky navigation/reply and retained stale-new-draft compositions. Lists, Trash, focused states, motion and unsampled backend branches are not visually certified. The narrow images retain the incumbent desktop horizontal-overflow layout; they do not establish a mobile editor. `docs/verification/comments.md` records (361 passing deterministic tests), the production build and three real confined pdfLaTeX builds with identical extracted PDF text, alongside source/history isolation, retry/conflict recovery, restart, cross-file, keyboard and synthetic Manual Type checks. Those results support behavior separately from visual evidence. The once-only changed-target detector degraded to regex because its optional parsers were unavailable, reporting (106 findings: six warnings and 100 advisories), mostly inherited shared-stylesheet choices. It did not evaluate computed contrast; no URL detector was run. Only synthetic fixtures were used, with no paid request or private paper.

The `TRACKING-2026` extension follows the first body contract in `index.html` and current `PRODUCT.md`, recorded from `src/components/TrackingPanel.tsx`, `src/tracking-markers.ts`, `src/use-tracking.ts`, `shared/tracking.ts`, the tracking stylesheet region beginning at (5423), and sampled App/Editor integration. Canonical final captures in `.impeccable/review/tracking/` are `fix1-desktop-dark-confirm.jpg`, `fix1-desktop-light-readonly.jpg`, `fix1-desktop-stale.jpg` and `fix1-desktop-visual-paused.jpg` (1440 × 1000), `fix1-user-confirm.jpg` (997 × 833) and `fix1-narrow-confirm.jpg` (553 × 839 from a configured 560 × 850 viewport). The final documentation copies are `docs/screenshots/prism-tracking-dark.jpg` and `prism-tracking-light.jpg`. All six final captures were opened and are valid; the provenance scan found embedded provenance on all (19 rasters, zero missing). Earlier `round1*` and `round2*` tracking captures are superseded.

The fresh full tracking finish review in `.impeccable/review/tracking/finish-verdict.md` found the six captured compositions consistent with the incumbent neutral world and requested one FORM performance correction. The same reviewer then scored that correction resolved and returned SHIP for the scored fix: a monotonic newline cursor replaces repeated full-prefix line scans, with fallback rewind handled. The recorded (1,902,890-byte) fixture checks (1,000) positions, fallback line accuracy and exact Reject reconstruction; line counting took (7.78ms). Its actual bounded diff used the exact grouped fallback, so this is not a claim that (1,000) detailed hunks finish within the diff budget. All six recaptures showed no visible regression from this fix. The verdict does not certify the whole application, unsampled App/Editor/backend branches, uncaptured states, computed contrast or motion.

`docs/verification/tracking.md` records (374 deterministic tests), the production build and five real confined pdfLaTeX builds after the correction. Extracted PDF text matches original/rejected source and separately tracked/accepted/Undo Reject source. The final source audit found both original files byte-exact and zero pending files; three local stub turns in the same conversation ended completed/stopped/stopped. These are recorded behavioral results, not checks rerun by the documenter. No paid request or private paper was used. The once-only static detector degraded to regex because optional parsers were unavailable, returning zero errors, six warnings and 100 inherited advisories outside the new tracking-style region; this undercount does not establish computed contrast or a new design rule, and no URL detector ran. Narrow captures retain the incumbent desktop horizontal overflow, not a mobile editor.

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

Table cells reuse `selection` and an inset `focus` outline for selection; numbered headers and compact structure actions use `panel-raised`, and explanatory/selection text uses `muted`. Source disclosures use `bg`. Draft diffs reuse the existing paired `diff-add-*` and `diff-remove-*` CSS variables, reinforced by visible plus/minus prefixes. These specialized revision colors remain in the stylesheet rather than becoming a table-specific palette.

Clipboard review reuses `panel` for the dialog and opaque footer, `control` for the content/table boundaries and `bg` with `muted` for source disclosures. Native format radios use `text` as their accent. Conversion-loss lists use `warning`, while failed paste/stale-source alerts use `danger`; package requirements retain the existing supporting-copy treatment. Read-only is explained in text alongside disabled actions. No clipboard-specific palette is introduced.

Comments reuse primary text for messages and muted text for locations, dates, notices and secondary actions. Original passages and current-saved conflict bodies sit on `bg`; message separators use `border`, while list hover uses `panel-raised`. Source passages receive a dotted `focus` underline and the gutter marker uses the same focus tone. Errors use `danger`; changed/removed passage and read-only states are explained in text. No comment-specific palette or author color is introduced.

Tracking reuses `control` for the active Comments/Changes choice and native scope/file fields, `panel` for the opaque confirmation ground and `bg` for complete source disclosures. Inserted source has a double `focus` underline; removed source uses a line-through and an explicit Removed label, with a compact neutral Deletion widget at the source location. Read-only and stale states are explained in text rather than author colors or a new revision palette.

The frontmatter records theme values as `dark-*` and `light-*` because the portable token schema has no theme switch. At runtime, use the existing unprefixed CSS custom properties: `:root` supplies dark mode and `:root[data-theme="light"]` supplies light mode. The component examples default to dark references; shared CSS variables select the live theme.

**The Neutral Actions Rule.** Keep primary operations neutral and inverted; use semantic color to explain state rather than recolor the entire review surface.

## Typography

**Interface Font:** Inter with the platform sans-serif fallbacks recorded above. This is the declared stack; it does not imply that a bundled Inter font is available on every machine.

**Code Font:** SFMono-Regular, Consolas and monospace for reference diffs and chat source/plain text. Source-editor typography is configurable and is not fixed by these tool tokens. Document content and PDF typography follow the author's document; locally rendered chat math uses KaTeX's bundled math faces.

The interface uses a compact utility hierarchy rather than a marketing display scale. Modal titles use `title`; descriptions and path-review rows use `body`; field labels, file navigation and secondary actions use `label`; primary actions use `action`. Upload target names use medium weight (500) with status beneath them at the smaller label size and a line-height of (1.5). Move-dialog introductions are slightly larger (13px) with a line-height of (1.6).

The writing panel uses the existing body size and line-height (12px / 1.6), with line/type metadata and the collapsed help summary at (11px). Its fields retain the shared field-label treatment. Incumbent `.field-help` text is (10px / 1.7); this is existing supporting-copy styling, not a new general body-size recommendation.

Chat replies use `reply`, with a reading measure capped at (75ch). Markdown headings share `reply-title`, keeping content hierarchy within the tool rather than adding a display scale. Prompts retain `body`; provider/status, source context, paging and copy controls use `label`. Fenced source uses `chat-code`; plain text uses the same family and size with the reply line-height. Saved-chat titles use `label`; the incumbent date/turn-count metadata remains (9px) and is not a new general metadata recommendation.

Table cell content and cell/caption editing use the existing monospace family at the tool body size (12px); the editable textarea and source disclosures use a line-height of (1.6). Numbered grid headers retain the compact label size (11px) and medium weight (500). Grid coordinates and selection use tabular numerals. This is literal LaTeX source, while widths and typeset appearance are explained as compiled-PDF behavior. It introduces no display face or new general type scale.

Clipboard review uses the existing tool body size (12px). Its projected content and warning lists use a line-height of (1.7); preview headings are compact semibold content headings (16px / 600), while preview code and source disclosures use the incumbent monospace family at (12px). Source disclosures retain the insertion-tool line-height (1.6). Package/image setup notes use the existing small supporting-copy style, not a new type role. The projection can expose literal LaTeX for unsupported source; it is content inspection rather than a compiled-PDF preview.

Avoid promoting the incumbent tiny, tracked shell metadata into a general heading or label system. The file-manager extension uses sentence-case titles and direct operation labels. Long paths wrap in review lists; compact sidebar filenames truncate with ellipsis.

Comments reuse `reply` for plain message prose and native textarea content. The thread/new-comment heading uses the existing compact content-heading treatment (14px / 600); the panel heading is (12px / 600). Locations, field labels, dates, Updated and secondary message actions use `label`. Original source quotes reuse `code`; they wrap with preserved whitespace. Saved-versus-draft comparison labels remain ordinary compact bold text. There is no comment display scale or decorated author identity.

Tracking uses `body` for notices and confirmation copy, `label` for mode/navigation, selection, source summaries and compact actions, and a compact confirmation heading (12px). Complete removed/added source uses the configurable editor font at (12px / 1.6), retaining whitespace and wrapping long source; it is not fixed to the interface or chat-code face.

## Layout

The incumbent desktop workspace has a header, a compact left file sidebar and adjacent source/PDF panes. Pane dividers, not oversized gutters, organize the writing area. Editing and preview containers have gently rounded edges; toolbars are dense and horizontally aligned.

The base dialog is centered, padded with the `dialog` spacing token, limited to (85vh) and constrained to the viewport minus (40px). Its ordinary width is (460px); the wide reference-review variant is (850px). File-batch dialogs request the frontmatter's batch width; the shared maximum-width constraint still applies. Keep the heading and close action together, then context, fields/review content and footer actions.

Upload choice controls wrap inside a centered dashed drop region. Summary controls also wrap. Batch lists scroll independently at a maximum of `min(300px, 32vh)`; move paths use a two-column source/destination grid with an arrow between them. Review paths can break anywhere. Trash and restore use the same path-list vocabulary. Review footers are sticky within the modal with a panel-colored ground, so scrolled content does not compete with the action.

At the captured desktop (1440 × 1000), user-sized (997 × 833) and configured narrow (560 × 850) viewports, the upload and restore dialogs fit the available width. This extension does not redesign the editor behind them: below (800px), the incumbent shell keeps a minimum width (650px), and the workbench keeps a minimum width (520px). Preserve that documented scope boundary; these captures do not establish a fully mobile editor.

The existing shell also has density adjustments below (1050px) and above (1500px). These belong to the incumbent editor, not a newly invented dialog breakpoint system.

Writing checks requests a (760px) centered dialog and inherits the shared viewport and height limits, padding, backdrop and native scrolling. Dictionary selection and the independent LaTeX checkbox use a two-column layout, followed by a wrapping active-file/exclusion row and adjacent tool tabs. Below (600px), the options stack and the findings maximum reduces from `min(360px, 38vh)` to (30vh). The findings and personal-word lists have their own vertical scroll regions; personal words are limited to (220px) high. Status, retry, filter and text-action groups wrap, and paths/excerpts can break anywhere. Native outer-dialog scrolling keeps lower narrow actions reachable. The editor behind the dialog retains its incumbent (650px) minimum width; these captures establish a bounded writing tool, not a fully mobile editor.

Chats use the existing left sidebar: title search and archive/refresh controls precede a separately scrolling list. Named rows wrap their titles and reserve inline space for compact rename/archive actions. The assistant header truncates a long active title while its expand, browse and new controls retain their space. History count and Earlier/Newer controls form a nonshrinking, wrapping strip above the independently scrolling transcript; Latest messages sits between that region and the existing composer. Internal transcript scrolling is the intended reading topology. Turns are separated by rules and the standard spacing rhythm, not repeated elevated cards.

Chat content wraps prose and source paths; tables, fenced code and display math scroll within their own bounds. No new chat breakpoint is introduced. The narrow capture establishes chat-pane containment within the incumbent shell; the shell's (650px) minimum width and horizontal clipping remain. It does not establish a responsive mobile editor.

Existing-table editing reuses the wide shared dialog (850px) and viewport/height constraints. Its heading is a separate bordered strip; the inner tool scrolls within `calc(85vh - 86px)` with horizontal padding (24px) and bottom padding (20px). The schematic grid has its own two-axis scroll region capped at (280px), with a stronger control border and no forced cell compression. Numbered rows/columns and the current selection precede wrapping selection actions and native row/column selects. Column settings wrap as groups with a basis of (180px); no new table breakpoint is introduced.

The local cell/caption textarea appears below those controls and can resize vertically. Source disclosures follow notices/errors, each with bounded scrolling content (260px maximum). The footer remains sticky within the inner scroll region, uses an opaque panel ground and a fine top rule, and wraps its copy/recovery group and primary Apply action. Scroll padding and the error's scroll margin reserve room around that footer. Keep complete draft recovery and the final action reachable when content grows or a narrow error wraps; retain the existing desktop shell boundary.

Clipboard review reuses the wide shared dialog (850px), with its heading/Close strip outside the independently scrolling body. The inner body is bounded by `calc(85vh - 86px)`, uses horizontal padding (24px), bottom padding (20px) and scroll padding (16px above / 90px below). Native format choices wrap with row/column gaps (12px / 20px). The projected content scrolls at a maximum height (270px), and generated/selected-source disclosures scroll at (220px). Preserve the stronger content border and wrapping source rather than letting long content widen the dialog.

The clipboard footer wraps its recovery group and inverted action over an opaque panel ground and top rule, remaining sticky inside the body. Image previews contain the local bitmap within a maximum height (220px). Image fields wrap with a basis (180px) and gap (16px); the nested upload review keeps the existing full-width Destination field and flat path list. There is no new clipboard breakpoint. Narrow captures establish contained dialogs and reachable choices/footer inside the existing desktop shell, not a responsive mobile editor.

Comments occupy the existing left sidebar under Review, alongside Files and Chats. The fixed panel-heading row contains refresh/add icon controls; notices and errors precede the independently scrolling body. The body has standard padding (12px) and scroll padding (44px above / 16px below). In a thread, All comments stays sticky at the top (−12px) on an opaque panel ground with a fine bottom rule. The Reply form stays sticky at the end of the thread (bottom −12px), with matching ground, a fine top rule and vertical padding (12px). Preserve both return and posting access as the message column grows. The unrelated sidebar footer is hidden while Review is active.

The comments list uses wrapping native status/scope selects and flat, full-width rows; summaries are bounded to (50 per page) with a wrapping paging strip. Thread paths and plain message bodies break anywhere when necessary. Original-quote and saved-conflict bodies scroll at a maximum (160px); textareas resize vertically between (78px) and (300px). Source underlines merge overlapping ranges rather than stacking decorations. No comments breakpoint is introduced: narrow captures retain the desktop shell's horizontal overflow and do not establish mobile-editor behavior.

Source review adds no breakpoint. Editing/Reviewing sits beside Code/Visual as a native compact select, capped at (105px). Review has a separate Comments/Changes row with compact rounded choices above the existing panel heading. Changes keeps an independently scrolling body with standard padding (12px) and scroll padding (16px). Scope and optional file selects fill the sidebar width; selection controls stack, action groups wrap and paths break anywhere. Passage articles are flat and rule-separated with vertical padding (14px).

Removed and Added are initially open native disclosures. Their complete, focusable source bodies wrap and scroll at a maximum height (180px), keeping large passages inspectable without widening the sidebar. Confirmation stays inline in that same body, sticky at top (−12px), on an opaque panel ground with fine horizontal rules and vertical padding (12px). Preserve reachable Confirm Accept/Reject and Cancel as the author scrolls; this is a sidebar decision, not a new modal or raised card. Narrow captures retain the incumbent desktop shell's horizontal overflow.

## Elevation & Depth

Flat tonal layers and thin borders provide most of the structure. Real elevation is reserved for overlays and paper, rather than repeated cards inside the file workflow. Dialogs and menus use the shared overlay shadow; the PDF page has a smaller paper shadow. Exact shadow and backdrop values are in the sidecar because they are outside the frontmatter schema.

Native modal backdrops dim the editor, preserving recognizable context while giving the operation priority. Dialog grounds remain opaque. Light mode has a gentler shadow, while dark mode relies more heavily on the panel boundary and backdrop.

## Shapes

The form language uses restrained curves: small rows and utility controls, medium field and action corners, softly rounded editor panes, and a larger shared dialog corner. Use the frontmatter's existing radius roles rather than adding pills or an unrelated card style. Borders are generally thin (1px); the upload area uses a dashed border to identify its drop affordance.

Lucide icons use a consistent outline vocabulary. File and folder markers are commonly (14px); progress icons are (15px), the close icon is (19px), and the upload-region icon is (22px). Preserve native selection controls rather than replacing them with decorative glyphs.

The table grid keeps square, collapsed cell boundaries inside the shared rounded dialog. Selected cells use an inset focus stroke, while the cell buttons remain borderless and square. Compact table actions reuse the small radius; full-width native fields retain the existing field corners. The grid is a source-editing tool, so its cell boundaries are independent of the author's chosen PDF border preset.

## Components

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

The Chats tab uses the existing sidebar navigation. A labeled native title-search field leads into archive count and refresh actions, then recent named conversation rows with a Lucide message marker and date/turn count. Selection uses a quiet tonal fill. Rename opens a native inline input with labeled save/cancel icon controls; archive and restore reuse the same compact actions. These controls remain explicit rather than depending on hover alone. Search-empty, archived-empty and operation-error messages are source-backed states; their uncaptured visual finish is not established here.

### Assistant Transcript

The active conversation title anchors the assistant header beside expand/compact, browse and new-chat icon controls. A saved-turn count and chronological paging controls remain above the reading region; pages contain up to 20 saved turns. A turn starts with the author label and reuse-prompt action, followed by a softly filled prompt, model/provider/status metadata and a native source-context disclosure. Source paths wrap and use underlined, labeled actions. Paging limits and action behavior are source-backed, not inferred from their still appearance.

Replies retain document structure with paragraphs, compact headings, lists, quotes and ruled tables. Fenced code has a bordered control-radius frame, quiet language/copy header and monospaced scrolling content. Local KaTeX renders inline/display equations; unrenderable math falls back to readable source. Reply copy and plain-text/formatted controls are compact text actions with line icons where present. Sanitized provider errors follow preserved reply text using the semantic error role; the saved light-theme failure capture establishes that composition. Raw HTML and remote images are omitted by the renderer; those restrictions are source behavior, not a visual material rule.

Per-turn proposals reuse the bordered, flat review vocabulary: file count/status and summary precede Review changes or View changes. The existing shared modal and revision-bound review flow remain authoritative. Prompt reuse, source opening, archive recovery, proposal actions and partial-run handling are supported by sampled source and functional verification; the captures do not certify every resulting state. Keep the existing composer below the transcript and reuse its established editing-mode and provider controls.

**The Reachable History Rule.** Keep conversation identity and chronological paging outside the scrolling reply region, with the existing composer reachable below it; contain long code, math and tables within the reply.

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

Comment actions leave source bytes, source Undo and document history unchanged; this is local You-only discussion metadata, separate from hosted/shared comments and ordinary tracked changes. Those persistence/isolation boundaries are source and functional evidence, not additional visual tokens. Keep original context, safe recovery and mutation locks visible where they affect an author's next action.

**The Anchored Discussion Rule.** Keep original source context and changed/removed status truthful, preserve local wording across navigation or conflicts, and require an explicit retarget or saved-thread rebase before a stale draft is posted.

**The Reachable Thread Rule.** Keep thread return navigation and the end-of-thread reply reachable within the scrolling Review sidebar; retain read-only inspection and accessible source navigation while mutations are locked.

### Ordinary Source Review

The native Editing/Reviewing source-mode picker is distinct from the assistant's Review Edits proposal mode. Reviewing is explicit per-project opt-in; that default is a recorded implementation assumption after an unanswered question, not an owner-confirmed preference. Mode and pending passages persist. Changing back to Editing does not silently accept pending work: disjoint new edits become accepted text, while edits touching a pending passage continue its review. Keep the visible mode notice and current-text compile/export notice ahead of review choices.

Review → Changes uses native Current file/Whole project scope and, for project scope, a native file picker. The latter chooses one file to inspect; a decision remains confined to that file. Flat passage rows show a native checkbox, Change/line label, accessible Go to source passage action and complete Removed/Added disclosures with character counts. Each passage has Accept/Reject. Selection offers Select all in file and Use editor selection: an intersecting selection includes each whole coherent passage, rather than claiming to accept an arbitrary subrange. Pure deletions remain reachable through the list and whole-file selection. Nearby edits separated by at most (12 unchanged UTF-16 units) with no newline are grouped; large rewrites retain exact complete source as one explicitly grouped change rather than multiplying tiny fragments or deletion widgets.

Accept selected, Reject selected and per-passage actions first open the inline confirmation. Confirm Accept keeps current source and removes the marks; Confirm Reject restores removed source and removes insertions. Cancel is explicit. Keep the captured decision visible when the exact source, project review revision or hunk-layout token changes: confirmation becomes disabled with a stale-source notice until the author refreshes and chooses again. Complete old source stays in Review, while Code and Visual show double-underlined inserted source and one compact Deletion widget per coherent removed passage. Widgets have no hidden tab stop (`tabIndex=-1`); Alt+Shift+Enter at the passage and the accessible Review list provide equivalent keyboard access in both modes.

AI/file-operation ownership disables mode changes, review selection/mutations and dedicated review Undo, with a visible read-only explanation. Source remains selectable and inspection, scrolling, Review navigation and other-file access remain available. The editor's read-only transaction filter enforces source ownership; an editable DOM attribute alone does not establish permission. Loading, errors with Refresh review, no open text file, no pending changes and file-in-Trash restoration notices remain explicit source-backed states, whose uncaptured visual finish is outside the still review.

Undo last review is a dedicated persisted decision recovery, guarded by exact source/revision/baseline checks; later edits may invalidate it. Ordinary source Undo remains separate. Current text compiles and exports; project copies contain current text with fresh, disabled tracking. Review metadata never becomes LaTeX and stays outside source history except when Reject writes an ordinary source change. New-file creation and file deletion remain file-history/Trash operations. Existing-text changes, including applied AI changes and history restores, participate in tracking. Keep this single-user local workflow separate from hosted coauthor identity, permissions and notifications.

**The Exact Passage Review Rule.** Keep complete before/after source and coherent whole-passage selection ahead of an explicit revision-bound Accept/Reject confirmation; never silently accept pending work when Reviewing is turned off.

**The Reachable Decision Rule.** Keep confirmation, Cancel and complete source inspection reachable inside the scrolling Changes sidebar, with keyboard source access and truthful read-only/stale gating.

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

### Don't:

- **Don't** introduce a replacement visual identity or decorative accent palette in a local file-manager, writing-tool, chat or table extension.
- **Don't** turn ordinary review rows into competing raised cards.
- **Don't** replace path/status text or native controls with icon-only explanations.
- **Don't** multiply the shell's tiny tracked metadata into a new heading or component system.
- **Don't** treat narrow dialog captures as proof of a responsive mobile editor or future collaboration design.
- **Don't** treat narrow chat-pane containment or still captures as full-editor mobile, transient-state or motion certification.
- **Don't** present the schematic table grid or width controls as a typeset preview, or conceal source-only boundaries.
- **Don't** treat the table fix verdict, contained narrow dialog or functional checks as whole-surface, mobile-editor or motion certification.
- **Don't** imply arbitrary HTML/CSS fidelity, automatically add/install packages or fetch remote clipboard images.
- **Don't** treat the clipboard's two-fix ship verdict, still captures or narrow containment as whole-app, mobile-editor, contrast or motion certification.
- **Don't** silently overwrite a local comment draft, treat escaped messages as Markdown or place hidden gutter buttons in the tab order.
- **Don't** imply that unsent drafts survive restart, local You-only comments provide hosted discussion or ordinary tracked changes, or narrow comments captures establish a mobile editor.
- **Don't** treat the comments SHIP verdict as visual certification of uncaptured lists, Trash, focused states, motion, computed contrast or unsampled backend branches.
- **Don't** silently accept pending changes when tracking is disabled, fragment coherent passages into repeated deletion widgets or hide complete removed source.
- **Don't** conflate source Undo with review-decision Undo or imply local You-only source review supplies hosted coauthor permissions or notifications.
- **Don't** treat tracking recaptures, degraded detector advisories or functional verification as whole-app, unsampled-branch, mobile-editor, computed-contrast or motion certification.
