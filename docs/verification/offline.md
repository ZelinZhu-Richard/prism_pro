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
