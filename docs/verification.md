# Verification — 2026-10-31

## Automated checks

`pnpm test`: **79 tests passed**. `pnpm build`: TypeScript and the optimized Vite production build passed.

Tests cover:

- Nested ZIP round-trips with exact binary bytes; archive traversal, symlink, case, prefix-collision, and size rejection.
- Revision conflicts, atomic multi-file Apply/Undo, checkpoint restoration, Trash, renames, and restart persistence.
- Fragmented Unicode (including combining marks, split surrogate pairs, and ZWJ emoji); pause, speed changes, stop, and preservation of partial output.
- One CodeMirror Undo restoring the original selection and text despite long intervals between inserted characters.
- One provider request per Manual Type run; file/compile locking; autosaved progress; exact server Undo; network failure; conflicting revisions; interrupted restart and abandoned-lease recovery.
- Provider-local cheapest-model selection, context capacity, unavailable models, missing prices, stale catalogs, and explicit selection requirements.
- Deterministic OpenAI, Anthropic, DeepSeek, Gemini, and Qwen streams: UTF-8 fragmentation, tool calls/results, normalized token usage, cancellation, truncated streams, sanitized HTTP errors, and output-limit handling.
- CLI set/status/remove, private file permissions, alias cleanup, environment precedence, multiline configuration preservation, symlink and injection rejection.
- Gemini tool-call signature round-trips, Qwen regional endpoint validation, and expired promotional-price rejection.
- Loopback Host/Origin/header validation and minimal credential-free compiler environments.
- Codex CLI and Claude Code login metadata, isolated arguments/environments, fragmented Unicode JSONL, duplicate-output suppression, usage, sanitized failures, and required completion events.
- CLI Manual Type uses one generation process; both backends exercise multi-file Review Edits, exact Apply/Undo, and no API-key dependency.
- CLI cancellation during login preflight, process timeout, and forced termination of a descendant that ignores SIGTERM.
- OS user identity is preserved for saved CLI logins while API keys, OAuth token overrides, SSH-agent sockets, and executable-code environment variables remain excluded.
- ZIP `./` root markers, hidden/metadata omission reports, normalized collisions, protected paths under hidden directories, and symlink/encryption/size checks on skipped members.
- Import API success and metadata-only rejection; drop-event navigation prevention and one-file/type/size validation.
- Continuous 19-page PDF layout, visible-page tracking, mixed page sizes, bounded nearby rendering, page-relative zoom/resize anchors, and shorter-document clamping.

Machine-readable unit output is in ignored `data/verification/unit-tests.tap`.

The provider/CLI extension passed 51 tests; its report is in `data/verification/provider-cli-tests.tap`. `python3 scripts/verify-key-prompt.py` additionally exercised the real terminal prompt with synthetic keys: immediate paste did not echo, saving succeeded, and Ctrl-C kept the existing configuration intact.

## CLI generation checks

Codex CLI **0.165.0** passed live synthetic Manual Type and Review Edits checks using its existing ChatGPT login, including exact insertion/Undo and proposal Apply/Undo. The model added a trailing blank line to one proposed file; the test compares Apply against the actual proposal, then confirms Undo restores the original source exactly.

Claude Code **2.1.314** passed live synthetic Manual Type and Review Edits checks using its existing login: two generation calls, exact insertion/Undo, and exact proposal Apply/Undo. An initial misleading **Login expired** error was traced to Prism stripping `USER` and `LOGNAME` from the subprocess environment. Keeping those OS identity fields fixed generation; credential variables and SSH-agent sockets remain excluded. No private project was used in either CLI smoke test.

The original 68-test report is retained in ignored `data/verification/cli-backends-tests.tap`; the 69-test regression report is in `data/verification/cli-login-fix-tests.tap`. Synthetic live reports remain under `data/verification/cli-*`. `pnpm verify:cli codex|claude-code` explicitly consumes subscription usage and is separate from the fixture test suite.

## Real TeX integration

`node --import tsx scripts/verify-compiler.ts --timeout`: **13 checks passed**, using the installed TeX Live 2026 tools and macOS sandbox.

- pdfLaTeX, XeLaTeX, and LuaLaTeX compiled multi-file source and BibTeX references.
- Nested root documents and PDF figures compiled; Unicode compiled with XeLaTeX.
- Forward and inverse SyncTeX returned valid project locations.
- Compiler errors included source lines; the last successful PDF survived a failed build and remained associated with its older source generation.
- Missing package errors were visible; missing Biber was detected before launch.
- Shell escape and an imported `latexmkrc` did not execute test commands.
- The sandbox denied reads/writes outside the build, denied writes to the source snapshot, and denied network access. Only output/home directories are writable.
- Cancellation terminated a running process group. A real runaway TeX job was terminated after the two-minute timeout.

