# Prism Local

An independent, single-user LaTeX workspace inspired by Prism: source, files, PDF preview, and a writing assistant powered by API keys or your existing Codex CLI / Claude Code login. Not affiliated with OpenAI. No Prism client or backend code was recovered or copied.

## Start

Requires macOS, Node 22.13+ (or a newer compatible Node release), npm (included with Node), and an installed TeX distribution containing `latexmk`. The app detects pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX, Biber, and SyncTeX. It does not install TeX packages or Biber automatically.

```sh
git clone https://github.com/ZelinZhu-Richard/prism_pro.git
cd prism_pro
npm ci
npm run build
npm start
```

The committed npm lockfile supports `npm ci` without pnpm. Restart your existing Prism server after updating backend code.

Open **http://127.0.0.1:4317**. For development, `npm run dev` starts the API on 4317 and Vite on **http://127.0.0.1:5173**. Use Codex's built-in browser for previews and browser testing.

The app opens to **Your projects**. Search or sort projects, switch between list and grid views, create a blank document or example paper with **New**, or import a project ZIP with **Import**. Each project's actions include Rename and Download source. Thumbnails show the last successful PDF; opening the library does not compile documents or call an AI provider.

**Import** opens a centered dialog. Drop one project `.zip` onto it or click **Choose ZIP file** to browse your computer (up to 100 MB). Errors stay in the dialog so you can retry. Common `./` ZIP path prefixes are accepted. Hidden files such as `.gitignore`, `.env`, and editor/VCS settings, plus macOS metadata, are skipped without extracting their contents. A completion dialog lists every skipped entry. Visible source files, folders, figures, and bibliography files retain their contents; the original ZIP is unchanged.

Click a project to enter the editor. Click the Prism logo or **Workspace** to save and return home. Project URLs can be bookmarked, and browser Back/Forward works between the library and editor. Active AI requests must finish or stop before leaving their project.

To delete a project from the library, open its **…** menu and choose **Move to Trash**. Open **Trash** in the home sidebar and choose **Restore** to bring it back. Project Trash persists across restarts and keeps source files, revisions, chats, checkpoints, and compiled PDFs. Projects are retained until restored; there is no automatic purge. A running compilation or AI request must finish or stop before the project can move to Trash.

The synthetic demonstration project is created on the first start. Project settings select the root `.tex` document and engine. An enclosing ZIP directory is removed only when it encloses the whole project; nested project files and assets retain their paths and bytes.

## Connect an assistant

### Use your Codex CLI or Claude Code login

Install the CLI you want to use and sign in from your terminal with `codex login` or `claude auth login`. If you are already signed in, reuse that login. In Prism, open **Settings → Connections → Local CLI login**, choose **Codex CLI** or **Claude Code**, and click **Check CLI login**. Then select that backend in the editor's assistant and press Send. No API key needs to be pasted into Prism.

Both backends support Review Edits and Manual Type. Review Edits uses Prism's project tools and presents revision-bound diffs for Apply/Reject/Undo. Manual Type uses one CLI generation and the same local typing controls. CLI logins use your account's subscription limits; they are not metered by Prism's API pricing catalog. Manual Type keeps your selected CLI model, using the connected-model picker. It does not automatically claim a cheapest subscription model. Returning to Review Edits restores its regular model.

Prism launches `codex exec --json` or `claude --print --output-format stream-json`. Composer conversations use stable directories under `data/cli-sessions` and resume the exact native CLI session ID on later turns. Login/discovery checks and standalone smoke requests use disposable directories under `data/cli-runs`. The CLIs keep their normal native-session caches in their own configuration directories. Document context goes through stdin; prompts and credentials are not command-line arguments. Native shell tools, user/project hooks, plugins, skills, MCP connections, and API-key environment overrides are disabled for these runs. Codex uses a workspace-only read permission profile; Claude's native tools are disabled. Organization-managed CLI policies still apply. Project access is mediated by Prism, and proposed changes still require Apply. Authentication stays in the CLI's normal credential storage; Prism does not read or copy token files. CLI-owned runtime/auth files may still be updated by the CLI.

