---
version: 1
slug: "src-components-workspacelayout-tsx"
primary_target: "src/components/WorkspaceLayout.tsx"
related_targets: ["src/App.tsx","src/components/PdfPreview.tsx","src/styles.css"]
---

Scope: extend the existing editor with a compact Workspace layout popover, independent Files/Assistant/PDF visibility, Full workspace/Write/Source and PDF presets, saved dimensions and Reset. Mode: Operate. Keep source and hidden panels mounted; preserve dirty source/Undo, chat drafts, read-only ownership and page-relative PDF reading. Reuse neutral header controls, native fieldsets/checkboxes/buttons, error/retry and visible focus. Keyboard/palette access and requested-tool reveal must work. Automatic builds must respect hidden preview. Confirmed view settings persist separately from source with revision guards; failed/ambiguous saves retain the visible layout and explicit retry/reload. No new world, seed, comp or artwork. A writer can briefly focus on source then recover the same workspace without losing their passage. Both themes, actual user width and a narrow source-only layout join the bounded verification matrix; combined narrow desktop layouts retain their stated limits.
