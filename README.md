# Prism Local

An independent, single-user LaTeX workspace inspired by Prism: source, files, PDF preview, and a writing assistant powered by API keys or your existing Codex CLI / Claude Code login. Not affiliated with OpenAI. No Prism client or backend code was recovered or copied.

## Start

Requires macOS, Node 22.13+ (or a newer compatible Node release), pnpm, and an installed TeX distribution containing `latexmk`. The app detects pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX, Biber, and SyncTeX. It does not install TeX packages or Biber automatically.

```sh
git clone https://github.com/ZelinZhu-Richard/prism_pro.git
cd prism_pro
pnpm install
pnpm build
pnpm start
```

Open **http://127.0.0.1:4317**. For development, `pnpm dev` starts the API on 4317 and Vite on **http://127.0.0.1:5173**. Use Codex's built-in browser for previews and browser testing.

The app opens to **Your projects**. Search or sort projects, switch between list and grid views, create a blank document or example paper with **New**, or import a project ZIP with **Import**. Each project's actions include Rename and Download source. Thumbnails show the last successful PDF; opening the library does not compile documents or call an AI provider.

**Import** opens a centered dialog. Drop one project `.zip` onto it or click **Choose ZIP file** to browse your computer (up to 100 MB). Errors stay in the dialog so you can retry. Common `./` ZIP path prefixes are accepted. Hidden files such as `.gitignore`, `.env`, and editor/VCS settings, plus macOS metadata, are skipped without extracting their contents. A completion dialog lists every skipped entry. Visible source files, folders, figures, and bibliography files retain their contents; the original ZIP is unchanged.

Click a project to enter the editor. Click the Prism logo or **Workspace** to save and return home. Project URLs can be bookmarked, and browser Back/Forward works between the library and editor. Active AI requests must finish or stop before leaving their project.

To delete a project from the library, open its **…** menu and choose **Move to Trash**. Open **Trash** in the home sidebar and choose **Restore** to bring it back. Project Trash persists across restarts and keeps source files, revisions, chats, checkpoints, and compiled PDFs. Projects are retained until restored; there is no automatic purge. A running compilation or AI request must finish or stop before the project can move to Trash.

The synthetic demonstration project is created on the first start. Project settings select the root `.tex` document and engine. An enclosing ZIP directory is removed only when it encloses the whole project; nested project files and assets retain their paths and bytes.

## Connect an assistant

### Use your Codex CLI or Claude Code login

Install the CLI you want to use and sign in from your terminal with `codex login` or `claude auth login`. If you are already signed in, reuse that login. In Prism, open **Settings → Local CLI login**, choose **Codex CLI** or **Claude Code**, and click **Check CLI login**. Then select that backend in the editor's assistant and press Send. No API key needs to be pasted into Prism.

Both backends support Review Edits and Manual Type. Review Edits uses Prism's project tools and presents revision-bound diffs for Apply/Reject/Undo. Manual Type uses one CLI generation and the same local typing controls. CLI logins use your account's subscription limits; they are not metered by Prism's API pricing catalog. Manual Type keeps your selected CLI model, using the connected-model picker. It does not automatically claim a cheapest subscription model. Returning to Review Edits restores its regular model.

Prism launches `codex exec --json` or `claude --print --output-format stream-json`. Composer conversations use stable directories under `data/cli-sessions` and resume the exact native CLI session ID on later turns. Login/discovery checks and standalone smoke requests use disposable directories under `data/cli-runs`. The CLIs keep their normal native-session caches in their own configuration directories. Document context goes through stdin; prompts and credentials are not command-line arguments. Native shell tools, user/project hooks, plugins, skills, MCP connections, and API-key environment overrides are disabled for these runs. Codex uses a workspace-only read permission profile; Claude's native tools are disabled. Organization-managed CLI policies still apply. Project access is mediated by Prism, and proposed changes still require Apply. Authentication stays in the CLI's normal credential storage; Prism does not read or copy token files. CLI-owned runtime/auth files may still be updated by the CLI.

Codex JSONL delivers completed text messages, so typing can begin after its answer arrives. Claude Code emits incremental text deltas. Stop terminates the process group, with a three-minute generation timeout and a 2 MB output guard. The API's 4,096-token hard cap is not available through these CLI interfaces; Prism requests a concise response and uses those process/output limits instead. Partial visible text and normal Undo behavior are preserved.