Codex JSONL delivers completed text messages, so typing can begin after its answer arrives. Claude Code emits incremental text deltas. Stop terminates the process group, with a three-minute generation timeout and a 2 MB output guard. The API's 4,096-token hard cap is not available through these CLI interfaces; Prism requests a concise response and uses those process/output limits instead. Partial visible text and normal Undo behavior are preserved.

Current local verification used Codex CLI 0.165.0 and Claude Code 2.1.314. Older CLIs missing the required isolation/streaming flags are rejected with an update message. Prism finds binaries on PATH and common installation paths; if needed, set absolute `PRISM_CODEX_BIN` / `PRISM_CLAUDE_BIN` paths in `.env` and restart. A saved-login check does not guarantee a still-valid session or model entitlement. If generation reports an expired login, sign in again in your terminal.

### Use an API key

Open **Settings → Connections**, select OpenAI, Anthropic, DeepSeek, Gemini, or Qwen, enter your API key, and choose **Connect & verify**. Keys entered through the UI remain in backend memory until restart. The browser never stores a key in localStorage, IndexedDB, cookies, chats, or source exports. Clearing a session key falls back to an environment key if one is configured.

For persistent local configuration, use the CLI from the project directory:

```sh
npm run keys -- set openai
npm run keys -- set anthropic
npm run keys -- set deepseek
npm run keys -- set gemini
npm run keys -- set qwen
npm run keys -- status
npm run keys -- remove gemini
```

`set` prompts for a hidden key. It writes the local `.env` file with owner-only permissions; `status` never displays key values. For automation, pipe a key from a secret manager into `npm run keys -- set gemini --stdin`. Do not place keys in command arguments or shell history. `remove` removes the provider's local key and aliases; externally supplied environment variables and running session keys are managed separately. These commands never generate text or call provider APIs. pnpm remains optional for users who already have it installed.

Qwen accepts a regional endpoint from your Alibaba Cloud console:

