# Compiler ownership, backend exit and restart recovery

Verified 2026-11-01 with isolated synthetic projects. The previously reproduced backend-exit compiler leak is fixed for newly supervised jobs. The broader parity/reliability goal remains active; subsequent [final-pass diagnostics](compiler-diagnostics.md) verification is recorded separately.

## Reproduction before the fix

After the backend exited during an infinite TeX loop, latexmk was reparented and pdfLaTeX continued running. Reopening managed app data marked the job failed although the original group was still live. Its two-minute timer belonged to the exited backend and could no longer fire. Evidence remains in ignored `data/verification/compiler-owner-exit-before.json`, `compiler-owner-exit-before.log` and `repro-compiler-owner-exit.ts`. The probe cleaned only its freshly owned group; a later signal-0 check returned ESRCH.

Node's [detached-process documentation](https://nodejs.org/api/child_process.html#optionsdetached) and [IPC disconnect event](https://nodejs.org/api/process.html#event-disconnect) informed the implementation. Runtime behavior below, rather than that documentation alone, proves the fix's tested scope.

## Implemented lifecycle

- Each new compiler job runs under trusted `server/compiler-supervisor.mjs`, started as a POSIX group leader through the absolute Node executable. The confined compiler inherits that same group. No imported script, inherited Node loader/options, API credential or user compiler configuration is executed. The existing macOS profile, minimal compiler environment, disabled shell escape and immutable source snapshot remain.
- The backend atomically records the new supervisor identity before sending the start message. Losing its IPC connection, including backend SIGKILL, causes the independent helper to stop the group. Losing the parent before the handshake starts no compiler. No paid request is started or resumed by compiler recovery.
- The helper enforces the two-minute deadline independently. Stop/deadline/parent-loss send TERM; after one second, resistant descendants and the still-live anchor receive KILL together. The anchor stays alive through escalation, preventing a late signal from targeting a recycled leader PID. A finished launcher cannot leave background descendants unbounded.
- Cleanup is armed independently of status-journal success. A fault-injection regression first reproduced a hung group when the journal destination was unwritable; the corrected helper still drains it. UTF-8 output is bounded to 1 MB and streamed locally. Private atomic identity/result files and the log live outside the compiler's writable out/home.
- `server/supervision.ts` validates bounded, non-symlinked metadata and matching result tokens. It observes processes read-only; the app never signals a PID merely loaded from disk. Unknown/failed process observations do not prove cleanup. Zombies are excluded because they cannot execute or write output.
- Stop remains running until observed live members drain. Restart retains that busy state, then records interrupted failure and hides interrupted output, including Continue mode and a seeded valid earlier PDF. Last successful output remains available. Old jobs without supervision metadata fail conservatively. Graceful app close awaits `compiler.shutdown()` before closing storage.

## Verification

`npm test`: **550 passed**, including ten new process/journal regressions. `npm run build`: TypeScript and production Vite build passed; the existing chunk-size advisory remains. Current ignored logs: `compiler-supervision-full-tests.log`, `compiler-supervision-build.log`.

New regressions cover fragmented Unicode, credential/Node-option isolation, a TERM-resistant descendant, independent deadline escalation, parent IPC loss, pre-handshake loss, a successful launcher leaving a background child, busy restart with a deliberately wrong live identity (never signaled), journal write failure, malformed/mismatched/oversized metadata and deadline bounds. Existing legacy/template restart tests remain green. The initial IPC-only test harness incorrectly waited for stdio-close after disconnect; process exit plus explicit group observation now controls both the implementation's drain path and the bounded test wait.

`npm run verify:compiler-lifecycle` passes five real scenarios: backend ordinary exit during TeX; backend SIGKILL during TeX; backend SIGKILL during the actual Ghostscript stage; immediate post-launch backend exit; orderly Fastify app close during TeX. Each preserves exact project/source/history, keeps the earlier successful PDF, rejects interrupted output and permits a genuine subsequent compile. Four scenarios seed a known valid earlier PDF solely to test the promotion gate; those bytes are never represented as output produced by the interrupted compiler. Live busy recovery was directly observed during the Ghostscript-kill and early-exit cases. Graceful close reports zero owned compiler processes before storage/server completion.

Authoritative lifecycle report: ignored `data/verification/compiler-lifecycle-1793587153240/report.json`; log `compiler-lifecycle-real.log`. Five scenarios each create baseline/interrupted/recovery jobs; the early case intentionally need not reach an actual TeX process.

`node --import tsx scripts/verify-compiler.ts --timeout` passes all 13 existing real checks on final source, including a full deadline measured at **120,139 ms** (TERM cleanup completed within that observation). Report: `data/verification/compiler-1793587104079/report.json`; log `compiler-supervision-real-timeout-final.log`. Shell-escape/config disabling, outside reads/writes/network denial, errors/last-good recovery, missing dependencies and ordinary cancellation remain green. The production deadline is 120,000 ms followed by at most the one-second escalation interval; constructor-only test limits can shorten it, never extend it, and no HTTP/environment setting changes it.

The four-engine verifier also passes on final source: twelve genuine confined jobs, eleven recorded outcomes plus cancellation during actual Ghostscript, no skipped engine. Nested source, BibTeX, EPS/PNG, Normal/draft, Stop/Continue, generated files/ZIP round-trip, bidirectional SyncTeX and independent outside-read denial remain green. Report: `data/verification/tex-runtimes-compiler-1793587154304/report.json`; log `compiler-supervision-four-engines.log`; actual converter cancellation job `454edb94-e2e7-41b0-a410-7cf83996502f`.

A final read-only audit inspected all 37 jobs across the lifecycle, four-engine and existing-compiler verifier roots: every job was terminal and all recorded groups had zero live members. It records the final source hashes in ignored `data/verification/compiler-supervision-final-audit.json`.

No browser/UI code or visual flow changed, so this backend-only batch makes no new browser/visual-review claim. All data/evidence stays inside Prism. The owner’s 4317 server, private projects and protected siblings were untouched; only fresh test-owned backend handles/groups were terminated. No live provider call or package installation occurred.

## Boundaries

This does not adopt orphan processes started by older versions without identity metadata. Externally corrupted/missing journals cannot reconstruct unknown process ownership. If process observation is unavailable, supervised recovery stays busy conservatively. Force-killing the supervisor itself or a trusted tool deliberately escaping its process group is outside the tested backend-loss guarantee; the app never compensates by blindly signaling saved PIDs. Installed compiler binaries remain trusted local software. Historical TeX versions, live Biber and live providers were not newly verified. Intermediate-pass warnings were separately corrected in the later [diagnostics batch](compiler-diagnostics.md); its action/presentation limits remain explicit.
