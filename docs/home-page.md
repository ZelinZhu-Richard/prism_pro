# Project home page

## Browser observations

Inspected the signed-in project library at https://prism.openai.com/ in Codex's built-in browser. Its visible structure was a left workspace sidebar, a rounded main panel, a compact heading/search/view-toggle/action toolbar, a sortable project list, and an alternate thumbnail grid. The list included project names and dates, with per-project actions. This is browser-observed UI evidence only; no client bundle or backend was recovered.

## Local implementation

The local `/` route now opens the project library instead of automatically opening the first project. `/?project=<id>` opens a particular editor. Browser history and the editor's logo/Workspace control connect the two views. Navigation saves pending edits, temporarily locks the editor during the transition, and prevents leaving an active AI run.

The existing taste-skill neutral palette and typography are reused. The sidebar offers Your projects, Recently edited (the ten most recently edited projects), Settings, and Help. No account or sharing functionality is implied. Search, sorting by name/date, list/grid views, blank/example creation, ZIP import, renaming, and ZIP download use actual local projects. Dates are labelled Last edited because that is the timestamp the local database stores.

PDF.js renders the first page of an existing successful PDF for each visible project. Projects without compiled output use a file placeholder. Previews load as rows approach the viewport and release rendering resources when unmounted. Viewing the library starts no compilation or AI generation.

## Verification

- Production TypeScript/Vite build passed, without bundler warnings.
- Existing automated suite: 30 tests passed.
- All browser checks used the built-in browser. The isolated workspace at `data/home-verification` held the disposable projects; normal project files were not edited.
- Verified empty workspace, first blank project creation, example-paper creation, rename, alphabetical sorting, list/grid switching, no-match search and clearing, sidebar collapse/expand, and settings access.
- Typed into the test source and immediately returned home. Browser Back and a page reload both recovered the saved text and the correct project URL.
- Imported a synthetic ZIP from the home toolbar; `paper.tex` and `sections/note.tex` were visible in the editor with the nested structure intact.
- Inspected dark and light themes at desktop sizes and the light home layout at 390 × 844. At 390px, document scroll width equalled viewport width. The viewport override was reset afterward.
- Keyboard Enter activated New and Expand sidebar; buttons, links, search, sort and view controls use native semantics and visible focus. This is targeted verification, not a complete accessibility audit.
- No browser console errors were recorded during the isolated home workflow. The temporary test server was stopped after verification.

Screenshots: [dark home](screenshots/prism-home-dark.jpg), [light home](screenshots/prism-home-light.jpg), [narrow home](screenshots/prism-home-mobile.jpg).
