# Leaf: Full Product Audit, Completion, and Quality Assurance

## Your role

Act as the principal engineer, desktop application architect, LaTeX tooling specialist, product designer, and QA lead for **Leaf**, a local-first, professional LaTeX editor.

Your assignment is to examine the existing Leaf repository, determine what is implemented, identify incomplete or broken functionality, and **directly implement all feasible missing features** until Leaf meets the product specification below.

This is an implementation task, not merely a planning, commentary, or recommendation task.

Work autonomously, make defensible technical decisions, and verify your work. Do not ask for confirmation on ordinary implementation choices.

**Do not claim a feature is complete simply because its UI exists. A feature is complete only when it works end to end and its behavior is verified.**

---

# 1. Product vision

Leaf should be the best practical local LaTeX writing experience for students, researchers, scientists, mathematicians, and academic authors.

Combine:

- **Overleaf:** Accessible project management, easy editing, live PDF previews, understandable compilation, and intuitive writing workflows.
- **ChatGPT Prism:** Modern scientific-writing ergonomics, integrated document context, fluid navigation, and elegant interactions. Do not reproduce its cloud or AI dependencies.
- **VS Code / LaTeX Workshop:** Powerful source editing, shortcuts, diagnostics, search, and configurable toolchains.
- **TeXstudio:** Deep LaTeX support, local compilation, mathematical tools, and professional-document workflows.
- **Leaf's distinctive advantage:** Private, fast, reliable, offline-capable, locally owned, and beautifully integrated.

The user should be able to launch Leaf, open a LaTeX project, edit it, compile it, navigate between source and PDF, resolve errors, and export the finished PDF without creating an account or accessing a cloud service.

**A successful Leaf is a production-quality writing environment, not a visual demo.**

---

# 2. Ground rules

Before changing code:

1. Inspect the entire relevant repository structure.
2. Read the existing `AGENTS.md` and other applicable project instructions.
3. Identify the actual application framework, architecture, build tooling, and dependencies.
4. Inspect existing functionality before deciding whether anything needs replacing.
5. Preserve user data, project files, existing features, and unrelated uncommitted changes.
6. Prefer improving existing components over introducing redundant implementations.
7. Avoid major framework rewrites unless an architectural blocker makes them necessary.
8. Use established, maintained libraries for mature functionality such as editor engines, PDF viewing, and LaTeX compilation.
9. Do not add a backend server, hosted database, cloud synchronization, mandatory account, telemetry, or AI dependency.
10. All essential functionality must work entirely offline after the local dependencies are installed.

Do not implement decorative buttons, fake compilation statuses, simulated document results, or placeholder interactions presented as finished features.

If something cannot be implemented reliably within the current environment, document the blocker precisely and continue with independent work.

---

# 3. First perform a repository audit

Create `docs/LEAF_AUDIT.md`.

For each major feature, record:

- Feature name.
- Current implementation status: complete, partial, missing, or broken.
- Relevant files and components.
- Observed behavior.
- Evidence from code inspection or actual testing.
- Gaps relative to the specification.
- Implementation priority.
- Verification method.

Also identify:

- Duplicated components or functionality.
- Dead code and unused dependencies.
- Broken or ineffective interactions.
- Unnecessary network requirements.
- UI state that is not connected to actual application behavior.
- Performance bottlenecks.
- Potential data-loss scenarios.
- Security weaknesses around file access and compilation.
- Missing automated tests.

Use the audit to guide implementation. **Do not stop after producing the audit.**

---

# 4. Required product experience

## 4.1 Main application interface

The desktop UI should use a calm, refined, light-mode-first design with excellent information density.

Preferred layout:

**Top toolbar**
- Application and project identity.
- Current document name.
- Save and compilation status.
- Compile control.
- Compiler selection where relevant.
- PDF export.
- Search and command palette access.
- Minimal document and workspace settings.

**Left sidebar**
- Expandable project file tree.
- Create, rename, move, and delete files.
- Drag-and-drop project navigation where appropriate.
- Document outline generated from LaTeX structure.
- One-click navigation to sections, subsections, labels, and references.
- Collapsible sidebar.

**Center editor**
- Main LaTeX source editor.
- Multiple open-file tabs.
- Syntax highlighting.
- Line numbers.
- Code folding.
- Autocomplete.
- Matching braces and environments.
- Error and warning markers.
- Search and replace.
- Keyboard-first operations.

**Right PDF panel**
- Actual compiled PDF.
- Zoom and page navigation.
- Fit-to-width and fit-to-page.
- Full-screen preview.
- Source/PDF synchronization.
- Stable scroll position across recompiles.

**Optional bottom panel**
- Compilation diagnostics.
- Build output.
- Warnings and errors.
- Search results.

Panels must resize smoothly and support hiding, restoring, and switching layouts.

