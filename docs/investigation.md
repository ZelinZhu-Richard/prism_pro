# Investigation record — 2026-10-30

## Browser observations

The user signed in and opened a sample paper in Prism's built-in browser tab. Observed features included a left file tree and outline, source tabs, right PDF preview, bottom assistant composer, compiler choices, export ZIP, project actions, and a Tools area for project information, versions, comments, and logs. Compile warnings had a Fix with AI action.

These are UI observations, not recovered implementation details. Prism's client bundle was not recovered: direct artifact access returned HTTP 403 and the available in-app browser did not expose a CDP endpoint for REA runtime capture. Prism's backend was not recovered. No claims about its internal storage, APIs, or model orchestration are made.

## REA archive evidence

REA inspected the user's exported single-project ZIP independently of browser observations.

- The private archive contained a root document, bibliography, reference PDF, and nested supporting files and assets. The importer preserved its relative paths and bytes on ZIP round-trip.
- Original evidence IDs, archive hashes, and the detailed compatibility report are retained locally under ignored `data/verification/`.
- Supporting scripts were inspected only as archive members; none were executed.

The export and compatibility results are private and excluded from source control. The application ships a synthetic demonstration document.

## Implementation decisions

React, CodeMirror 6, PDF.js, Fastify, SQLite, local files, and the macOS `latexmk` sandbox are independent engineering choices. Review Edits uses revision-bound proposals. Manual Type is a new, explicitly labelled AI typing mode with provider-local cost routing and local grapheme animation. No proprietary assets, source bundle, backend protocol, or branding assets were copied.

This is an independent local implementation inspired by the observed workflow, not a recovered or drop-in implementation of Prism's service.