Current local verification used Codex CLI 0.165.0 and Claude Code 2.1.314. Older CLIs missing the required isolation/streaming flags are rejected with an update message. Prism finds binaries on PATH and common installation paths; if needed, set absolute `PRISM_CODEX_BIN` / `PRISM_CLAUDE_BIN` paths in `.env` and restart. A saved-login check does not guarantee a still-valid session or model entitlement. If generation reports an expired login, sign in again in your terminal.

### Use an API key

Open Settings, select OpenAI, Anthropic, DeepSeek, Gemini, or Qwen, enter your API key, and choose **Connect & verify**. Keys entered through the UI remain in backend memory until restart. The browser never stores a key in localStorage, IndexedDB, cookies, chats, or source exports. Clearing a session key falls back to an environment key if one is configured.

For persistent local configuration, use the CLI from the project directory:

```sh
pnpm keys set openai
pnpm keys set anthropic
pnpm keys set deepseek
pnpm keys set gemini
pnpm keys set qwen
pnpm keys status
pnpm keys remove gemini
```

`set` prompts for a hidden key. It writes the local `.env` file with owner-only permissions; `status` never displays key values. For automation, pipe a key from a secret manager into `pnpm keys set gemini --stdin`. Do not place keys in command arguments or shell history. `remove` removes the provider's local key and aliases; externally supplied environment variables and running session keys are managed separately. These commands never generate text or call provider APIs.

Qwen accepts a regional endpoint from your Alibaba Cloud console:

```sh
pnpm keys set qwen --base-url https://YOUR-WORKSPACE.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
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
- Source tabs, section outline, syntax highlighting, bracket matching, folding, search/replace, Undo/Redo, and autosave are built in.
- The sidebar search button or **⌘⇧F / Ctrl+Shift+F** searches project text, with exact match navigation, case/whole-word/regex controls, and include/exclude file patterns. **Replace across files** previews per-file diffs before applying to selected files. Replacement text stays literal unless capture expansion is explicitly enabled. **Recent replacements** retains one-step project Undo across restarts; changed files invalidate Apply/Undo. Search remains available during AI runs, while replacement stays read-only.
- Switch between **Code** and **Visual** above the source. Visual mode styles prose, headings, lists and equations while keeping the original LaTeX buffer and Undo history. Literal %, $, underscores and other special characters are escaped while typing. Custom commands, document setup and unsupported structures appear as compact chips that open a source-fragment editor. Mode changes alone do not save a new source revision or history entry.
- Visual mode previews standard equations locally with KaTeX, managed PNG/JPEG figures, and basic `tabular` tables. Click a table cell to edit its exact source range. Use **Add paragraph** to write between adjacent objects. Source-fragment edits are one Undo event; AI read-only locks still apply while file navigation remains available. Find switches to Code view so hidden source matches can be inspected.
- The source formatting toolbar adds bold, italic, underline, typewriter text, headings, lists, inline/display equations, and comment toggling. **⌘B**, **⌘I**, and **⌘/** use the same actions. Each insertion is one Undo step and preserves the captured selection on Undo; source tools stay disabled during AI editing runs.
- **Table** opens an editable grid (up to 30 rows × 12 columns) with spreadsheet paste, column alignment, rules, header styling, captions, reference labels, and a LaTeX preview. Plain-text mode escapes special characters; source mode accepts your own LaTeX.
- **Figure** inserts a managed PNG, JPEG, or PDF, with upload, width, placement, caption, and label controls. Load `graphicx` in the root preamble first. Cancelling after an upload keeps the asset in your project. **Symbols** searches 88 math symbols by command, name, category, or alias, and lets you choose inline math delimiters. Package-dependent symbols show their requirement.
- LaTeX command snippets, citation keys, and labels complete as you type. Use **Ctrl+Space** to open suggestions, arrow keys to choose, and Enter to insert. Citation queries match title, author, year, journal, or key, and label completion includes other project files. Existing command arguments and the remainder of a citation key are preserved when appropriate.
- **References** searches managed `.bib`, `.bbl`, and manual bibliography entries locally. Insert at the captured cursor/selection or replace the current citation key. Source changes participate in normal autosave and Undo; AI run locks keep insertion read-only. Duplicate keys and incomplete BibTeX entries have diagnostics.
- **Word count** runs bundled TeXcount 3.1.1 against a sandboxed source snapshot, including `\input`/`\include` files. It reports body, headings, captions, math, and section counts; choose which text categories to include in the total. Bibliography counting can use a successful build’s `.bbl` only when it matches the current source generation. The macOS sandbox and system Perl are required; no TeXcount system installation or online service is used.
- Project history saves automatically: a starting version, a grouped snapshot after 10 seconds of idle edits (at most 60 seconds during continuous editing), AI boundaries, and orderly shutdown. Opening **History** flushes the latest saved state. The history timeline compares a selected version with the current project or another saved version. Inspect text diffs, label milestones, download a historical source ZIP, or restore one file while preserving other files and compiler settings. Stale file comparisons are rejected. Named checkpoints remain available. Snapshots deduplicate unchanged file bytes, and restoring one first saves the current state for recovery. No automatic history deletion is configured.
- Compile with the button or **⌘Enter** in the editor. The lightning button enables debounced automatic compilation. Stop build cancels the process group. Clean rebuild uses a fresh snapshot, as do ordinary builds.
- Every compile has a two-minute timeout. Diagnostics link to source lines; **Fix with AI** prepares a request for you to send. Failed builds retain the previous PDF with a stale-preview label.
- PDF pages form one continuous scrollable document. Scroll from the first page to the last; the page counter follows the visible page, and the arrow buttons scroll to adjacent pages. Zoom, panel resizing, and recompilation preserve your reading position. Focus the preview to use Page Up/Down or Home/End. Nearby pages render on demand to keep long documents responsive. Fit-to-width and download remain available. **Go to PDF / ⌘⇧J** uses SyncTeX; double-click a PDF position to return to source. A stale PDF maps to its historical compile snapshot, so rebuild for precise locations after edits.
- Export source ZIP from the project menu. Download PDF from the preview toolbar.
- Dark, Light, and System themes are in Settings. Panel separators support pointer dragging and arrow keys when focused.

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
pnpm test
pnpm build
pnpm verify:compiler --timeout
pnpm verify:sample /absolute/path/to/sample.zip
```

