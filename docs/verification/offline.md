# Managed-project offline acceptance

Verified 2026-11-02. This is a bounded acceptance pass for the current local browser app, using only a synthetic manuscript. Desktop packaging and ordinary external-folder ownership remain separate work.

## Reproducible backend check

Run `npm run verify:offline` after building the app. `scripts/offline-fixture.ts` creates a nested source/BibTeX/PNG/math ZIP with an empty folder, inert shell script and compiler configuration sentinel. It removes provider keys only from the fixture process, makes CLI paths unavailable through supported overrides, rejects outbound `fetch` before DNS, and rejects loopback redirects. An explicit `.invalid` probe proves the guard; it is recorded separately from product requests. No machine network settings or owner's login files change.

Final run: **6/6 PASS**, TypeScript PASS. Evidence: `data/verification/offline-real-1793633802107/report.json`, `data/verification/offline/final-real-verification.log`.

- Real multipart import strips the enclosing folder while retaining nested source, binary bytes and empty directory; hidden compiler configuration is reported and skipped.
- Source edits/save work with no configured provider or CLI login.
- Real pdfLaTeX/BibTeX produces a two-page PDF containing edited text, references, equation and figure. PDF bytes download successfully.
- Included-file forward/inverse SyncTeX, bibliography/label indexing, project search, TeXcount and both bundled dictionaries work locally.
- An actual included-file compiler error reports file/line, preserves the previous PDF and compiles after a manual correction.
- ZIP round-trip is byte-exact for current sources/assets/directories. Imported scripts/configuration remain inert. Zero AI generations, runs, chats or outbound backend fetch attempts. All three real build groups drain.

## Built-in browser check

Visible IAB tab74 used an isolated, empty 5173 app with the same synthetic ZIP and guard. A fixture-only response policy restricts connections, fonts, workers and scripts to the local origin (local blob workers/data images allowed). It does not change the production app's policy or certify OS network isolation.

The real Import dialog/chooser displayed the skipped `.latexmkrc` notice, then opened the project. In `sections/introduction.tex`, typing `Offline additions remain local.` and Cmd/Ctrl S followed by Compile produced the real PDF with that sentence. Both pages have selectable text; the Next page control reaches page2 while both pages remain in the continuous preview. Local reference search finds `local2026` / “Local Verification”. Word count reports49 body words, one inline and one displayed equation. Both US and UK spelling dictionaries load; the US result offers `accuracy` for deliberate `acccuracy`. Visual mode renders inline math using local KaTeX fonts.

Final status proves zero AI generations/runs/chats, zero outbound backend attempts and no local HTTP4xx/5xx responses. The PDF worker, spelling worker and math fonts were served locally; browser warning/error log is empty. Source ZIP and PDF download endpoints return valid bytes. Evidence: `data/verification/offline-browser/{status,console}.json`, ZIP/PDF artifacts and five screenshots. Public synthetic example: [continuous PDF](../screenshots/leaf-offline-pdf.jpg).

The owned tab/server were closed after checks. Owner4317, private manuscripts and holdout were untouched. No provider request, installation, OS network change or personal browser was used.

## Limits

This verifies managed project import/edit/save/compile/read/local authoring/export under application-level network guards. It is not an OS-disconnected installation/cold-cache or exhaustive socket audit, nor native file-save-dialog certification. Some app assets returned local304 responses. Package installation still requires cached dependencies or connectivity; installed TeX/BibTeX/TeXcount were used, live Biber was not tested. Arbitrary external-folder opening, unindexed discovery, automatic watching, full power-loss durability and the remaining Leaf plan are not claimed complete. No product UI changed in this verification-only increment; the last runtime suite remains658 passing tests and the last production build remains valid.

## Linked-folder release check

Run `npm run verify:offline-release` from an installed Leaf checkout on macOS. Add `-- --browser` to keep the isolated loopback fixture open for built-in browser testing. Press Enter to stop it and write the report. The verifier builds assets under a unique URL prefix for each run, uses fresh backend home directories, and stores evidence and synthetic files under `data/verification/offline-release-*`.

Five automated checks passed in two separate environments.

- A fresh production asset build served by Leaf’s production app factory starts under a macOS profile that permits the loopback listener and denies outgoing sockets. The outbound TCP canary receives `EPERM`. Opening a linked folder, saving, mirroring a draft and exporting exact ZIP bytes work. A fresh backend process retains both the outside edit and the unsaved draft.
- In a separate process, a fixture guard blocks backend TCP/UDP and fetch calls and a same-origin browser policy restricts asset loading. Leaf uses its ordinary compiler sandbox. The synthetic multi-file, figure and BibTeX project compiles twice. Conflict review preserves an external edit, incremental compilation regenerates the PDF, and the earlier PDF is byte-exact. Forward and inverse SyncTeX, references, search, TeXcount, both bundled dictionaries and exact ZIP export pass. Imported script and compiler configuration sentinels stay inert. The report records zero outbound socket or fetch attempts and zero AI requests.

In the built-in browser, the linked manuscript rendered two selectable PDF pages. An edit to its included source appeared in a real recompile, and the Visual editor loaded its local math fonts. The asset response log shows HTTP 200 and `Cache-Control: no-store` for the unique JavaScript, PDF worker and math-font URLs. A separate browser run exercised stale Open Folder reviews and move recovery with the same fixture guards.

macOS rejected the nested TeX sandbox inside the process subject to OS socket denial. The isolated application and compiler checks therefore use separate processes. Whole-machine disconnect and dependency installation without a package cache remain unverified. Evidence is under `data/verification/offline-release-71118f42-0d33-444e-9601-078f11e665bf/` and `data/verification/offline-release-793ea02f-846f-4c0e-9fab-e677018b58b9/`.
