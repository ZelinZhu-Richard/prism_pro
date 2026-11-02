# Final-pass compiler diagnostics

Verified 2026-11-01 with synthetic projects. Resolved citation/reference warnings no longer persist from earlier compiler passes. Genuine final warnings and TeX/BibTeX/Ghostscript failures remain visible. This is a backend diagnostics fix, not completion of the broader editor/chat/parity goal.

Reference: [Overleaf’s error-pane guidance](https://docs.overleaf.com/troubleshooting-and-support/fixing-latex-errors) distinguishes compiler errors, warnings and box warnings; [latexmk](https://www.ctan.org/tex-archive/support/latexmk) repeats TeX and related programs to resolve cross-references. The behavior evidence below establishes this fix’s scope.

## Reproduction and implementation

The recorded pre-fix classic build had six diagnostics although its final TeX log was clean and its PDF bibliography resolved. The old parser collected every pass from combined stdout. Ignored `data/verification/compiler-diagnostics-before.json` preserves that evidence. The initial real verifier also upgraded that actual old job from six diagnostics to zero while asserting exact source/history, job identity, raw log, runtime, status and PDF flags (`compiler-diagnostics-1793589195413/report.json`).

`server/diagnostics.ts` reads the finished snapshot's final TeX `.log` and bibliography `.blg` artifacts. Latest-per-rule console phases preserve tool errors and provide a fallback when the final log is unavailable. Raw console output retains earlier passes for inspection; it is no longer treated as the final warning list. Duplicate messages are removed and errors precede warnings. Lifecycle failures remain errors even with a clean or partial TeX log.

Common C-style and bang errors, multiline package warnings, box warnings and BibTeX/Biber log forms are supported. Managed source names and file-stack context preserve nested-file locations, spaces, filename parentheses, Unicode fixture paths and wrapped names. A browser check exposed a hard-wrapped fatal message ending at “prod”; the correction reconstructs diagnostic-looking wrapped lines, including long file paths, without joining file-stack/source-context records. Explicit generated/installed file error locations are kept in message text rather than inventing a jump to project source.

Reads stay inside the build's immutable source/output tree; log-supplied paths are labels, never read targets. Symlinks, hardlinks and special files are rejected; nonblocking open avoids hanging on a FIFO. Each artifact read is bounded to 1 MB, combined artifact reads to 4 MB total and bibliography scans to 32 files, and inventory traversal to 10,000 entries per tree. Oversized logs use their tail and disclose the limit; missing context does not invent a source location. At most 150 diagnostics are returned, prioritizing errors and disclosing omitted messages. Unrecognized package formats remain inspectable in raw/generated logs; failed jobs always retain an error.

`diagnosticsVersion: 2` records the derived format. New finished jobs use it; older latest builds and explicitly requested historical builds refresh lazily through the project-build and single-build APIs. This changes only derived diagnostics/version metadata. It never recompiles, changes source/history/status/PDF identity, or starts an AI request. Running jobs are not refreshed. Late compiler IPC output cannot mutate a terminal job's saved log or diagnostics.

## Verification

**565 tests** pass, including 15 new diagnostics regressions; TypeScript/production Vite build pass with the existing chunk advisory. Logs: ignored `compiler-diagnostics-full-tests.log`, `compiler-diagnostics-targeted.log`, `compiler-diagnostics-build.log`.

`npm run verify:compiler-diagnostics` passes 12 checks over 11 real confined builds plus a self-contained legacy-metadata migration. It covers resolved references and bibliography on all four engines; a genuine missing citation and its fix; malformed BibTeX with a `.bib` line; persistent package/box warnings; errors in a nested filename containing a space; a genuinely long wrapped filename and complete fatal message; and Ghostscript failure after a clean TeX stage. Each build preserves exact source/history. A deliberately delivered late IPC event leaves finished log/diagnostics unchanged. The migration fixture seeds the old console-only representation from actual multipass output, then verifies unchanged source/history and compile identity after derived refresh. It does not pretend those seeded warnings are a new compiler failure.

Authoritative report: ignored `data/verification/compiler-diagnostics-1793590106731/report.json`; log `compiler-diagnostics-real-final.log`. The final lifecycle regression also passes all five real exit/SIGKILL/shutdown scenarios in `compiler-lifecycle-1793590202321/report.json` / `compiler-diagnostics-lifecycle-final.log`.

Biber remains uninstalled: its diagnostics have deterministic fixture evidence only. One physical TeX Live 2026 Basic installation and Homebrew Ghostscript 10.08.0 were used. No package installation or live provider test occurred.

## Built-in browser evidence and remaining action bugs

Only visible Codex IAB was used, at its observed 1280×720 viewport, on isolated 5173 fixtures. The owner 4317 server and private projects were untouched. Six captures were opened and validated. All carry their synthetic origin; the scoped capture/public/documentation provenance scan reports 101 rasters, zero missing. No UI layout or styling code changed and no new design-review verdict is claimed.

The final PDF visibly resolves citation [1] and Section 1, while Logs has no badge or warning cards and still exposes the combined log. A genuine missing citation shows four final warnings (citation, empty generated bibliography, unresolved-reference summary and one deduplicated BibTeX missing-entry warning). Its link opens `sections/paragraph.tex` at line 2. Errors in a filename containing a space and a long filename also navigate to line 2; the final fatal message is complete.

Initial browser audit: `compiler-diagnostics-browser-audit-initial.json`, exact four-project source/history, zero generations/runs/chats/live groups, 11 terminal jobs. Final audit: `compiler-diagnostics-browser-audit.json`, exact five-project source/history, zero generations/runs/chats/live groups, 12 terminal jobs including the deliberate browser missing-citation fixture. Prompt preparation in the initial fixture saves an unsent draft only. Both owned test servers and tab 66 were closed afterward.

Two separate interface bugs remain reproduced and unfixed:

1. Clicking **Fix with AI** while another file is active prepares the diagnostic's filename in the prompt but leaves Document scope on the previous file. Opening the diagnostic link first aligns context. This directly limits error-fix assistance and is next work; no send occurred during reproduction.
2. Very long diagnostic source labels still overflow horizontally, although their accessibility text, underlying data, full message and source navigation are correct. This is a presentation fix, not proof of missing path data.

Ignored captures under `data/verification/diagnostics-browser/`: `clean.jpg`, `resolved-preview.jpg`, `missing-linked.jpg`, `fix-ai-context-before.jpg`, `error-linked-before-wrap-fix.jpg` (the superseded truncated-message evidence), and `long-error-linked.jpg` (correct data with the overflow still open). These are functional evidence at their named scope, not a whole-editor accessibility/mobile/visual certification. The wider goal remains active.

[Resolved source, PDF and clean Logs badge](../screenshots/prism-diagnostics-resolved.jpg).