Detailed compiler results are retained locally in ignored `data/verification/`.

## Private sample compatibility

The supplied private export imported and compiled successfully, preserving nested paths and exact file bytes on ZIP round-trip. Supporting scripts were not executed. The exported reference PDF did not exactly match the source document; this establishes import/compile compatibility, not an exact reference-output match. Detailed comparisons and the original evidence record stay in ignored `data/verification/`.

On October 31, a second user-supplied archive reproduced the import failure through its `.gitignore` member. With the fix, 44 project entries imported and `.gitignore` was the only skipped entry. Hash comparisons confirmed an exact ZIP round-trip for the imported file contents. The supplied archive was then imported through the built-in browser's file chooser into an isolated workspace and compiled successfully to PDF with no compile errors; the build log contains TeX warnings. Source, generated PDFs, reports, and screenshots containing the paper remain in ignored local data. The paper was not sent to an AI provider or published.

## Built-in-browser checks

All browser inspection used Codex's visible in-app browser. No personal browser, native desktop automation, or external browser runner was used.

The normal application rendered the synthetic project and real compiled PDF. An isolated synthetic provider server exercised Manual Type without paid requests: cheapest-model selection, Unicode insertion, Pause, Stop with retained text, prevention of competing keystrokes, Instant completion, exact generated text, server Undo, one-step keyboard Undo, and restoration of the regular Review Edits model. Backend metadata confirmed exactly two generation calls for two Manual Type runs, including the stopped run; the completed run's saved visible text exactly equalled its generated text.

Review Edits produced a visible source diff; Apply changed the title and Undo restored it. Light/dark appearance, visible focus rings, keyboard panel resizing, the file tree, source outline, preview, and model settings were inspected. Unit tests exercise the additional lifecycle/error branches listed above.

The synthetic test server was stopped after testing. The delivered preview uses the normal production backend and synthetic demonstration document.

The five-provider Settings panel was inspected in dark and light themes. Gemini and Qwen model selectors, explicit Manual Type selection, and restoration of each provider's regular Review Edits model passed in the built-in browser. No live verification or generation requests were sent. See [provider settings](screenshots/prism-five-providers.jpg).

The later CLI extension was inspected in both themes. Settings separates API keys from Local CLI login and successfully checked the installed Codex login. The composer exposes both CLI backends, preserves the regular Claude model on entering Manual Type, and restores it after an explicit Manual Type model change. These browser checks did not generate text; live generation was exercised separately through the backend smoke script. See [CLI settings](screenshots/prism-cli-login.jpg).

The import dialog was inspected in light and dark themes, with keyboard focus on the chooser and a successful user-supplied ZIP import, skipped-entry summary, and compile. Browser tests ran on an isolated local workspace on port 5173, leaving the user's server on 4317 untouched. Drop-event behavior and invalid-file validation use deterministic fixtures; an OS file-drag gesture was not automated. The unit report is in ignored `data/verification/zip-import-tests.tap`. See the [import dialog](screenshots/prism-import-dialog.jpg).

A synthetic 19-page document was compiled for continuous-preview browser checks. Page Down traversed the stack to page 19; all 19 page placeholders remained present while only four nearby canvases were mounted at the end. Previous/Next, Home, zoom, fit-to-width, keyboard panel resizing, light/dark themes, and forward/inverse SyncTeX on page 19 passed. Recompiling while reading page 10 kept the preview on page 10. No browser console errors were recorded. The 79-test report is in ignored `data/verification/continuous-preview-tests.tap`. See the [continuous PDF preview](screenshots/prism-continuous-preview.jpg).

## Limits of verification

- Live OpenAI, Anthropic, DeepSeek, Gemini, and Qwen generation was **not tested**: no user API keys were supplied for live smoke tests. All five adapters passed deterministic fixtures.
- Biber execution is untested because Biber is absent. Detection and actionable error reporting passed; nothing was installed automatically.
- This release is local, single-user, and macOS-first. Hosting, accounts, live collaboration, shared comments/history, Zotero, voice, and literature search remain deferred.
- The PDF preview is canvas-based; it has navigation and SyncTeX but no full PDF text-selection accessibility layer.
