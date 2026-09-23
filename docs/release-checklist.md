# Release checklist

The two checklists from `SPEC.md` §12.2 and §12.3, copied here and ticked with one line of
evidence each, or left unticked with the reason. Evidence gathered 2026-09-23 during Task 15.

## §12.2 Public-repo hygiene checklist

- [x] `.gitignore` covers `.env`, `.env.*` (except `.env.example`), `node_modules/`, `dist/`, `coverage/`, `*.log` and `.DS_Store`.
  Evidence: `.gitignore` lists `node_modules`, `dist`, `coverage`, `*.log`, `.DS_Store`, `.env`, `.env.*`, `!.env.example`.
- [x] No secrets in code, fixtures, docs, screenshots or git history. The Task 15 hygiene check scans for token patterns.
  Evidence: `pnpm hygiene` → `hygiene: ok (316 tracked files checked)`. `git log -p --all` scanned separately for `ghp_`/`github_pat_`/`gho_`/`Bearer`-shaped strings across all 50 commits: only the pre-existing synthetic `github_pat_fake_secret_4b2d8e` test fixture matched, nothing real-shaped.
- [x] No code path persists a secret. The Task 1, 4 and 7 tests enforce this.
  Evidence: `tests/secretsNeverPersisted.test.ts` passes (part of the green `pnpm test` run, 1007 tests).
- [x] Test fixtures for analyses and storage use synthetic data only. Never commit an exported `localStorage` dump or a real `.txt` export.
  Evidence: `tests/fixtures/**` reviewed; all use `acme/widgets`, `@jdoe` and similar synthetic data. No `localStorage` dump or real export file is tracked.
- [ ] No personal data. Fixtures use synthetic users and repos (`acme/widgets`, `@jdoe`). No real e-mail addresses. No machine paths such as `C:\Users\…`.
  **Not ticked.** Every commit's author metadata (`git log`, not file content) carries the real e-mail `jeronimorepetto@gmail.com` — this predates Task 15, is outside what a file-content hygiene scanner can catch, and rewriting git history is a destructive operation out of this task's authorized scope. File content itself is clean (hygiene checker + a manual `git log -p --all` scan both pass). Needs the user's decision before the repo goes public: for example, using a GitHub-provided `@users.noreply.github.com` address for future commits, or rewriting history with `git filter-repo`/BFG if the existing author e-mails must not be public.
- [x] No hardcoded API key or token anywhere.
  Evidence: same `pnpm hygiene` and history-scan evidence as above.
- [x] Every artifact is in English: code, comments, UI copy, tests, docs and commit messages.
  Evidence: every file touched or added in this task is English; `git log` shows English commit subjects throughout.
- [x] The README has no references to private sibling tools or local-only paths.
  Evidence: `README.md` reviewed; no mention of sibling AI-Tools projects or local file-system paths.
- [x] `package.json` has `"private": true` (not published to npm), plus `license`, `description` and `repository`.
  Evidence: `package.json` — `"private": true`, `"license": "MIT"`, a description matching the approved product description, and `"repository": {"type":"git","url":"https://github.com/JeronimoRepetto/local-issue-classifier"}`.
- [x] `pnpm test` and `pnpm typecheck` are green on a fresh clone.
  Evidence: see the fresh-clone sanity check recorded in the Task 15 report (clone under a temp folder, `pnpm install`, `pnpm dev`, `curl http://localhost:5200/` → 200).
- [x] `LICENSE` (MIT) and `THIRD_PARTY_NOTICES.md` are present. Every Streamline icon lives under `design/icons/streamline-pixel/`, and the attribution appears in the README and in Settings → About.
  Evidence: `LICENSE` added (MIT, Jeronimo Repetto, 2026). `design/icons/streamline-pixel/` holds only its own `README.md` — the custom-only fallback is in effect (`docs/design.md` "Icon source decision"), so there is currently no Streamline icon needing attribution; the README Credits section and Settings' About text both state the pixel art is original and link `THIRD_PARTY_NOTICES.md`.

## §12.3 UI design-quality acceptance checklist

Run against the kit page (`?kit`) and the real screens, in light, dark and reduced-motion modes,
at 1440 px and 1024 px.