No oversized decorative cards, fake dashboards, excessive gradients, loud colors, or unnecessary AI-oriented visual elements.

The application should resemble high-quality professional productivity software rather than a generic SaaS dashboard.

## 4.2 Core interactions

Ensure every visible control has a real function.

Implement polished:

- Hover and focus states.
- Keyboard accessibility.
- Context menus.
- Tooltips.
- Empty states.
- Loading and compilation indicators.
- Failure and recovery states.
- Confirmation for destructive actions.
- Unsaved-change indicators.
- Persisted workspace preferences.

There must be no nonfunctional buttons or disconnected UI elements.

---

# 5. Local LaTeX environment and compilation

**Priority: P0, release blocking.**

Implement robust local LaTeX tooling.

## Setup

- Detect installed TeX distributions.
- Support existing TeX Live/MacTeX environments.
- Identify available engines such as pdfLaTeX, XeLaTeX, and LuaLaTeX.
- Provide clear setup instructions when required tools are unavailable.
- Allow users to configure executable paths and compilation settings.
- Detect likely project main files and support explicit root-document selection.
- Support standard bibliography workflows using BibTeX and Biber when installed.

## Compilation

- Use established tooling such as `latexmk` where appropriate.
- Compile actual project files, not mocked content.
- Support multipass compilation and cross-references.
- Generate SyncTeX metadata.
- Trigger automatic builds after a configurable idle delay.
- Offer manual build and auto-build modes.
- Avoid overlapping uncontrolled compilation processes.
- Support cancellation and rerunning a build.
- Use a suitable build/output directory.
- Exclude generated artifacts from project-file navigation when appropriate.
- Preserve the last successful PDF if a later build fails.
- Clearly distinguish saved, compiling, successful, failed, and canceled states.
- Do not impose an arbitrary cloud-style compilation timeout.

Improve compilation speed through appropriate caching, change detection, and `latexmk` dependency tracking, rather than rebuilding unnecessarily.

**Security:** Use safe process spawning and structured arguments, not interpolated shell commands. Disable shell escape by default, explain compilation security boundaries, and require explicit user approval for enabling elevated compilation capabilities.

## Acceptance criteria

A user can open a real multi-file academic manuscript, compile it locally, see the PDF, edit source, and rebuild correctly.

Documents containing equations, figures, tables, citations, and cross-references should compile using the appropriate installed toolchain.

---

# 6. Source editor

**Priority: P0.**

Build an IDE-grade LaTeX editing experience using the existing editor architecture where possible.

Required features:

- LaTeX syntax highlighting.
- Environment and brace matching.
- Automatic environment closing.
- Indentation.
- Multiline editing.
- Multiple cursors.
- Undo and redo.
- Line and block selection.
- Code folding.
- Document formatting using available local tools.
- Snippets for common LaTeX environments.
- Completion for commands, environments, packages, labels, and citations.
- Navigation to definitions and references where feasible.
- Project-wide search and replace.
- Configurable font size, tab size, wrapping, and editor theme.
- Reliable editing of large source files.

Support keyboard shortcuts appropriate for macOS, while respecting the supported platforms and existing application conventions.

Examples:

- `Cmd+S`: Save.
- `Cmd+P`: Quick-open a file.
- `Cmd+Shift+P`: Command palette.
- `Cmd+F`: Find.
- `Cmd+Shift+F`: Project-wide search.
- `Cmd+Enter`: Compile, unless the existing shortcut system defines a better convention.

All shortcuts should be discoverable and configurable where practical.

---

# 7. PDF preview and navigation

**Priority: P0.**

Implement a reliable integrated PDF viewer.

Required:

- Render real compiled PDFs.
- Zoom.
- Page navigation.
- Continuous scrolling.
- Fit to width.
- Fit to page.
- Full-screen or focused preview.
- Open the compiled PDF externally.
- Export or reveal the output PDF in the filesystem.
- Preserve user zoom and scroll position during recompilation.

Implement bidirectional SyncTeX:

1. From a source position, jump to the matching PDF location.
2. From a PDF location, jump to the associated source file and line.
3. Handle source files included through `\input` and `\include`.
4. Display understandable feedback when no precise mapping exists.

Verify SyncTeX against actual multi-file documents.

The editor and PDF viewer should feel like two synchronized representations of one document.

---

# 8. Diagnostics and debugging

**Priority: P0.**

Replace confusing raw compilation failures with actionable diagnostics.

Required:

- Parse supported LaTeX compiler error and warning output.
- Identify source file and line where possible.
- Show errors in the editor gutter.
- Provide a diagnostics panel with clickable messages.
- Distinguish errors, warnings, and informational messages.
- Explain common problems in understandable language.
- Display relevant original compiler output.
- Identify missing packages and missing file dependencies.
- Surface unresolved references and citations.
- Avoid misleading error locations or invented explanations.

