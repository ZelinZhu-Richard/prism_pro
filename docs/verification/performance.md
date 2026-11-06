# Large manuscript performance

## Reproduce

Run `npm run build` followed by `npm run verify:performance`. The verifier needs the installed macOS TeX toolchain and Poppler’s `pdfinfo` and `pdftotext`. It generates a new ordinary project folder and Leaf database under `data/verification/performance-*`. The fixture uses the existing local compiler and synthetic text, citations, figures, tables, equations, and supporting notes. It does not use project files or API credentials from the regular Leaf workspace.

Add `-- --browser` to the verifier command for a production preview on loopback port 5173. Open the printed URL in Codex’s built-in browser. Select **Open large-manuscript**. In **Settings → Editor**, select and save **Manual save** for the typing sample. Use the file tree to open `sections/long-appendix.tex`, enter one character, then Undo. In the PDF toolbar, jump to 181, 92, and 1, and zoom in once. Focus **Editor and preview split** and press Right then Left. Trigger **Clean rebuild**, open `sections/chapter-042.tex` while **Stop build** is visible, and let the build finish. For the backend idle sample, leave the browser visible with the project open and press Enter in the verifier terminal. Press Enter again after the 15-second sample to close the fixture and save the report.

The verifier records endpoint durations in `report.json`. These are in-process Fastify requests with JSON decoding where applicable. Build measurements use real sandboxed tools and include polling until completion. Browser interaction timings below use the automation client's monotonic clock around an action and a visible completion condition. They include tool dispatch and locator work. Their differences should be interpreted alongside the raw samples and observed browser behavior.

## Baseline on 2026-11-06

Apple M4 Pro, 14 logical cores, 48 GiB memory, macOS 27.0.1, Node v22.23.2, TeX Live 2026 Basic, and a built-in browser viewport 1280 CSS pixels wide. The project had 363 files and 976,694 bytes, including 60 chapter files, 60 PNGs, 240 notes, 60 bibliography entries, and a 412,680-byte editable appendix. The incremental PDF had 184 pages and 234,235 bytes. The exact source ZIP was 103,259 bytes.

### Backend and compiler

| Operation | Time |
| --- | ---: |
| Fresh Node process through Fastify ready | 406.73 ms |
| Start loopback listener | 2.35 ms |
| Review and open the linked folder | 60.89 ms and 97.80 ms |
| Project metadata, first timed read and median of five repeats | 1.69 ms and 1.30 ms |
| Large source load, first timed read and median of five repeats | 2.59 ms and 1.95 ms |
| Indexed disk check, first timed read and median of five cached repeats | 71.87 ms and 0.17 ms |
| Project search, first timed request and median of five repeats | 94.38 ms and 86.85 ms |
| Save the large source | 24.55 ms |
| Clean build and incremental rebuild after the source edit | 1,679.45 ms and 670.70 ms |
| Stop an active TeX pass and drain its process group | 29.15 ms |
| Create the source ZIP | 24.88 ms |

The verifier checks the changed appendix and chapter 60 in the real PDF, reuse of the earlier build state, the last successful PDF after cancellation, and exact ZIP bytes for every source and asset. Automatic compilation delay is covered by the separate [editor workflow](editor-workflow.md) timing test.

### Built-in browser

| Interaction and completion condition | Recorded time |
| --- | ---: |
| Open project from the loaded library until first-page text is visible | 347 ms |
| Switch to the large appendix until its saved text is visible | 330, 331, 323 ms |
| Insert a character until the edited line is visible | 59, 51, 54 ms |
| Filter the tree to one figure | 48 ms |
| Jump to pages 181, 92, and 1 until target text is visible | 166, 36, 30 ms |
| Zoom in until the page raster changes width | 320 ms |
| Resize the split one step with the keyboard | 35 ms |
| Open a different source while a clean build runs | 639 ms after starting the build |

One Undo restored the clean buffer after each typing sample. The three page jumps left 5, 5, and 3 page canvases mounted. Zoom changed the first-page raster from 824 to 988 pixels wide. The clean build returned to **Compile** after 2,781 ms in the browser, and **Stop build** was still available when the other source opened.

### Idle backend

| 15-second sample | Node CPU time | Node RSS at end | Backend requests |
| --- | ---: | ---: | ---: |
| No browser | 125.73 ms | 100.23 MiB | 0 |
| Project visible and untouched | 175.39 ms | 117.88 MiB | 30 |

The visible-project sample contained 12 assistant activity reads, 3 disk status reads, and 5 reads each for tracking status, tracked file data, and comment anchors. The last three read the same open document on the same three-second schedule and account for half the requests. This is a measured candidate for consolidating the review read while preserving its cadence. The idle sample measures the Leaf backend process and its threads. Browser CPU and total machine memory were outside this measurement.

Raw backend receipts are in `data/verification/performance-711bbf14-6f76-46d6-ae47-e2423e671691/report.json`. These values are one machine’s observed baseline. The verifier asserts correctness and uses a bounded wait for each real build. It does not set cross-machine timing thresholds.

Two CLI-only runs reproduced the fixture, its page count, and the exact saved appendix bytes. Across all three runs the full build ranged from 1,640 to 1,724 ms and the incremental rebuild from 661 to 688 ms. One repeat’s idle timer returned after 323 seconds, so its idle result was excluded from the 15-second comparison. The finalized verifier records the target and actual duration and flags intervals more than 20% over target as incomparable. Its final CLI run recorded 15,001.25 ms elapsed with 52.21 ms of Node CPU time and zero requests. CLI receipts are in `data/verification/performance-56ad66cf-c9f0-422f-a583-8e96fac29946/report.json` and `data/verification/performance-168ebcf6-927a-4d59-8faa-8da77f1d026c/report.json`.