Compiler verification requires installed TeX tools and permission to launch macOS sandboxed processes. The sample script keeps the supplied document private under gitignored `data/verification`; only the synthetic project ships in source.

To explicitly test an installed CLI using its subscription allowance, run `pnpm verify:cli codex` or `pnpm verify:cli claude-code`. These generate text for synthetic documents and check Manual Type plus Review Edits Apply/Undo. No private project is sent. The ordinary test suite uses deterministic fixtures and does not consume model usage.

[Verification results](docs/verification.md) distinguish fixture tests, real compiler checks, browser checks, and untested live API calls. [Investigation notes](docs/investigation.md) separate REA archive evidence, browser observations, and implementation decisions.

For browser testing without credits, stop the normal API and run `node --import tsx scripts/serve-fixture.ts` alongside Vite. Its project is clearly labelled synthetic and stored in `data/browser-fixture`. It replaces provider generation in memory and never calls a provider. Stop it and restart the normal app when finished.

First release excludes hosting, accounts, collaboration, shared comments/history, Zotero, voice, and literature search. Biber was not installed on the development machine; Biber detection is verified, but Biber execution requires installing it through your TeX distribution.

The ongoing [Overleaf parity ledger](docs/overleaf-parity.md) distinguishes implemented features from remaining local editor work and later hosted collaboration. Full Overleaf parity is not yet delivered.

`npm run verify:word-count` exercises real TeXcount with synthetic files: includes, categories, nested roots, blocked outside reads, ignored shell commands, snapshot cleanup, and current/stale compiled bibliographies. Counting follows TeXcount macro rules and `%TC` directives; it may differ from journal-specific counts. Biblatex counting is limited. The reference index covers up to 16 MB of source; word-count snapshots cover up to 32 MB of project text and have a 15-second timeout.

`npm run verify:source-tools` compiles synthetic generated tables, figures, lists, and the complete symbol catalog, including a nested root and an asset path with spaces. The insertion tools generate source; Visual mode also exposes basic existing-table cells for source-fragment editing. Advanced table structures remain available through Code view or their source chip.

`npm run verify:visual-editor` compiles source with preserved custom macros, escaped literal characters and Unicode, a heading split with nested formatting, and a split list item. Visual mode offers a source-backed writing view. Custom macro expansion, rich HTML clipboard interchange, and advanced table layout still need further work. Compile for the final document layout.

`npm run verify:project-search` compiles a synthetic multi-file project before replacement, after reviewed replacement, and after exact project Undo. Search excludes binary/deleted files, non-UTF-8 text, and text files over 2 MB, limits a scope to 32 MB, and displays the first 1,000 matches. Replacement previews reject more than 5,000 matches and expire after 30 minutes; applied replacements remain recoverable in project history. Original/replacement downloads are available for large diffs.