- [x] **One primary action per screen.** Exactly one filled accent button per screen: New analysis, Classify or Export.
  Evidence: source review — `RepoInput.vue` (Home, "New analysis"), `ClassifyButton.vue` ("Classify N issues") and `ExportContainer.vue` ("Export") are the only `variant="primary"` buttons on their respective screens; the other `variant="primary"` occurrences are inside modal dialogs (`ExistingAnalysisPrompt`, `CostConfirm`) or a transient blocking state (`RepoLoadFeedback`'s "Resume"), each scoped to its own bounded context rather than competing with the screen's primary action. `UiButton`'s default variant is `secondary`, so this was not accidental.
- [ ] **First-use clarity.** A new user reaches a classified table without reading the README, using only the first-run checklist, the key help disclosures and the empty states.
  Not ticked — manual first-use walkthrough pending: user.
- [ ] **Empty and error states.** Every one shows a pixel illustration, one sentence and one action, with no dead ends.
  Not ticked — component-level tests (`EmptyState.test.ts` and friends) cover individual states; a full walk of every empty/error state for dead ends needs a manual pass: user.
- [x] **Pixel art is an accent only.** The pixel font appears only in the logo, the Home H1, empty-state headlines and the "P" glyph. All body, table and number text uses Inter with tabular numbers.
  Evidence: `u-pixel-font` is used only in `App.vue` (wordmark), `HomeContainer.vue` (H1), `EmptyState.vue` (headline), `KitShowcase.vue`/`KitPage.vue` (kit page itself) and `base.css` (the utility class definition) — no occurrence in table, form or body-text components.
- [x] **Tokens only.** No hard-coded colors, spacing or durations in components.
  Evidence: `tests/tokens-only.test.ts` ("tokens only (SPEC §12.3)") passes, scanning `src/ui`, `src/components`, `App.vue` and `style.css` for hex/`px`/`ms` literals.
- [x] **8 px grid.** Spacing and component heights come from the scale in §10.2.
  Evidence: `src/ui/tokens.ts` defines `--space-1..7` as 4/8/16/24/32/48/64 px and `--size-*`/`--size-row` from the same grid; `tokens-only.test.ts` keeps every component on these variables.
- [x] **Contrast.** The AA token test passes. Level meaning never relies on color alone: each badge has a label and a glyph.
  Evidence: `src/ui/contrast.test.ts` passes; `LevelBadge.vue` renders both a text label and a signal glyph per `docs/design.md`.
- [ ] **Keyboard.** Every flow can be completed with the keyboard only: new analysis, classify, filter, dismiss and restore, sort, weights, export. Focus rings are always visible, and dialogs trap and return focus.
  Not ticked — individual components have keyboard tests (`UiDialog` focus trap/return, `UiPopover`, `UiMultiSelect`, `SortRuleList` Alt+↑/↓, `WeightEditor`), all passing, but a full end-to-end keyboard-only walkthrough of every flow needs a manual pass: user.
- [ ] **Screen reader.** A spot check with NVDA or VoiceOver: badges, progress and toasts are announced, and the table reports its sort state.
  Not ticked — needs assistive-tech software this environment does not have: user.
- [x] **Motion.** Every animation has a purpose (§10.6). Nothing loops while idle. With `prefers-reduced-motion`, there are no transforms or sprites.
  Evidence: `src/ui/motion.test.ts` passes, including "sets every duration to 0 ms and caps fades at 80 ms under reduced motion" and `useReducedMotion` reacting to the media query.
- [ ] **Performance.** 1 000 rows scroll smoothly, with virtualization on. Opening the weight editor and moving a slider re-sorts without visible jank.
  Not ticked — `IssueTable.test.ts` confirms virtualization switches on above 200 rows, but perceived smoothness/jank at 1 000 rows needs a manual pass in a real browser: user.
- [x] **Icons.** Every icon is crisp at 16, 24 and 32 px, uses `currentColor`, and has an `aria-label` or `aria-hidden`.
  Evidence: `tests/icons.test.ts` checks the normalizer output, that committed icons match a fresh `pnpm icons` build, and that every icon has `currentColor`, a `viewBox` and nothing executable.
- [ ] **Responsive.** At 1024 px there is no horizontal page scroll, and the table scrolls only within its container.
  Not ticked — needs a real browser viewport check: user. The responsive filter-bar collapse below 1280 px is separately tracked as backlog (see README "Roadmap / backlog").