```sh
npm run keys -- set qwen --base-url https://YOUR-WORKSPACE.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

You can also change the Qwen endpoint for the current session in Settings. The key and endpoint must belong to the same region. Official Alibaba HTTPS endpoints are accepted; the default is the legacy Singapore endpoint. No third-party proxies are supported.

Alternatively copy `.env.example` to `.env`, or set backend environment variables:

```dotenv
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
QWEN_API_KEY=
```

`GOOGLE_API_KEY` and `DASHSCOPE_API_KEY` are recognized aliases. `QWEN_BASE_URL` (or `DASHSCOPE_BASE_URL`) configures Qwen's endpoint. Canonical key variables take precedence over aliases, and an existing process environment variable takes precedence over the same name in `.env`.

Restart the server after changing `.env`. This file is gitignored. Model verification lists accessible models; it does not generate text. Paid generation starts only when you press Send. The selected connection receives the active document and prompt. Choose **Document** to restrict reads, searches, diagnostics, and edits to the active file, or **Whole Project** to let the assistant inspect supporting files such as sections, `.bib`, and `.bbl`. Context files are displayed in the composer. Provider errors do not cause retries or a switch to another model/provider.

Chats are persistent conversations, with multiple user/assistant turns rather than a separate chat for each request. **New conversation** starts a fresh one; reopening Prism restores saved turns. API requests replay bounded conversation history. CLI requests resume a native session. Sessions are separated by provider, model, scope and (in Document scope) file, so switching to a narrower scope never reuses broader project context. The current source remains authoritative after edits or Undo.

The composer has one **model and connection** picker. It combines every connected source: for example, GPT models through Codex CLI alongside Claude models through Anthropic API. Use **Refresh connected models** after restarting Prism, or connect/verify a provider in Settings. Codex supplies its model list; API connections use their model-list endpoints. Claude Code offers Sonnet, Opus, and Haiku aliases, subject to your plan. No model-name typing is needed. Discovery does not generate text.

Select a passage in the source to see its exact text, file, and line range above the prompt. The highlight remains visible when you focus the composer. During a request, **Selection sent** keeps the submitted passage visible even if you inspect another file.

While either editing mode is working, you can switch tabs or open files from the sidebar. Project files are read-only until the request finishes or stops; **View file** returns to the assistant’s original target. Scrolling, selection, search, and PDF inspection remain available.

### Review Edits

The assistant can list, read, and search text and inspect compile diagnostics within the selected scope. **Whole Project** enables multi-file proposals; **Document** limits changes to the active file. Open **Review changes** to inspect the diff, then Apply or Reject. Apply and Undo both check every file's revision and contents before changing anything. Stale proposals fail without overwriting newer edits. Existing files are supported by proposals; create a new file in the sidebar before asking the assistant to populate it.

### Manual Type

Select **Manual Type**. For API providers, Prism estimates uncached input plus the default 4,096-token output allowance and selects the least expensive eligible model in its supported catalog **within your selected provider**. Access verification must be less than 24 hours old and the pricing catalog less than 90 days old. Missing access, prices, or capacity requires an explicit model choice. Returning to Review Edits restores your regular model. Qwen requires an explicit model choice because region-specific prices are not yet verified in the USD catalog. Gemini promotional prices expire separately from the catalog. CLI backends keep your selected model and use subscription limits instead. See [pricing provenance](docs/pricing.md).

Explanations and clarification questions appear in chat and never automatically become document text. A proposed Manual Type edit opens **Replacement preview** before insertion. Edit the LaTeX directly, add suggestions and choose **Propose revised replacement**, or use **Compile preview** to build an isolated snapshot in the same preview window. Draft generation, revision, and compilation do not change source or create project-history entries. **Start typing** explicitly approves the current draft; **Discard** keeps the source unchanged. A waiting preview can be reopened from a fresh editor view without another paid request. Closing the preview window keeps it available through **Review replacement**. The assistant uses a separate validated typing action for source edits. It can insert at the captured caret, replace the captured selection, or replace an exact unique passage elsewhere in the active file. Whole Project allows it to read supporting files first; Manual Type still edits one active file per run. Use Review Edits for multi-file changes. Inspection may require several model responses (up to eight rounds); the displayed API estimate covers the initial response, not the entire inspection. No per-character requests are made. Local animation inserts Unicode graphemes at roughly six characters per second with punctuation pauses. Select 0.5×, 1×, 2×, or Instant. Pause stops insertion while generation may continue. Stop cancels generation and discards the uninserted buffer. Visible partial text remains after Stop or failure.

Manual Type always writes to the file and range captured when you press Send, even while another file is open. All project files remain read-only during the run. Visible progress is saved approximately once per second; automatic compilation is suspended until the run ends. Undo restores the whole run, including the original selection. After switching files or reopening the app, return to the edited file and use **Undo last typing run** if no subsequent edit has changed it. Interrupted runs retain their saved partial text and are never automatically resumed. As with any autosave, an abrupt process/browser crash may lose the last unsaved fraction of a second.

## Editing and compiling

- Create files/folders using relative paths, rename them, upload assets, or restore deleted files from Trash.
- **Select files** shows checkboxes; Shift selects a visible range and ⌘/Ctrl-click toggles a selection. Use **Move**, a file's move action, or drag files/folders onto a destination folder or **Project root**. Review the destination before applying. The editor saves pending text, moves open tabs and the main-document setting, and retains current-session source selection/Undo history for a confirmed move. **Undo last file move** persists across restarts and rejects changed files, new folder descendants, or occupied original locations. Renames use the same recovery path. The preview offers **Update supported file references**, with per-file source diffs. Keep it enabled to apply all shown edits with the move, or turn it off to change locations only. Combined Undo restores the reference text and file locations together. Dynamic or ambiguous references are listed for manual review. This review runs locally. Batch actions also cover reviewed uploads, recoverable Trash/restore, and selected-file ZIP download.
- Source tabs, section outline, syntax highlighting, bracket matching, folding, search/replace, Undo/Redo, and autosave are built in.
- **Make a copy** is available in library project actions and the editor's project menu. Choose a name and review the main document/compiler. Library copies appear in the library; editor copies open immediately. Active files, assets, empty folders, and compiler settings are preserved exactly, with fresh chat and one initial history entry. The editor saves current text before copying. A changed original requires refreshing the preview; retrying the same request creates one copy. File Trash and compiled output stay with the original.
- The sidebar search button or **⌘⇧F / Ctrl+Shift+F** searches project text, with exact match navigation, case/whole-word/regex controls, and include/exclude file patterns. **Replace across files** previews per-file diffs before applying to selected files. Replacement text stays literal unless capture expansion is explicitly enabled. **Recent replacements** retains one-step project Undo across restarts; changed files invalidate Apply/Undo. Search remains available during AI runs, while replacement stays read-only.
- Switch between **Code** and **Visual** above the source. Visual mode styles prose, headings, lists and equations while keeping the original LaTeX buffer and Undo history. Literal %, $, underscores and other special characters are escaped while typing. Custom commands, document setup and unsupported structures appear as compact chips that open a source-fragment editor. Mode changes alone do not save a new source revision or history entry.
- Visual mode previews standard equations locally with KaTeX, managed PNG/JPEG figures, and basic `tabular` tables. Click a table cell to edit its exact source range. Use **Add paragraph** to write between adjacent objects. Source-fragment edits are one Undo event; AI read-only locks still apply while file navigation remains available. Find switches to Code view so hidden source matches can be inspected.
- The source formatting toolbar adds bold, italic, underline, typewriter text, headings, lists, inline/display equations, and comment toggling. **⌘B**, **⌘I**, and **⌘/** use the same actions. Each insertion is one Undo step and preserves the captured selection on Undo; source tools stay disabled during AI editing runs.
- **Table** inserts a new grid (up to 30 rows × 12 columns), with spreadsheet paste, captions and labels. At a table cursor it opens an existing-table draft instead; Visual mode also offers **Edit table**. Literal `tabular` drafts support up to 100 rows × 24 columns, cell/caption LaTeX, row/column insertion and deletion, horizontal merging, alignment/fixed widths, border presets, draft Undo/Redo and a source diff. Apply is one document Undo event and checks the saved revision. Drafts are held only in memory; **Copy draft LaTeX** preserves the complete replacement before closing/reloading a stale draft. Custom/repeated column types, nested environments, multirow cells and partial-width rules have explicit source-editing boundaries; no macros are expanded. Booktabs and array-dependent styles require their usual packages.
- **Figure** inserts a managed PNG, JPEG, or PDF, with upload, width, placement, caption, and label controls. Load `graphicx` in the root preamble first. Cancelling after an upload keeps the asset in your project. **Symbols** searches 88 math symbols by command, name, category, or alias, and lets you choose inline math delimiters. Package-dependent symbols show their requirement.
- LaTeX command snippets, citation keys, and labels complete as you type. Use **Ctrl+Space** to open suggestions, arrow keys to choose, and Enter to insert. Citation queries match title, author, year, journal, or key, and label completion includes other project files. Existing command arguments and the remainder of a citation key are preserved when appropriate.
- **References** searches managed `.bib`, `.bbl`, and manual bibliography entries locally. Insert at the captured cursor/selection or replace the current citation key. Source changes participate in normal autosave and Undo; AI run locks keep insertion read-only. Duplicate keys and incomplete BibTeX entries have diagnostics.
- **Chats** lists saved conversations by recent activity. Search titles, rename a chat, or archive and restore it. Archiving keeps replies and native CLI session IDs; it never deletes source. The selected conversation and an explicit new-chat state survive restarts. Follow-ups reuse the selected conversation; paid generation requires an explicit request action. Unsent prompts are retained per chat while the app remains open, not across a browser restart.
- Assistant replies render Markdown, lists, tables, code and local equations (`$…$`, `$$…$$`, `\(…\)` and `\[…\]`). Copy code or the exact original reply, or switch to Plain text. Raw HTML stays inactive and remote images are omitted. Earlier/Newer browse saved turns in pages of 20; Latest messages returns to the current reply. Expand assistant gives the transcript more room. Each turn shows its provider/status and source context. Saved failures retain partial text and a sanitized error.
- Source proposals remain attached to their originating turn. **Review changes** loads the full diff; Apply/Reject/Undo act on that proposal. Stale Apply stays open with an error. Markdown, math, copying, title changes and archiving do not edit the document or enter source history. API context still uses up to 20 eligible recent turns within 32 KB; native CLI context also depends on its saved session. Keeping a full visible chat does not mean every old turn is sent on each request.
- **Writing checks** in the sidebar offers fully local **English (US)** and **English (UK)** spelling, suggestions, session-only Ignore, and persistent per-language personal dictionaries. Choose a suggestion to change one word with normal editor Undo. Optional **LaTeX checks** flag common delimiter, environment and command-placement mistakes independently of spelling. Use **Show in source** to navigate; **Ask AI…** prepares a prompt and waits for you to send it. Both checks start off until enabled and can be excluded per file.
- Spelling scans the active `.tex`/`.ltx` file, skipping common math, code, citation keys, paths, comments, unknown macro arguments and joined formatting fragments. Inline markers appear in Code mode; Visual mode uses the findings list. Hints cannot expand custom macros and are not compiler diagnostics or grammar checking. English UK uses the bundled **-ise** dictionary variant. Checks pause while an AI run or file operation owns the source, reject stale corrections, and never trigger a paid request. Files above 1,000,000 source characters or 50,000 prose words are bounded; at most 500 findings are shown. See [dictionary provenance and licenses](vendor/dictionaries/README.md).
- **Word count** runs bundled TeXcount 3.1.1 against a sandboxed source snapshot, including `\input`/`\include` files. It reports body, headings, captions, math, and section counts; choose which text categories to include in the total. Bibliography counting can use a successful build’s `.bbl` only when it matches the current source generation. The macOS sandbox and system Perl are required; no TeXcount system installation or online service is used.
- **Upload files** opens a centered review. Choose multiple files or a folder, or drop files/folders, then choose a destination. Clicking a folder first makes it the default destination for Upload, New file and New folder; **Project root** resets it. Nested paths are preserved. New files start selected; existing files require an explicit **Replace** checkbox. A path in Trash, case/Unicode alias, or file/folder collision is unavailable until resolved. Hidden/system metadata is skipped and listed. Limits are 180 files, 500 total entries and 50 MB per upload; directory nesting from a drop is limited to 32 levels. Folder pickers return files, so preserving empty folders requires a folder drop. Upload progress shows transfer and save phases. Replacements retain previous bytes in History, and **Undo last upload** restores the batch; newly added files move to Trash on Undo.
- **Select files** (or Cmd/Ctrl/Shift selection) offers grouped **Download** and **Trash**. Downloads keep selected project-relative paths in one ZIP, excluding Trash. The download limit is 200 selected roots, 5,000 entries and 100 MB. Trash review lists the actual files and warns when the root document is included. **Trash** now includes empty folders and grouped restoration. **Undo last Trash/restore** persists across restart and refuses later changes to affected files. Before/after checkpoints retain independent recovery. Disk-only files inside a selected folder must be preserved or added to Prism before that folder can move to Trash.
- Upload, Trash, restore and their Undo operations commit the file tree, revisions and metadata together. Lost-response retries reuse the same operation identifier. A stale review requires refresh. Imported scripts are preserved as source and never executed by these actions. File mutations and selection actions stay disabled while an AI run owns the project; other files remain readable.
- Project history saves automatically: a starting version, a grouped snapshot after 10 seconds of idle edits (at most 60 seconds during continuous editing), AI boundaries, and orderly shutdown. Opening **History** flushes the latest saved state. The history timeline compares a selected version with the current project or another saved version. Inspect text diffs, label milestones, download a historical source ZIP, or restore one file while preserving other files and compiler settings. Stale file comparisons are rejected. Named checkpoints remain available. Snapshots deduplicate unchanged file bytes, and restoring one first saves the current state for recovery. No automatic history deletion is configured.
- Compile with the button or **⌘Enter** in the editor. The lightning button enables debounced automatic compilation. Stop build cancels the process group. Clean rebuild uses a fresh snapshot, as do ordinary builds.
- Every compile has a two-minute timeout. Diagnostics link to source lines; **Fix with AI** prepares a request for you to send. Failed builds retain the previous PDF with a stale-preview label.
- PDF pages form one continuous scrollable document. Enter a page number or use arrows, Page Up/Down and Home/End with the preview focused. Zoom, panel resizing, and recompilation preserve your reading position. The zoom menu offers fit-to-width, fit-to-height, 50–400% presets, and custom 10–400% values. **100%** now uses actual PDF-point-to-CSS-pixel scale, independently of panel width. Use **⌘/Ctrl + / −**, **⌘/Ctrl 0** for fit width, or **⌘/Ctrl 9** for fit height. Nearby canvases render on demand, with raster-memory limits at high zoom. **Present PDF** shows one fitted page with arrow/Space/Page Up/Down navigation and Escape/Exit; browsers that leave or reject native fullscreen retain a window presentation. **Go to PDF / ⌘⇧J** uses SyncTeX; double-click outside PDF links to return to source. A stale PDF maps to its historical compile snapshot, so rebuild for precise locations after edits. Saved partial Manual Type progress keeps the old PDF marked stale.
- Click PDF cross-references, citations, contents entries and named targets to follow their compiled destinations. Click and drag across text, including links, to select it; double-click outside links to return to source. Keyboard users can Tab to a link and press Enter. HTTP, HTTPS and email links open separately; PDF scripts, file launches, forms and attachments stay inactive. **PDF bookmarks** exposes the compiled outline with expandable nested titles. **Previous/Next PDF view** restores reading position and zoom after following links. This temporary navigation history resets for a new compiled PDF and does not enter project history. Presentation follows internal links by page; return to continuous preview for Previous/Next View.
- **Search PDF / ⌘F / Ctrl+F**, with the preview focused, searches every page locally, including pages not yet rendered. Enter/Shift+Enter or ⌘G/Ctrl+G moves between matches. Match case, whole-word, and accent options are independent. Highlights preserve selectable text; common ligatures, accents, whitespace and line-break hyphenation are normalized. Search follows PDF extraction order within each page; it does not join separate pages or perform OCR. Queries are limited to 512 UTF-16 code units and 10,000 matches. Oversized/complex PDFs report a limit rather than silently truncating results; download them for another reader if needed. Search makes no AI requests or source/history changes.
- Drag across PDF text to select it; double-click outside links returns to LaTeX. Copy preserves line breaks and normalizes ligatures. With the preview focused, **⌘A / Ctrl+A**, then Copy, includes every page, even pages not yet rendered. Whole-document extraction can be cancelled with Escape. **Read PDF text** opens a read-only, keyboard-accessible view for reading or manual copying. Text extraction is local and never changes source/history or calls an AI provider. Image-only PDFs have no selectable text; OCR and tagged-PDF semantics are not included. Columns, equations, and hyphenation follow PDF extraction order. Full extraction is limited to 8 Mi UTF-16 code units, 500,000 items, and 15 seconds; unusually complex page overlays fall back to the text view or PDF download.
- Export source ZIP from the project menu. Download PDF from the preview toolbar.
- **Settings → Editor** previews and saves preferences for every project on this computer: 10–24 px text, System monospace / locally bundled Source Code Pro / OpenDyslexic Mono, Compact/Normal/Wide spacing, wrapping, line numbers, automatic completion, bracket closing, and spaces/tabs with 2/4/8-column indentation. Existing source whitespace and Undo history stay intact. Font size/spacing also apply to Visual mode; Visual prose keeps its serif font and wrapping. Reset editor defaults is a preview until saved.
- Code mode offers Standard, Vim, and Emacs emulations. Vim supports insert/normal navigation, Undo/Redo, and `:w` to flush Prism’s autosave. Emacs supports common movement, mark, kill/yank, and search commands; this is not a full Emacs runtime or an `M-x` command console. Browser shortcuts can take priority. Escape followed by Tab moves focus out of the editor. Custom persisted Vim maps are not implemented yet. Changing preferences during a paused AI run preserves read-only file browsing and the typing Undo group.
- Dark, Light, and System themes are in **Settings → Appearance**. AI connection buttons open **Settings → Connections** directly. Panel separators support pointer dragging and arrow keys when focused.

## Local data and boundaries

Everything lives inside this Prism folder:

```text
data/
  prism.sqlite                 settings, chats, revisions, checkpoints, AI runs
  projects/<id>/files/          ordinary materialized project files
  builds/<job-id>/              immutable inputs, output, SyncTeX, job metadata
  verification/                private compatibility checks, if run
