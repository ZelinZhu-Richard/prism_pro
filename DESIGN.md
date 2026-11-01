---
name: Prism Local
description: A restrained local LaTeX writing workspace with reviewed file operations.
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
---

# Design System: Prism Local

## Overview

**Creative North Star: "Prism's compact neutral editor"**

Prism Local follows the owner's confirmed 简约风 direction and familiar Prism-style main page and editor. Its established visual character is quiet, compact and practical: neutral writing surfaces, fine separators, small line icons and clear actions leave the document at the center. This records the incumbent world; it does not establish a replacement identity.

The file-manager extension carries that character into upload, move, Trash and restore review. A centered dialog presents context, destination or affected paths, then a named action. Local-first editing is the current product context; this document does not define the appearance of future hosted collaboration.

**Key Characteristics:**

- Neutral dark and light themes with inverted primary actions.
- Compact toolbars and file navigation; more breathing room inside review dialogs.
- Native inputs, selects, checkboxes and dialogs with visible keyboard focus.
- Lucide line icons paired with labels, paths or accessible names.
- Reviewable path lists, explicit operation states and recoverable file changes.

This is a source-backed record of `src/styles.css`, the shared modal and the delivered file-manager components named in the `FILE-BATCHES-2026` contract in `index.html`. Visual references are `docs/screenshots/prism-reference-review-dark.png` and `prism-reference-review-light.png`; current captures are `.impeccable/review/desktop.png`, `user-997.png`, `mobile.png`, `restore-light.png` and `restore-mobile.png`. These establish the captured dialog compositions, not a certification of unrelated editor, home or collaboration flows. The mobile media was proportionally scaled from a configured viewport (560 × 850); it must not be treated as a different responsive breakpoint.

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

The frontmatter records theme values as `dark-*` and `light-*` because the portable token schema has no theme switch. At runtime, use the existing unprefixed CSS custom properties: `:root` supplies dark mode and `:root[data-theme="light"]` supplies light mode. The component examples default to dark references; shared CSS variables select the live theme.

**The Neutral Actions Rule.** Keep primary operations neutral and inverted; use semantic color to explain state rather than recolor the entire review surface.

## Typography

**Interface Font:** Inter with the platform sans-serif fallbacks recorded above. This is the declared stack; it does not imply that a bundled Inter font is available on every machine.

**Code Font:** SFMono-Regular, Consolas and monospace for reference diffs. Source-editor typography is configurable and is not fixed by these dialog tokens. Document content and PDF typography follow the author's document.

The interface uses a compact utility hierarchy rather than a marketing display scale. Modal titles use `title`; descriptions and path-review rows use `body`; field labels, file navigation and secondary actions use `label`; primary actions use `action`. Upload target names use medium weight (500) with status beneath them at the smaller label size and a line-height of (1.5). Move-dialog introductions are slightly larger (13px) with a line-height of (1.6).

Avoid promoting the incumbent tiny, tracked shell metadata into a general heading or label system. The file-manager extension uses sentence-case titles and direct operation labels. Long paths wrap in review lists; compact sidebar filenames truncate with ellipsis.

## Layout

The incumbent desktop workspace has a header, a compact left file sidebar and adjacent source/PDF panes. Pane dividers, not oversized gutters, organize the writing area. Editing and preview containers have gently rounded edges; toolbars are dense and horizontally aligned.

The base dialog is centered, padded with the `dialog` spacing token, limited to (85vh) and constrained to the viewport minus (40px). Its ordinary width is (460px); the wide reference-review variant is (850px). File-batch dialogs request the frontmatter's batch width; the shared maximum-width constraint still applies. Keep the heading and close action together, then context, fields/review content and footer actions.

Upload choice controls wrap inside a centered dashed drop region. Summary controls also wrap. Batch lists scroll independently at a maximum of `min(300px, 32vh)`; move paths use a two-column source/destination grid with an arrow between them. Review paths can break anywhere. Trash and restore use the same path-list vocabulary. Review footers are sticky within the modal with a panel-colored ground, so scrolled content does not compete with the action.

At the captured desktop (1440 × 1000), user-sized (997 × 833) and configured narrow (560 × 850) viewports, the upload and restore dialogs fit the available width. This extension does not redesign the editor behind them: below (800px), the incumbent shell keeps a minimum width (650px), and the workbench keeps a minimum width (520px). Preserve that documented scope boundary; these captures do not establish a fully mobile editor.

The existing shell also has density adjustments below (1050px) and above (1500px). These belong to the incumbent editor, not a newly invented dialog breakpoint system.

## Elevation & Depth

Flat tonal layers and thin borders provide most of the structure. Real elevation is reserved for overlays and paper, rather than repeated cards inside the file workflow. Dialogs and menus use the shared overlay shadow; the PDF page has a smaller paper shadow. Exact shadow and backdrop values are in the sidecar because they are outside the frontmatter schema.

Native modal backdrops dim the editor, preserving recognizable context while giving the operation priority. Dialog grounds remain opaque. Light mode has a gentler shadow, while dark mode relies more heavily on the panel boundary and backdrop.

## Shapes

The form language uses restrained curves: small rows and utility controls, medium field and action corners, softly rounded editor panes, and a larger shared dialog corner. Use the frontmatter's existing radius roles rather than adding pills or an unrelated card style. Borders are generally thin (1px); the upload area uses a dashed border to identify its drop affordance.

Lucide icons use a consistent outline vocabulary. File and folder markers are commonly (14px); progress icons are (15px), the close icon is (19px), and the upload-region icon is (22px). Preserve native selection controls rather than replacing them with decorative glyphs.

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

## Do's and Don'ts

### Do:

- **Do** extend the incumbent compact neutral editor for local feature additions, preserving the owner's 简约风 direction.
- **Do** use the live theme's semantic CSS variables for surfaces, text, borders, focus and status.
- **Do** keep Destination full-width and consistent with the existing dialog text-field pattern.
- **Do** keep review paths readable, long lists scrollable and the final operation explicit.
- **Do** preserve visible keyboard focus, native control behavior and accessible icon names.
- **Do** distinguish captured visual evidence from behavior established by source or functional verification.

### Don't:

- **Don't** introduce a replacement visual identity or decorative accent palette in a local file-manager extension.
- **Don't** turn ordinary review rows into competing raised cards.
- **Don't** replace path/status text or native controls with icon-only explanations.
- **Don't** multiply the shell's tiny tracked metadata into a new heading or component system.
- **Don't** treat narrow dialog captures as proof of a responsive mobile editor or future collaboration design.