Deterministic quick fixes are welcome when reliable.

No AI is required.

A user should be able to identify the relevant source location without searching manually through hundreds of lines of logs.

---

# 9. Projects and local file management

**Priority: P0.**

Leaf must support actual filesystem projects.

Required:

- Open an existing `.tex` file.
- Open a project directory.
- Create a new project.
- Import an Overleaf ZIP archive safely.
- Create projects from local templates.
- Create, rename, move, and delete files and folders.
- Work with images, `.bib`, `.sty`, `.cls`, and included TeX files.
- Support multi-file documents.
- Detect externally modified files.
- Handle conflicts between disk and unsaved editor contents.
- Remember recently opened projects.
- Restore the previous workspace where practical.
- Allow project root and main-document configuration.

Projects must remain ordinary local folders.

Do not create a proprietary format required to read source documents.

Project-specific metadata may be stored separately or in a clearly documented configuration file.

---

# 10. Autosave, recovery, and history

**Priority: P0 for safe saving and recovery, P1 for advanced history.**

Data integrity is a fundamental requirement.

Implement:

- Reliable save behavior.
- Visible dirty-file state.
- Configurable autosave.
- Atomic writes where appropriate.
- Crash recovery for unsaved edits.
- Local recovery snapshots.
- Explicit handling of concurrent external changes.
- Local file history.
- Optional Git integration using existing local repositories.
- Diff viewing for historical versions.

Do not overwrite user files silently or discard unsaved content when switching projects.

Test application crashes, failed writes, and recovery behavior.

---

# 11. Bibliography and citation workflow

**Priority: P1.**

Implement comfortable citation management without requiring an internet connection.

Required:

- Parse existing `.bib` files.
- Search citations by key, author, title, and year.
- Insert `\cite{}` from the editor.
- Autocomplete citation keys.
- Identify unresolved citations.
- Support the existing bibliography compilation toolchain.
- Refresh results when a `.bib` file changes.

Support conventional workflows where Zotero/Better BibTeX manages a bibliography file externally.

Do not require a proprietary citation database.

Optional online DOI lookups must never be required for core citation editing and must only run when explicitly initiated.

---

# 12. Mathematical and visual authoring

**Priority: P1.**

Provide lightweight visual tools while keeping LaTeX source as the source of truth.

Implement where practical:

- Inline mathematical expression previews.
- Common math symbol insertion.
- Equation templates.
- Matrix and aligned-equation snippets.
- Figure insertion with local file selection.
- Figure caption and label helpers.
- Table builder that produces clean LaTeX.
- Table row and column editing.
- Section and subsection insertion.
- Link and reference insertion.
- Local spellchecking.
- Word count and document statistics.

Avoid creating a complex full WYSIWYG editor.

Generated LaTeX must remain readable and editable.

Use locally bundled rendering dependencies where necessary.

---

# 13. Research-paper quality checks

**Priority: P2.**

Provide an optional preflight panel for preparing academic manuscripts.

Check for:

- Missing figures.
- Unresolved references.
- Unresolved citations.
- Missing bibliography files.
- Relevant compilation warnings.
- Overfull and underfull boxes.
- Broken include paths.
- Document build errors.
- Missing required local files.

Allow users to inspect results before exporting or preparing a manuscript for submission.

Clearly distinguish fatal errors from cosmetic warnings.

Do not pretend to guarantee journal compliance or mathematical correctness.

---

# 14. Performance requirements

Leaf should feel lightweight and responsive.

Optimize for:

- Fast application startup.
- Responsive text editing.
- Efficient file-tree updates.
- Low unnecessary CPU consumption when idle.
- Debounced automatic compilation.
- No UI blocking during compilation.
- Efficient PDF rerendering.
- Smooth split-panel resizing.
- Large multi-file academic documents.
- Clean cancellation and resource cleanup.

Set measurable performance baselines using reproducible fixtures.

Record machine specifications and document complexity alongside benchmarks.

Do not fabricate benchmark results.

Prioritize correctness and responsiveness over unproven performance optimizations.

---

# 15. Privacy and security

Leaf is intentionally local-only.

Requirements:

- No mandatory authentication.
- No hosted database.
- No cloud document storage.
- No telemetry or analytics by default.
- No AI API calls.
- No hidden document uploads.
- No remote dependency for normal opening, editing, compiling, or exporting.
- No automatic third-party network requests from bundled UI assets.
- Safe handling of ZIP imports and path traversal.
- Safe process execution.
- Clear handling of untrusted LaTeX projects.
- No automatic execution of arbitrary project scripts.

All essential UI libraries and assets should be available locally.

Respect the user's filesystem permissions and avoid unnecessarily broad file access.