```

SQLite is the revision authority; normal files are materialized on each write and startup. **Edit through the app or import a ZIP**, rather than modifying `data/projects` behind its back. Back up the entire `data` directory while the server is stopped. The app does not yet prune historical builds/revisions automatically.

The API binds only to loopback and validates Host/Origin plus a custom header on mutations. It is a local single-user application, not a hosted service with accounts or authentication. Do not expose it through a public reverse proxy.

ZIP limits: 100 MB compressed, 500 MB expanded, 50 MB per member, 10,000 entries. Traversal, absolute paths, encrypted members, symlinks, protected paths, duplicate normalized names, case collisions, and file/directory collisions are rejected. Hidden/system entries are skipped and reported; size and path protections still apply before skipping. Supporting scripts are retained as files and never invoked.

Compilation uses immutable snapshots, `latexmk -norc`, no shell escape, a minimal environment without API credentials, and a deny-default macOS sandbox. The sandbox allows TeX/system runtime reads and writes only inside the build output/home directories, with network access denied. Imported compiler configurations are not evaluated. The compiler fails closed outside supported macOS environments. See [architecture and API](docs/architecture.md).

## Verification

```sh
npm test
npm run build
npm run verify:compiler -- --timeout
npm run verify:sample -- /absolute/path/to/sample.zip
```

Compiler verification requires installed TeX tools and permission to launch macOS sandboxed processes. The sample script keeps the supplied document private under gitignored `data/verification`; only the synthetic project ships in source.

To explicitly test an installed CLI using its subscription allowance, run `npm run verify:cli -- codex` or `npm run verify:cli -- claude-code`. These generate text for synthetic documents and check Manual Type plus Review Edits Apply/Undo. No private project is sent. The ordinary test suite uses deterministic fixtures and does not consume model usage.

[Verification results](docs/verification.md) distinguish fixture tests, real compiler checks, browser checks, and untested live API calls. [Investigation notes](docs/investigation.md) separate REA archive evidence, browser observations, and implementation decisions.

For browser testing without credits, stop the normal API and run `node --import tsx scripts/serve-fixture.ts` alongside Vite. Its project is clearly labelled synthetic and stored in `data/browser-fixture`. It replaces provider generation in memory and never calls a provider. Stop it and restart the normal app when finished.

First release excludes hosting, accounts, collaboration, shared comments/history, Zotero, voice, and literature search. Biber was not installed on the development machine; Biber detection is verified, but Biber execution requires installing it through your TeX distribution.

The ongoing [Overleaf parity ledger](docs/overleaf-parity.md) distinguishes implemented features from remaining local editor work and later hosted collaboration. Full Overleaf parity is not yet delivered.

`npm run verify:word-count` exercises real TeXcount with synthetic files: includes, categories, nested roots, blocked outside reads, ignored shell commands, snapshot cleanup, and current/stale compiled bibliographies. Counting follows TeXcount macro rules and `%TC` directives; it may differ from journal-specific counts. Biblatex counting is limited. The reference index covers up to 16 MB of source; word-count snapshots cover up to 32 MB of project text and have a 15-second timeout.

`npm run verify:source-tools` compiles synthetic generated tables, figures, lists, and the complete symbol catalog, including a nested root and an asset path with spaces. The insertion tools generate source; Visual mode also exposes basic existing-table cells for source-fragment editing. Advanced table structures remain available through Code view or their source chip.

`npm run verify:visual-editor` compiles source with preserved custom macros, escaped literal characters and Unicode, a heading split with nested formatting, and a split list item. Visual mode offers a source-backed writing view. Custom macro expansion, rich HTML clipboard interchange, and advanced table layout still need further work. Compile for the final document layout.

`npm run verify:project-search` compiles a synthetic multi-file project before replacement, after reviewed replacement, and after exact project Undo. Search excludes binary/deleted files, non-UTF-8 text, and text files over 2 MB, limits a scope to 32 MB, and displays the first 1,000 matches. Replacement previews reject more than 5,000 matches and expire after 30 minutes; applied replacements remain recoverable in project history. Original/replacement downloads are available for large diffs.

`npm run verify:project-copy` compiles an original nested-root XeLaTeX document, its independent copy, and an edited copy, with a figure and BibTeX bibliography. It checks exact source/asset bytes, ZIP round-trip, fresh history, and source independence. Copying preserves the selected compiler and uses the existing local TeX installation. If the original's main document is missing, choose a main document in the new copy before compiling.

`npm run verify:file-moves` compiles a synthetic project before moving its root folder, after the move, and after Undo. It checks exact source/assets, ZIP round-trip, bibliography/figure compatibility, and forward/inverse SyncTeX after rebuilding. A PDF built before a path change requires recompilation before navigating to that moved source. This check uses the installed XeLaTeX, BibTeX and SyncTeX tools through the existing macOS sandbox.

`npm run verify:reference-moves` compiles a synthetic document before and after reviewed moves of sections, figures, bibliography, and local class/style files, then after a figure rename with spaces and after consecutive Undo. It checks updated moved/unmoved source files, exact ZIP round-trip and complete source recovery. Literal project-relative references are supported; custom macros, ambiguous assets and import-package base directories may need manual changes. All reference updates form one approval bundle because graphics search-path edits can affect other files.

`npm run verify:pdf-links` compiles a synthetic multi-page XeLaTeX document containing cross-references, a citation, named targets, a rotated page, URLs, nested Unicode bookmarks and inert unsupported-action examples. It checks exact retained source bytes and saves ignored fixture metadata for built-in-browser verification. PDF metadata has bounded link/bookmark counts, text budgets and an eight-second read timeout; oversized metadata reports a limit while ordinary preview remains available.

`npm run verify:file-batches` compiles a synthetic project before upload, after an approved replacement, after exact upload Undo, and after grouped Trash/restore. It checks source and binary bytes, selected ZIP export and the complete project ZIP round-trip. No TeX packages are installed. Restart an already-running backend after updating to get the new upload/batch APIs.
