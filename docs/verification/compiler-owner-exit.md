# Backend-exit compiler cleanup — reproduced, not yet fixed

A synthetic reproduction on 2026-11-01 confirmed a gap in the current compiler lifecycle. After the backend exited during a running infinite TeX loop, latexmk was reparented and pdfLaTeX continued running. Reopening the same managed app data marked the job failed, although the original process group remained live. Its two-minute timer lived in the exited backend and could no longer fire.

The probe used only a fresh synthetic project under Prism's ignored data/verification directory. It passed the newly owned process-group identity through an IPC channel, then terminated that exact group in finally. A later signal-0 check returned ESRCH, confirming cleanup. The owner server on 4317 and ordinary projects were not touched.

Evidence: ignored data/verification/repro-compiler-owner-exit.ts, compiler-owner-exit-before.json and compiler-owner-exit-before.log. This is behavior evidence, not a theoretical finding. Node's [child-process documentation](https://nodejs.org/api/child_process.html#optionsdetached) explains detached process groups and surviving children.

The next fix must enforce parent-loss cleanup and the wall-clock timeout independently of the backend process. It must keep builds busy until real cleanup completes, recover truthful status on restart, retain the prior successful PDF, avoid promoting timed-out/interrupted output, retain credential isolation and macOS confinement, and never signal arbitrary processes from stale persisted PIDs. Test normal exit, Stop, ignored TERM/escalation, backend SIGKILL/exit, restart during cleanup and the full deadline. This work remains open; no supervisor implementation has landed yet.