Document the limitations of compiling potentially malicious LaTeX documents, since disabling shell escape alone is not a complete sandbox.

---

# 16. Scope exclusions

Do not spend development time on:

- Cloud collaboration.
- Account systems.
- Remote project hosting.
- Multiplayer editing.
- AI chat assistants.
- LLM-powered writing.
- Online social features.
- Custom LaTeX compiler development.
- Complex WYSIWYG document editing.
- SaaS billing or subscriptions.

These are explicitly outside Leaf's current scope.

A focused, reliable desktop editor is preferable to a large collection of shallow features.

---

# 17. Automated and manual verification

Establish appropriate tests for the actual codebase and framework.

At minimum, verify:

1. Fresh application launch.
2. Project creation.
3. Opening an existing project.
4. Opening an Overleaf ZIP project.
5. File editing, saving, and reopening.
6. Local LaTeX compilation.
7. PDF preview.
8. SyncTeX in both directions.
9. Multi-file project navigation.
10. BibTeX/Biber compilation where installed.
11. Error reporting.
12. Compilation cancellation.
13. Failed-build recovery.
14. External file-change handling.
15. Crash recovery.
16. Offline operation.
17. Main keyboard shortcuts.
18. PDF export.
19. Project-wide search.
20. Application packaging/build.

Create representative fixture projects, including:

- Simple article.
- Multi-file research paper.
- Mathematics-heavy manuscript.
- Paper containing tables and figures.
- Paper with bibliography and cross-references.
- Intentionally broken LaTeX project.
- Larger document for performance testing.

Use actual compiler integration tests whenever a TeX distribution is available.

If external dependencies are absent, clearly separate unrun integration tests from passing tests.

Do not report tests as passing unless they actually ran successfully.

---

# 18. Implementation process

Work in the following order.

## Phase A: Audit

Inspect the repository and establish which features already work.

Create the audit document and a prioritized implementation backlog.

## Phase B: Repair the foundation

Address broken functionality, data-integrity risks, compilation problems, file handling, and essential UI issues.

## Phase C: Complete the P0 features

Implement the missing release-blocking capabilities from Sections 4 through 10.

The application should become a usable end-to-end LaTeX editor before moving on.

## Phase D: Implement P1 improvements

Add advanced citation tools, version history, visual authoring, and other high-value usability improvements.

## Phase E: Add P2 capabilities

Add research-paper checks and smaller refinements after the fundamentals are stable.

## Phase F: Final verification

Run available tests, static analysis, type checks, linting, builds, and integration tests.

When graphical testing tools are available, launch the application, exercise the actual interface, and inspect screenshots for layout or visual defects.

Fix defects discovered during verification.

Revisit the audit and mark completed items based on evidence.

Do not stop merely because code compiles. Verify functional behavior.

---

# 19. Progress and reporting

Maintain these files:

- `docs/LEAF_AUDIT.md`
- `docs/LEAF_IMPLEMENTATION_PLAN.md`
- `docs/LEAF_TEST_REPORT.md`

Keep them accurate and concise.

For each implemented feature, record:

- What changed.
- Relevant files.
- Validation performed.
- Remaining limitations.

Do not generate extensive documentation at the expense of implementing the product.

At the end, report:

1. Features already present before this task.
2. Existing features repaired.
3. New features implemented.
4. Tests actually executed and their results.
5. Important remaining limitations.
6. Highest-priority unfinished work.

Do not invent success claims or conceal incomplete features.

---

# 20. Definition of done

Leaf is successful when a researcher can:

1. Install and launch the application.
2. Configure or detect an existing TeX distribution.
3. Create or import an actual LaTeX project.
4. Edit source comfortably with professional editing tools.
5. Compile locally without relying on Leaf cloud infrastructure.
6. View the generated PDF beside the source.
7. Navigate between source and PDF.
8. Diagnose and fix compilation errors.
9. Manage multi-file documents and bibliographies.
10. Save safely and recover from interruptions.
11. Export a correct, usable PDF.
12. Complete the entire workflow offline.

All controls needed for these workflows must be functional.

The application should look polished, behave predictably, and prioritize reliability over feature count.

The objective is not to make Leaf look like Overleaf or Prism.

**The objective is to make Leaf a genuinely better local writing environment for serious LaTeX work.**

---

# 21. Begin execution

Start immediately.

1. Read the relevant repository instructions.
2. Inspect the existing implementation.
3. Run the current tests and application where possible.
4. Establish the baseline audit.
5. Implement missing capabilities in priority order.
6. Test each major change.
7. Continue until the highest-priority feasible work is complete.

Do not respond with only a plan. Make concrete code changes, run available verification, and report the actual results.

Preserve existing user work and do not perform destructive Git operations.

If the full specification cannot be completed within the available execution context, deliver the largest coherent, fully tested increment rather than a collection of partially wired features.