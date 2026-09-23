# issue-criticity — Specification

Status: draft v4, dated 2026-09-23. All open questions are resolved. Audience: implementers (human or agent) and reviewers.

## What the app does

issue-criticity is a web app that runs on your own machine.

1. It loads the issues of a GitHub repository.
2. It sends each issue, with a trimmed summary of the project, to **Jev**, TypeSafe AI's System One model.
3. It shows each issue classified on four dimensions: Complexity, Criticality, Effort to fix, and Relevance to the project.
4. You can filter the table and export it as plain text, sorted by several priority keys.

## Sources

- **Jev documentation.** A local mirror at `AI-Tools/Jev-Doc/`, a raw copy of https://docs.typesafe.ai taken on 2026-09-23. Paths below are relative to that folder.
- **GitHub documentation.** Fetched on 2026-09-23 and cited inline by URL.
- **Live CORS checks.** Run on 2026-09-23 with `curl` against public endpoints, without sending credentials. Results are in §4.1 and §5.1.
- **House conventions.** Taken from the sibling project `AI-Tools/steam-picker/`.

## Revision v2 (user decisions)

- **GitHub auth is token-only.** Login with GitHub is dropped.
- **Secrets stay in memory only.** They are never persisted and are lost when the page reloads.
- **Deployment modes are defined** (§9). The Jev transport is a swappable adapter, so a future hosted mode needs configuration, not a rewrite.

## Revision v3 (user decision on persistence)

- **Only the two secrets are lost on reload.** Everything else persists in `localStorage` as saved **Analyses**, one per repository run (§3.1, §4.8). An Analysis holds the fetched issues, the project context, the classifications and the working state: filters, sort, export order and dismissed issues.
- **New Home screen.** It lists saved analyses. From there you can open, rename, delete, or refresh (re-fetch and re-classify only unclassified or changed issues).
- **Dismiss / restore issues.** You can hide issues from the working list and bring them back with a "Show dismissed" toggle.
- **"Reorder" means the multi-key sort,** saved with each analysis.

## Revision v4 (final user decisions)

- **License:** MIT.
- **Pull requests:** excluded in v1, with no option to include them.
- **Weighted priority score in v1.** A 0–100 score with editable weights, saved per analysis, usable as a sort key and included in the export (§4.9).
- **New "Design and UX" section** (§10): modern layout with pixel-art accents, design tokens, icon licensing, component inventory, accessibility baseline, and an early "Design system and UI kit" task.

---

## 1. Purpose and non-goals

### Purpose

- Help a maintainer or contributor triage an issue backlog quickly.
- Give each issue a calibrated, explainable estimate of how complex, critical, costly and relevant it is.
- Keep all deterministic work in code: fetching, trimming, sorting, filtering and exporting.
- Use Jev only for the four narrow judgments. This follows `concepts/how-to-build-with-system-one.md`: code owns the control flow, and the model makes small, typed judgments.

### Non-goals

- **No backend of its own that stores anything.**
  - In v1 the app runs from the Vite dev server (`pnpm dev`) or `vite preview` on the user's machine.
  - The only server-side code is a Vite proxy running in that local Node process. It exists because Jev does not allow calls from browsers (§4.1).
  - No server ever stores a key or token, in any deployment mode (§9).
- **No multi-user features, accounts, sharing or sync.** All state lives in the user's own browser. Secrets live in tab memory; everything else lives in that browser profile's `localStorage`.
- **No telemetry, analytics or third-party requests.** The only hosts contacted are:
  - `api.github.com`, called directly from the browser.
  - `api.typesafe.ai`, reached through the proxy.
- **No writes to GitHub.** The app never comments on, labels or closes issues.
- **No "Login with GitHub".** Authentication is a Personal Access Token only (§5.2).
- **No free-text generation.** Jev is not a generative model (`model-jaggedness/jev-1.13.md` §Generation). The app produces no summaries or rationales.
- **No bare static deployment.** Jev needs a proxy. A future hosted mode supplies that proxy as a serverless function (§9).

---

## 2. User flows

### 2.1 Entering keys: first run, and after every reload

Secrets are kept **in memory only** (§8). Every page load therefore starts with no keys. This is by design.

1. The user opens `http://localhost:5200`.
2. With no Jev API key in memory, the app shows the **Keys required** state: a banner above an open **Settings** panel.
   - The banner reads: "Your keys are kept in memory only and are cleared when this page reloads. Enter your Jev API key (and optionally a GitHub token) to continue. Your saved analyses are still here."
   - The banner can be dismissed. The Home screen (§2.2) and every saved analysis stay fully usable without keys: open, filter, sort, dismiss and export.
   - Only actions that call a service are disabled, and each explains why:
     - **Classify** needs the Jev key.
     - **Refresh from GitHub** and **New analysis** work without a token, for public repos at 60 requests/hour.
3. The user enters the **Jev API key**. It is required for classification.
   - Keys are created in the TypeSafe console dashboard at `https://console.typesafe.ai/keys` (`introduction/quickstart.md`: "Get your API key from the dashboard"; also linked from `agent-skill.md`).
   - **Test key** calls `GET /v1/models` through the Jev transport:
     - 200 → "Key OK"
     - 401 → "Invalid key"
     - network failure → "Proxy not reachable — are you running `pnpm dev`?"
4. Optionally, the user enters a **GitHub Personal Access Token** (how-to in §5.3).
   - **Test token** calls `GET /rate_limit` and shows the limit and the remaining quota.
5. The user sets the non-secret preferences, which are persisted:
   - Include closed issues. Default: off.
   - Fetch comments. Default: on with a token, off without one.
   - Max comments per issue. Default: 8.
   - Max issues to load. Default: 1 000.
   - Classification concurrency. Default: 4, range 1–8.
   - Low-confidence threshold. Default: 0.5.
6. **Apply** keeps the keys in memory and saves the preferences to `localStorage`.
   - **Clear keys** wipes both secrets from memory immediately.
   - The key fields show a note: "Not saved — you will need to enter this again after reloading."

Edge cases:

- **Reload during a run.** While classification or loading is running, the app registers a `beforeunload` prompt. The browser shows its standard "leave site?" dialog, because reloading clears the keys and cancels the run. When idle, the app registers no prompt.
- **No Jev key.** GitHub loading still works. The Classify button tooltip says "Enter your Jev API key in Settings".
- **Malformed input.** Keys are trimmed. An empty value counts as absent.
- **Browser password managers.** Key inputs are `type="password"` with `autocomplete="off"` and non-credential `name` attributes. The app cannot fully prevent a password manager from offering to save them; the README says so.

### 2.2 Home: saved analyses

The Home screen is the landing view. It is also where the top-bar "Analyses" button leads.

1. **The list.** Home lists saved analyses, newest `updatedAt` first. Each entry shows:
   - the name (default `owner/repo (open)`) and the repo;
   - the issue state filter;
   - the last fetch date;
   - issue counts: total, classified, stale, dismissed;
   - the approximate storage size.
2. **Actions per analysis:**
   - **Open** makes it the *current analysis*. The Issues view, filters, sort, Classify and Export all operate on the current analysis only. Its id is saved as `Preferences.lastAnalysisId`, so a reload reopens it.
   - **Rename** is optional to use. It edits the name inline; an empty name falls back to the default.
   - **Refresh** re-fetches from GitHub and merges the results (§2.3). It then offers "Classify unclassified / changed (N)", which needs the Jev key.
   - **Delete** asks for confirmation ("Delete analysis 'X'? This removes its issues and results from this browser."), then removes it from storage.
3. **Global actions:**
   - **New analysis**: see §2.3.
   - **Clear all local data**: see §8. It needs a typed confirmation.
   - A storage meter: "Local storage used: 2.1 MB of ~5 MB".
4. **Empty state:** "No saved analyses yet. Paste a GitHub repository URL to start."

### 2.3 New analysis and refresh (load a repository)

1. **New analysis.** The user pastes a URL.
   - Accepted forms:
     - `https://github.com/{owner}/{repo}`, optionally followed by a trailing `/`, `.git`, `/issues` or any deeper path.
     - `github.com/{owner}/{repo}`.
     - `{owner}/{repo}`.
   - The pure function `parseRepoRef()` normalizes the input or returns a typed error.
   - The last repo entered is saved as a non-secret preference and pre-filled after a reload.
2. The user picks a state: Open (default), Closed or All. The default comes from preferences.
3. **Load** starts the fetch sequence (§5.5): repo metadata, then project context and issue pages in parallel, then comments.
   - A progress line shows: "Issues: 300 / ~420 · Comments: 120 / 260 · GitHub quota: 4 612 left".
4. Before fetching comments, the app computes the cost: the number of issues with `comments > 0`.
   - If that exceeds 80% of `x-ratelimit-remaining`, the app asks: "Fetching comments needs ~N requests; you have M left. Fetch comments / Skip comments / Cancel".
5. **Existing analysis.** If a saved analysis already exists for the same repo and state, the app asks: "An analysis of owner/repo (open) exists. Open it / Refresh it / Create a separate one".
6. **Saving.** On completion, the app creates the Analysis (§3.1) and saves it to storage as soon as the issues arrive, before any classification runs. It becomes the current analysis, and the Issues table opens (§6).
7. **Refresh an existing analysis.** Refresh runs the same fetch sequence, then merges the results with the pure function `mergeRefetch(analysis, fetched, now)`:
   - **New issues** are added with status `unclassified`.
   - **Changed issues**, where `updatedAt` differs, get their data replaced. Their classification is kept but marked `stale`.
   - **Unchanged issues** keep everything.
   - **Issues missing from the new fetch** (closed, transferred, deleted, or beyond the cap) are kept with `sourceStatus: 'missing'` and a "no longer in source" badge. They are never deleted silently. The user can dismiss them, or bulk-remove them with **Remove missing issues**.
   - **Working state is untouched:** dismissed issues, filters, sort and export order stay as they were.
   - `fetchedAt` is updated.

Edge cases:

- **Repo not found, or private with no token.** GitHub returns 404. The app says "Repository not found. If it is private, enter a token with access to it."
- **Primary rate limit hit.** A 403 or 429 with `x-ratelimit-remaining: 0` stops the loader.
  - The app shows the reset time from `x-ratelimit-reset`. What was already loaded stays usable.
  - **Resume** continues from the next unfetched page or comment request.
  - Without a token, the message suggests entering one (60 → 5 000 requests per hour).
- **Secondary rate limit hit.** A 403 or 429 carrying `retry-after`: the app waits that many seconds and retries automatically once, then falls back to the stop state (§5.6).
- **Huge repo, e.g. 5 000 open issues.**
  - After the first issue page, the loader shows the page count from `rel="last"`.
  - Above 20 pages (over 2 000 issues) it asks for confirmation.
  - A cap applies: "Load at most N most-recently-updated issues" (preference `maxIssuesToLoad`).
  - Classification can be limited to the filtered view.
- **Pull requests.** The issues endpoint also returns PRs. They are identified by the `pull_request` key and always dropped. This is a v1 decision, and there is no option to include them.
- **Issues disabled** (`has_issues: false`). The app says "This repository has issues disabled."
- **Empty repo or no README.** Those context fields become `null`. Classification still works.
- **Storage full.** Saving throws `QuotaExceededError`. The analysis stays in memory for the session, and a blocking notice appears: "This analysis could not be saved (browser storage is full). Delete older analyses on Home, or lower 'Max issues to load'." The notice shows the storage meter and offers a **Retry save** button. No other analysis is evicted automatically, because user data is never dropped silently.

### 2.4 Classify

1. **Classify** is enabled when a Jev key is in memory and the current analysis has at least one issue that is not dismissed. It offers three scopes:
   - **Classify unclassified (N)** (default)
   - **Re-classify all (M)**
   - **Classify filtered view (K)**
2. Before running, it shows an estimate: "≈ N calls · ≈ X k input tokens · ≈ $Y · ≈ Z s" (§4.7).
3. The runner sends one request per issue, with at most `concurrency` requests in flight (§4.5). Each row updates as its result arrives.
4. Progress shows done, failed and pending counts.
   - **Cancel** aborts in-flight requests through an `AbortSignal` and keeps the completed results.
5. At the end, a summary reads "N classified · F failed · L low-confidence". **Retry failed** re-runs only the failures.

Edge cases:

- **Jev fails for some issues.** Those rows get `status: 'error'` with a message:
  - "Rate limited — retried 3×"
  - "Invalid request (422): …"
  - "Timeout"
  - "Issue too large even after trimming"
  
  The run continues. Failed rows count as unclassified.
- **401 from Jev.** The whole run stops, the key is cleared from memory, and Settings opens with the key field highlighted.
- **Burst of 429 or 529 responses.** The runner halves its concurrency, down to 1 (§4.5).
- **"Unclassified" means** any of:
  - no classification;
  - the last attempt ended in `error`;
  - the stored classification is **stale**: the issue's `updated_at` changed since classification (after a Refresh), or `QUESTIONS_VERSION` changed (§4.8).
  
  Dismissed issues are skipped by every Classify scope.
- **Issue edited mid-run.** Not detected during the run. The next Refresh marks it stale.
- **Page reload mid-run.** Each result was saved into the analysis as it arrived (§4.8). After the reload, the analysis reopens with those results. The user re-enters the Jev key and runs **Classify unclassified**. No re-fetch is needed.

### 2.5 Filter, dismiss and reorder

All of the state in this section belongs to the current analysis. It is saved with that analysis (debounced by 500 ms) and restored when the analysis is reopened, including after a reload.

1. Filters available:
   - Complexity, Criticality and Effort: multi-select of High / Medium / Low.
   - Relevance: range slider, 0–100.
   - Minimum confidence: slider, 0–1.
   - Status: classified / unclassified / error / stale.
   - Labels: multi-select built from the loaded issues.
   - Free-text search over number, title, body, labels and author. Case-insensitive; multiple terms are ANDed.
2. Filters combine with AND. The header shows "K of N issues". **Reset filters** clears them.
3. **Reorder: the table sort is a multi-key sort.**
   - Clicking a column header makes that column the only sort key; a second click reverses it. Shift-clicking adds the column as the next key.
   - A "Sort" popover reuses `SortRuleList` to edit the full ordered key list.
   - The table sort persists per analysis. It is separate from the export order, but the export dialog can import it ("Use current table sort").
   - **Priority** is a sortable column, and it is a valid key in both the table sort and the export order (§4.9).
   - **Weights.** A "Weights" popover next to the Priority column header shows four sliders: Criticality, Relevance, Complexity and Effort.
     - Each slider runs 0–100 in steps of 5, with a numeric input beside it.
     - A live preview updates the Priority column and the row order as the sliders move (debounced by 150 ms).
     - **Reset to defaults** restores 40 / 30 / 15 / 15.
     - A caption explains that lower complexity and lower effort raise priority.
     - The weights persist per analysis.
     - If every weight is 0, the Priority column shows "—" and the popover says "Set at least one weight above 0".
4. **Dismiss an issue.**
   - Each row has a **Dismiss** action, and bulk-dismiss applies to selected rows.
   - Dismissed issues disappear from the working list, and from classification, stats and export unless the options below are used.
   - The **Show dismissed** toggle brings them back greyed out, each with **Restore**. The header then shows "K of N issues (D dismissed)".
   - Dismissing never deletes data. The issue and its classification stay in the analysis.
5. **Remove missing issues** permanently deletes the issues with `sourceStatus: 'missing'` from the analysis. It asks for confirmation first.
6. **Optional, not in v1: manual pin-to-top.** A per-analysis `pinned: number[]` list would put pinned issues first, ahead of the multi-key sort. This costs about 40 lines in the sort comparator plus a row action. It is out of v1 scope unless it fits Task 13's budget. Drag-and-drop ordering is out of scope.

### 2.6 Export

1. **Export…** opens a dialog with an ordered list of sort keys. Each key has a dimension and a direction; keys can be added, removed and reordered.
   - Default order: Criticality desc → Relevance desc → Effort asc.
   - The export order and options are saved **per analysis**.
2. Scope: all issues in the analysis, or the current filtered view (default). Dismissed issues are excluded unless **Include dismissed** is checked.
3. Options, all saved with the analysis:
   - Include unclassified issues. They always go last, in a separate section.
   - Include dismissed issues. They go in their own section.
   - Include confidence.
   - Include URLs.
4. **Download** builds the text with a pure formatter (§6.5) and saves it through the anchor-based download helper as `{owner}-{repo}-issues-{YYYYMMDD-HHmm}.txt`.

Edge cases:

- With zero issues in scope, Download is disabled and the dialog says "Nothing to export".
- Ties are broken by issue number ascending, so the output is deterministic.

---

## 3. Domain model (`src/domain/types.ts`)

The model uses plain serializable interfaces, `defaultX()` factories, and `STORAGE_KEYS` constants, matching the house style of steam-picker and design-studio.

```ts
// ── Repository & issues ──────────────────────────────────────────────
export interface RepoRef {
  owner: string
  repo: string
}

export interface Repo {
  ref: RepoRef
  fullName: string            // "owner/repo"
  description: string | null
  topics: string[]
  defaultBranch: string
  isPrivate: boolean
  hasIssues: boolean
  openIssuesCount: number     // GitHub's count includes PRs; informational only
  htmlUrl: string
}

export type IssueState = 'open' | 'closed'

export interface IssueComment {
  id: number
  author: string              // login, or "ghost" when the user was deleted
  authorAssociation: string   // OWNER | MEMBER | CONTRIBUTOR | NONE | ...
  createdAt: string           // ISO 8601
  body: string
}

export interface Issue {
  number: number
  title: string
  body: string                // '' when null
  state: IssueState
  stateReason: string | null  // completed | not_planned | reopened | null
  labels: string[]
  author: string
  authorAssociation: string
  createdAt: string
  updatedAt: string
  closedAt: string | null
  commentCount: number        // GitHub's `comments` field
  comments: IssueComment[]    // may be a subset; see commentsTruncated
  commentsTruncated: boolean
  commentsFetched: boolean    // false when comments were skipped
  reactionsTotal: number
  htmlUrl: string
}

// ── Project context sent to Jev ──────────────────────────────────────
export interface ProjectContext {
  name: string                  // repo full name
  description: string | null    // repo description
  topics: string[]
  manifest: { source: 'package.json' | 'pyproject.toml' | 'Cargo.toml' | 'go.mod' | null
              name: string | null
              description: string | null }
  readmeExcerpt: string | null      // trimmed, see §4.3
  contributingExcerpt: string | null
  docsIndex: string[]               // file/dir names under docs/, max 40
}

// ── Classification ───────────────────────────────────────────────────
export type Level = 'low' | 'medium' | 'high'
export type Dimension = 'complexity' | 'criticality' | 'effort'

export interface ScoreDimension {
  level: Level                  // from Math.round(score), §4.4
  score: number                 // raw Jev score, 0..2 (continuous)
  confidence: number            // 0..1, from Jev
  probabilities: [number, number, number] // [low, medium, high]
}

export interface RelevanceResult {
  value: number                 // 0..100 integer, §4.4
  score: number                 // raw Jev score, 0..4
  confidence: number
  probabilities: [number, number, number, number, number]
}

export type IssueKind = 'bug' | 'feature' | 'documentation' | 'question' | 'maintenance' | 'other'

export interface Classification {
  complexity: ScoreDimension
  criticality: ScoreDimension
  effort: ScoreDimension
  relevance: RelevanceResult
  kind: { choice: IssueKind; confidence: number } // speculative extra, §4.2
  minConfidence: number         // min of the four main confidences
  model: string                 // versioned id from the response, e.g. "jev-1.13.0"
  questionsVersion: number      // QUESTIONS_VERSION at classification time
  issueUpdatedAt: string        // Issue.updatedAt at classification time
  classifiedAt: string          // ISO 8601
  inputTokens: number
}

export type ClassificationStatus = 'unclassified' | 'pending' | 'done' | 'error' | 'stale'

export interface IssueRow {
  issue: Issue                  // stored form: body and comments already trimmed, §4.8
  status: ClassificationStatus
  classification: Classification | null
  error: string | null
  sourceStatus: 'present' | 'missing' // 'missing' = absent from the latest refresh, §2.3
}

// ── Analysis: one persisted repository run (§3.1) ────────────────────
export interface AnalysisWorkingState {
  filter: IssueFilter
  tableSort: ExportOrder        // multi-key table sort ("reorder"), persisted
  exportOptions: ExportOptions  // export order + flags, persisted
  priorityWeights: PriorityWeights // §4.9, persisted
  dismissed: number[]           // issue numbers hidden from the working list
  showDismissed: boolean
  expandedIssue: number | null  // UI convenience; safe to lose
  // pinned?: number[]          // optional, not in v1 (§2.5 item 6)
}

export interface Analysis {
  schemaVersion: 1
  id: string                    // generated by an injected id factory (crypto.randomUUID)
  name: string                  // default "owner/repo (open)"
  repo: Repo
  stateFilter: 'open' | 'closed' | 'all'
  createdAt: string
  updatedAt: string             // any change, incl. working state
  fetchedAt: string             // last successful GitHub fetch
  commentsFetched: boolean
  projectContext: ProjectContext
  rows: IssueRow[]              // keyed by issue.number, unique
  working: AnalysisWorkingState
}

/** Small index entry so Home can list analyses without parsing each one. */
export interface AnalysisSummary {
  id: string
  name: string
  repoFullName: string
  stateFilter: Analysis['stateFilter']
  fetchedAt: string
  updatedAt: string
  counts: { total: number; classified: number; stale: number; dismissed: number; missing: number }
  approxBytes: number           // serialized size of the analysis entry
}

// ── Secrets (IN MEMORY ONLY — never serialized, never persisted) ─────
export interface Secrets {
  jevApiKey: string             // '' = absent
  githubToken: string           // fine-grained or classic PAT; '' = anonymous
}

// ── Preferences (non-secret, persisted in localStorage) ──────────────
export interface Preferences {
  lastRepo: string              // raw text of the last repo input
  lastAnalysisId: string | null // reopened after reload
  includeClosedByDefault: boolean
  fetchComments: 'auto' | 'always' | 'never'  // auto = on when a token is present
  maxCommentsPerIssue: number   // default 8
  maxIssuesToLoad: number       // default 1000
  concurrency: number           // default 4, clamp 1..8
  jevModel: string              // default 'jev-latest'
  lowConfidenceThreshold: number // default 0.5
  defaultExportOptions: ExportOptions // seed for new analyses' working state
  theme: 'system' | 'light' | 'dark'  // §10.2, default 'system'
  onboarding: { keys: boolean; repo: boolean; classify: boolean } // first-run checklist, §10.1
}

// ── Filters, sorting, export ─────────────────────────────────────────
/** Integer weights 0..100 (step 5). Not required to sum to 100; the formula normalizes. */
export interface PriorityWeights {
  criticality: number           // default 40
  relevance: number             // default 30
  complexity: number            // default 15 (inverted: simpler → higher priority)
  effort: number                // default 15 (inverted: less effort → higher priority)
}

export type SortKey =
  | 'priority'
  | 'criticality' | 'complexity' | 'effort' | 'relevance'
  | 'minConfidence' | 'createdAt' | 'updatedAt' | 'commentCount' | 'number'
export type SortDirection = 'asc' | 'desc'
export interface SortRule { key: SortKey; direction: SortDirection }
export type ExportOrder = SortRule[]    // ordered, first rule has highest priority

export interface IssueFilter {
  complexity: Level[]           // empty = no filter
  criticality: Level[]
  effort: Level[]
  relevanceMin: number
  relevanceMax: number
  minConfidence: number
  statuses: ClassificationStatus[]
  labels: string[]
  text: string
}

export interface ExportOptions {
  order: ExportOrder
  scope: 'all' | 'filtered'
  includeUnclassified: boolean
  includeDismissed: boolean
  includeConfidence: boolean
  includeUrls: boolean
}

// Only non-secret data has a storage key. There is deliberately no key for secrets.
export const STORAGE_PREFIX = 'issue-criticity:'
export const STORAGE_KEYS = {
  preferences: 'issue-criticity:preferences:v1',
  analysesIndex: 'issue-criticity:analyses:v1',               // AnalysisSummary[]
  analysis: (id: string) => `issue-criticity:analysis:v1:${id}`, // one Analysis per key
} as const
```

Factories:

- `defaultSecrets()` returns empty strings.
- `defaultPreferences()`.
- `defaultFilter()`.
- `defaultExportOptions()`, with order criticality desc → relevance desc → effort asc.
- `defaultTableSort()`, the same order as the export default.
- `defaultPriorityWeights()`: `{ criticality: 40, relevance: 30, complexity: 15, effort: 15 }`.
- `defaultWorkingState(prefs)`.
- `defaultProjectContext(name)`.
- `defaultAnalysis({ id, repo, stateFilter, now, prefs })`.

### 3.1 The Analysis entity

An **Analysis** is one persisted repository run. It has:

- a repo identity and a state filter;
- timestamps: created, updated, fetched;
- the project context;
- the issue rows, each carrying its own classification and status;
- its own working state: filter, table sort, export options, dismissed issues.

**Everything the app shows operates on the current analysis.** The table, filters, Classify, Export, Refresh and Dismiss all act on it. The app holds exactly one current analysis at a time, in the `useAnalysis()` module-singleton store, or none while on Home.

**Pure functions in `domain/analysis.ts`, all unit-tested:**

- `createAnalysis`
- `mergeRefetch` (§2.3)
- `applyClassification(analysis, issueNumber, result)`
- `markStale(analysis, questionsVersion)`
- `dismiss` / `restore`
- `removeMissing`
- `rename`
- `summarize(analysis) → AnalysisSummary`
- `visibleRows(analysis) → IssueRow[]`, which applies dismissal, then the filter, then the sort

Each function returns a new object and never mutates its input.

---

## 4. Jev integration design

### 4.1 Transport: a swappable adapter over a proxy base URL

**Finding: the Jev API rejects browser origins.** A CORS preflight to `https://api.typesafe.ai/v1/systemone` returned `400 Bad Request` with the body `Disallowed CORS origin`.

- It was tried from three origins: `http://localhost:5200`, `http://localhost:5173` and `https://console.typesafe.ai`.
- The response carries `vary: Origin` and `access-control-allow-credentials: true`, and no `Access-Control-Allow-Origin`. Probe run on 2026-09-23.
- The Jev docs say nothing about CORS.
- The JS SDK has a `dangerouslyAllowBrowser` flag, described as "Allow browser use, exposing the API key to page users" (`sdk/javascript/api/interfaces/TypeSafeClientConfig.md`). That flag only disables the SDK's own guard. It does not change the server's CORS policy.

**Decision: one transport interface, with the proxy base URL as configuration.** The browser never calls `api.typesafe.ai` directly. It calls `{jevBaseUrl}/v1/systemone`, and whatever serves `jevBaseUrl` forwards the call upstream. Switching deployment modes (§9) changes only `jevBaseUrl`.

```ts
// src/adapters/jev/transport.ts
export interface JevTransportConfig {
  /** Base URL of the Jev proxy. v1: '/jev' (Vite proxy). Hosted: '/jev' behind a
   *  Hosting rewrite, or an absolute serverless-function URL. Never api.typesafe.ai. */
  baseUrl: string
  timeoutMs: number             // per attempt, default 20000
}

export interface JevTransport {
  systemOne(
    body: SystemOneRequestBody,               // { model, state, questions }
    auth: { apiKey: string },                 // passed per call from in-memory secrets
    signal?: AbortSignal,
  ): Promise<JevHttpResult<SystemOneResponseBody>>
  listModels(auth: { apiKey: string }, signal?: AbortSignal): Promise<JevHttpResult<ModelsResponseBody>>
}

/** Status + parsed JSON + retry hints; never contains the request or the key. */
export interface JevHttpResult<T> {
  status: number
  body: T | JevErrorBody | null
  retryAfterMs: number | null   // from retry-after / retry-after-ms
}

export function createHttpJevTransport(config: JevTransportConfig, fetchImpl: typeof fetch): JevTransport
```

- The config comes from `import.meta.env.VITE_JEV_BASE_URL`, defaulting to `'/jev'`. That value is not a secret and may appear in `.env.example`.
- The transport sends `Authorization: Bearer <apiKey>` and `Content-Type: application/json`. It never logs.
- The retry and runner logic (§4.5) sits **above** the transport. Tests replace the transport with a fake, and the real transport is tested with a fake `fetch`.
- **v1 implementation:** a Vite proxy, registered in both `server.proxy` and `preview.proxy` in `vite.config.ts` and built by `server/jevProxy.ts`:
  - Regex key `^/jev/v1/(systemone|models)$`, an allowlist.
  - `target: 'https://api.typesafe.ai'`, `changeOrigin: true`, and a `rewrite` that strips `/jev`.
  - A `configure` hook that removes the `origin`, `referer` and `cookie` request headers, so upstream sees a server-to-server call. It must not log any header or body.
  - The key is present only in transit. The proxy stores nothing.
- **Plain `fetch`, not `@typesafe-ai/sdk`.** Reasons:
  - The SDK documents Node.js 20+ and environment-variable configuration.
  - Its `debug` logging writes bodies unredacted.
  - The request and response shape is small and fully documented in `api.md`.
  - An injected `fetch` keeps the adapter trivially testable.
- **SDK fallback.** The SDK could implement `JevTransport` using `baseURL: <absolute jevBaseUrl>`, `dangerouslyAllowBrowser: true` and the injected `fetch`. This is recorded as an alternative, not the plan.

### 4.2 Questions (`src/adapters/jev/questions.ts`, single source of truth)

**Why Score for the four dimensions.**

- Complexity, Criticality and Effort are ordered spectra, so they are **Score** questions with descriptive levels. `primitives/score.md` advises: "describe situations, not degrees".
- Relevance is a **5-level Score**, mapped to 0–100 in code (§4.4).
- Asking one question per dimension, all in one request, follows `patterns/composite-scoring.md`.

**Why an extra `kind` Choice.** It is a speculative question that costs a few tokens and feeds a display column and a filter (`patterns/fan-out.md`).

The constants and questions live in one file, as `agent-skill.md` recommends. `QUESTIONS_VERSION = 1`. Bump it whenever any text below changes; doing so marks stored classifications stale.

```ts
export const QUESTIONS = {
  complexity: {
    type: 'score',
    instructions: {
      question: 'How technically complex is the change needed to resolve `issue`, given `project`?',
      focus: 'Judge the difficulty of the problem and the solution, not the amount of typing.',
    },
    criteria: [
      { what: 'Straightforward change in one obvious place; no design decisions',
        examples: ['fix a typo in an error message', 'bump a dependency version', 'add a missing config option that is already supported elsewhere'] },
      { what: 'Requires understanding several parts of the codebase or making a small design decision',
        examples: ['fix a bug that spans two modules', 'add a new option that changes existing behavior'] },
      { what: 'Requires deep knowledge, a non-trivial design, or touches concurrency, security, performance, data migration, or public API compatibility',
        examples: ['race condition in a scheduler', 'redesign a plugin API', 'memory leak with unknown cause'] },
    ],
  },
  criticality: {
    type: 'score',
    instructions: {
      question: 'How critical is `issue` for the users of `project` if it is left unresolved?',
      focus: 'Judge impact on users: breakage, data loss, security, or blocked workflows.',
    },
    criteria: [
      { what: 'No functional impact; cosmetic, nice-to-have, question, or idea',
        examples: ['typo in docs', 'feature suggestion', 'usage question'] },
      { what: 'A feature is broken or degraded but a workaround exists, or few users are affected',
        examples: ['option ignored on one platform', 'misleading error message'] },
      { what: 'Blocking, data loss, security vulnerability, crash, or broken core functionality with no workaround',
        examples: ['install fails for everyone', 'credentials leaked in logs', 'crash on startup'] },
    ],
  },
  effort: {
    type: 'score',
    instructions: {
      question: 'How much work would it take a maintainer of `project` to resolve `issue`, including tests and documentation?',
      focus: 'Judge the amount of work, not how important the issue is.',
    },
    criteria: [
      { what: 'Small; a few hours at most',
        examples: ['one-line fix with a test', 'documentation clarification'] },
      { what: 'Moderate; roughly one to a few days',
        examples: ['new small feature with tests', 'bug fix that needs investigation and a regression test'] },
      { what: 'Large; a week or more, several pull requests, or coordination with other people',
        examples: ['major refactor', 'new subsystem', 'breaking change that needs a migration guide'] },
    ],
  },
  relevance: {
    type: 'score',
    instructions: {
      question: 'How relevant is `issue` to the purpose of `project` as described in its README, description and topics?',
      focus: 'Judge whether the issue is about what this project is for, not whether it is important.',
    },
    criteria: [
      'Unrelated to this project: spam, off-topic, or about a different product',
      "Tangential: about the user's environment, third-party tools, or general programming help rather than this project",
      'About a minor, peripheral, or rarely used part of the project',
      'About a documented feature or a common way of using the project',
      'About the core purpose or main functionality of the project',
    ],
  },
  kind: {
    type: 'choice',
    instructions: 'What kind of request is `issue`?',
    criteria: {
      bug: 'Something is broken or behaves differently from what is documented or expected',
      feature: 'A request for new functionality or a change in behavior',
      documentation: 'Missing, wrong, or unclear documentation',
      question: 'A usage or support question',
      maintenance: 'Refactoring, dependencies, build, CI, or tooling',
      other: 'None of the above',
    },
  },
} as const
```

Design notes, each grounded in the docs:

- **Level order.** Levels run low → high, because the array order is the numbering (`primitives/score.md` §Levels).
- **Level shape.** Each level is a `what` plus `examples`, with the same field names on every level (`primitives/score.md` §Structured level descriptions). Relevance starts with plain strings; add examples only if validation shows splits between neighbouring levels.
- **Pointing at the state.** Instructions refer to parts of the state with backticked paths such as `issue` and `project` (`primitives.md` §Reference specific fields).
- **One dimension per question.** Effort and relevance each state explicitly that they are not about importance. This avoids the confidence drop that comes from mixing dimensions.
- **Untrusted content.** Issue bodies may try to steer the answer (`model-jaggedness/jev-1.13.md` #6). The criteria are explicit, and the app only displays the results; it never acts on them.

### 4.3 State shape and trimming (`src/domain/jevState.ts`, pure)

```ts
interface JevState {
  project: {
    name: string
    description: string | null
    topics: string[]
    package: { name: string | null; description: string | null } | null
    readme_excerpt: string | null
    contributing_excerpt: string | null
    docs_index: string[]
  }
  issue: {
    number: number
    title: string
    state: 'open' | 'closed'
    labels: string[]
    author_role: string          // authorAssociation, lower-cased
    age: string                  // bucket computed in code, e.g. "3 to 12 months old"
    last_activity: string        // bucket, e.g. "within the last week"
    comment_count: number
    reactions: number
    body: string
    comments: { author_role: string; body: string }[]
    comments_note: string | null // e.g. "showing 8 of 42 comments (first 2 and last 6)"
  }
}
```

**Dates are pre-bucketed in code.** The model compares dates unreliably (`model-jaggedness/jev-1.13.md` §Date and time comparison). Buckets: `less than a week`, `1 to 4 weeks`, `1 to 3 months`, `3 to 12 months`, `1 to 3 years`, `more than 3 years`.

**Trimming budgets.** Budgets are measured in characters. Tokens are estimated as `ceil(chars / 3.5)`, which errs on the high side.

| Field | Budget | Rule |
|---|---|---|
| `readme_excerpt` | 6 000 chars | Strip HTML comments, badge and image lines (`![...](...)`, `<img>`, `[![`), and fenced code blocks over 15 lines (replaced by `[code block omitted]`). Collapse blank lines, then keep the head. |
| `contributing_excerpt` | 1 500 chars | Head only. |
| `docs_index` | 40 names | Top level of `docs/` only. |
| `issue.body` | 8 000 chars | First 6 000 + `\n[… N characters omitted …]\n` + last 1 500. |
| `issue.comments` | `maxCommentsPerIssue` (default 8) | First 2 and last 6, each trimmed to 1 000 chars. Bot comments (`[bot]` suffix) and bodies under 10 chars (e.g. "+1") are dropped. |

**Size guard.** The hard limits in `models.md` are 32k tokens for the state plus the longest question, and 64k per request. The guard targets at most 12 000 estimated tokens of state, because large states full of irrelevant detail cost accuracy (`model-jaggedness/jev-1.13.md` #5). When a state is over budget, trim in this order:

1. Remove comments, starting from the middle.
2. Cut the body to 4 000 chars.
3. Cut the README to 3 000 chars.
4. If it is still too large, mark the issue `error: "Issue too large even after trimming"` and do not send it.

**Context sharing.** `buildProjectContext()` runs once per repo load. `buildIssueState(issue, ctx, opts)` is pure and unit-tested with fixtures.

### 4.4 Answer mapping (`src/domain/classification.ts`, pure)

`api.md` defines each Score answer as a `score` (the probability-weighted mean), `probabilities` keyed `"0".."n"`, and a `confidence`.

**Level (Complexity, Criticality, Effort).**

- Computed as `['low','medium','high'][clamp(Math.round(score), 0, 2)]`. Rounding to the nearest level is endorsed in `primitives/score.md` §Reading a Score.
- The raw `score` is kept for finer sorting. Rounding is monotonic, so sorting by score never contradicts the level order.

**Relevance, 0–100.**

- Computed as `value = Math.round(100 * score / 4)`: divide by the top level number, `len(criteria) − 1`, as in `primitives/score.md` and `patterns/composite-scoring.md`.
- The anchors are 0, 25, 50, 75 and 100, with in-between values when the model is split.
- The UI and README present this as an **ordinal ranking signal, not a calibrated percentage**. The docs say score levels are "weak in numerical calibration" (`model-jaggedness/jev-1.13.md` §Math using score).

**Confidence.**

- Each dimension's confidence is stored.
- `minConfidence` is the minimum over the four main dimensions. `kind` is excluded because it is speculative.
- A row with `minConfidence < lowConfidenceThreshold` gets a "low confidence" badge. The default threshold is 0.5, the floor used in `confidence.md`.
- Each cell shows a confidence bar, with a tooltip listing the per-level probabilities.

**Validation.** Any of these makes the whole classification fail with "Unexpected Jev response":

- an answer id is missing;
- an answer has the wrong `type`;
- a `score` is not a number;
- `probabilities` has the wrong length.

Partial answers are never stored.

### 4.5 Batching, concurrency and retries (`src/adapters/jev/runner.ts`, `pool.ts`)

**One request per issue, containing all five questions.** The docs recommend packing many questions about one state into one call (`primitives.md` §Ask multiple questions together; `patterns/fan-out.md`).

**Several issues per request is rejected.** The alternative puts many issues in one state, with per-issue question ids such as `issue_3_criticality` pointing at `issues[3]`. The counting example in `model-jaggedness/jev-1.13.md` uses that shape. It is rejected because:

- the other issues act as distractors (jaggedness #5);
- one bad issue fails the whole batch;
- the 32k state limit would force small batches anyway;
- the savings are negligible at \$0.042 per million input tokens (§4.7).

**Concurrency pool.** Default 4, adjustable from 1 to 8. The documented limits are 1 200 requests per minute and 250 000 tokens per second, and they "are adjusting dynamically" (`models.md`).

**Retry policy.** This mirrors the SDK defaults (`sdk/javascript/api/interfaces/RetryPolicy.md`) with one more retry:

- Retry on 408, 429, 500–599 (including 529 Overloaded, `api.md` §Errors), network errors and timeouts.
- `maxRetries = 3`.
- Backoff starts at 500 ms, doubles up to 5 000 ms, with 25% jitter.
- Honor `retry-after` and `retry-after-ms` up to 60 s.
- Each attempt has a 20 s timeout. The runner combines it with the run's cancel signal.

**Adaptive throttle.** Two 429 or 529 responses within 10 s halve the pool size, with a floor of 1. After every 20 consecutive successes, one slot is restored, up to the configured size.

**Non-retryable errors.**

- 401 aborts the run and clears the key from memory (§2.4).
- 422 marks the issue `error` and shows the field detail from the response body. The request is never shown.
- Any other 4xx marks the issue `error`.

**Incremental writes.** Each result is applied to its row in the current analysis at once. It is persisted by the coalesced save (§4.8), so a cancel or reload loses at most the requests in flight plus under one second of results.

### 4.6 Request example (one issue)

```json
POST {jevBaseUrl}/v1/systemone     (v1: /jev/v1/systemone → https://api.typesafe.ai/v1/systemone)
Authorization: Bearer <jev key from in-memory state>
Content-Type: application/json

{
  "model": "jev-latest",
  "state": {
    "project": { "name": "acme/widgets", "description": "Fast widget renderer for Vue",
                 "topics": ["vue","rendering"], "package": {"name":"acme-widgets","description":"…"},
                 "readme_excerpt": "…", "contributing_excerpt": null, "docs_index": ["api.md","guide/"] },
    "issue": { "number": 812, "title": "Crash when rendering empty list", "state": "open",
               "labels": ["bug"], "author_role": "none", "age": "1 to 4 weeks",
               "last_activity": "less than a week", "comment_count": 3, "reactions": 5,
               "body": "…", "comments": [{"author_role":"member","body":"Confirmed on 2.3"}],
               "comments_note": null }
  },
  "questions": { "complexity": {…}, "criticality": {…}, "effort": {…}, "relevance": {…}, "kind": {…} }
}
```

The response is mapped as in §4.4. `usage.input_tokens` is stored with each classification and summed for the run summary.

### 4.7 Cost and latency estimate (200 issues)

| Item | Estimate | Basis |
|---|---|---|
| Questions (5, structured) | ≈ 900 tokens | the question text above is ≈ 3 200 chars |
| Project context (trimmed) | ≈ 1 500–2 300 tokens | 6 000 + 1 500 chars max, plus metadata |
| Issue + comments | ≈ 300–4 500 tokens | a typical issue is ≈ 1 000 tokens |
| **Per call** | ≈ 3 000–7 500 input tokens, typically ≈ 4 000 | |
| **200 issues** | ≈ 0.8 M input tokens | |
| **Price** | ≈ **\$0.03–0.06** | \$0.042 per million input tokens; output is free (`models.md`) |
| Requests | 200 | far below 1 200 per minute |
| Latency | ≈ 11 s per 22 issues at concurrency 4 | **Measured 2026-09-23:** 22 issues in 11 s at concurrency 4 (TypeSafe cloud API). ≈2 s per call. |

The in-app estimator uses the same formula: the sum over issues of `estimateTokens(buildIssueState(...)) + QUESTIONS_TOKENS`.

### 4.8 Analysis persistence (non-secret, `localStorage`)

Classifications are stored **inside their analysis**, one per `IssueRow`. There is no separate classification cache.

**Storage layout.**

- `STORAGE_KEYS.analysesIndex` holds `AnalysisSummary[]`.
- Each `STORAGE_KEYS.analysis(id)` holds one `Analysis`.
- Keeping one analysis per key means a save rewrites only that analysis. It also means a corrupt entry affects only one analysis.

**Store: `adapters/storage/analysisStore.ts`.** Pure functions over an injected `Storage`, following the house style of load/save/upsert/remove keyed by id:

| Function | Behaviour |
|---|---|
| `loadIndex(storage)` | Read the index. |
| `loadAnalysis(storage, id)` | Return the `Analysis`, or `null` if the entry is missing or corrupt. |
| `saveAnalysis(storage, analysis)` | Write the entry, then upsert its summary into the index. |
| `removeAnalysis(storage, id)` | Delete the entry and its index row. |
| `clearAll(storage)` | Remove every key starting with `STORAGE_PREFIX`. |
| `usage(storage)` | Return bytes used under the prefix. |

Every function returns a typed result: `{ ok: true }`, `{ ok: false, reason: 'quota' | 'corrupt' }`, or data. None of them throws.

- **Corrupt entries.** A corrupt entry, or one with an unknown `schemaVersion`, is listed on Home as "Unreadable analysis". The only action offered is Delete. It never crashes the app.

**When saves happen.**

- Immediately after a fetch or refresh completes.
- After each classification result arrives. Consecutive results are coalesced into at most one save per second during a run, plus a final save when the run ends.
- 500 ms after the last working-state change: filter, sort, dismiss or export options.

**What is stored per issue.** The stored form keeps storage bounded:

- the body, trimmed with the same 8 000-char budget as the Jev state (§4.3);
- only the selected comments: at most `maxCommentsPerIssue`, each at most 1 000 chars (the "comments summary");
- labels and metadata;
- the classification.

The stored issue is exactly what Jev saw, and what the expanded row shows.

**Validity.** A stored classification counts as current only when `issueUpdatedAt === issue.updatedAt` and `questionsVersion === QUESTIONS_VERSION`. Otherwise the row is `stale`. `markStale` runs on open and after every refresh.

**Size estimate.** About 1.5–4 KB per issue in UTF-16, the in-memory string cost:

| Analysis | Approximate size |
|---|---|
| 200 issues | 0.3–0.8 MB |
| 1 000 issues | 1.5–4 MB |

Browsers typically allow about 5 MB per origin. The Home storage meter and the per-analysis size make that limit visible.

**Quota errors.** No automatic eviction (§2.3 "Storage full"). If localStorage turns out to be too small in practice, IndexedDB is the follow-up. It is out of v1 scope and not planned.

### 4.9 Priority score (`src/domain/priority.ts`, pure)

The priority score is a composite score in the sense of `patterns/composite-scoring.md`: each dimension is normalized to 0–1, weighted in code, and combined. It is computed on the fly from the stored classification and the analysis weights. It is never stored per row, so changing a weight never touches classifications.

```ts
export function priorityOf(c: Classification | null, w: PriorityWeights): number | null {
  if (!c) return null
  const total = w.criticality + w.relevance + w.complexity + w.effort
  if (total <= 0) return null
  const crit = c.criticality.score / 2          // 0..1, higher = more critical
  const rel  = c.relevance.score / 4            // 0..1, higher = more relevant
  const simp = 1 - c.complexity.score / 2       // inverted: simpler → higher
  const ease = 1 - c.effort.score / 2           // inverted: less effort → higher
  const raw = (w.criticality * crit + w.relevance * rel + w.complexity * simp + w.effort * ease) / total
  return Math.round(100 * raw)                  // integer 0..100
}
```

**Rules.**

- It uses the continuous `score` values, not the rounded levels, so ranking stays fine-grained.
- Rows that are unclassified, in error, or stale-without-classification get `null`. They sort after rows with a number, like other unclassified data.
- A row that is stale but still has a classification keeps its priority, and the table shows a stale badge.
- `clampWeights(w)` rounds each weight to a multiple of 5 within 0–100. It is applied on load and on edit.

**Worked example** with the default weights (40 / 30 / 15 / 15). The scores are criticality 1.8, relevance 3.5, complexity 0.9 and effort 0.4:

```
crit = 1.8 / 2       = 0.90
rel  = 3.5 / 4       = 0.875
simp = 1 − 0.9 / 2   = 0.55
ease = 1 − 0.4 / 2   = 0.80

raw  = (40·0.90 + 30·0.875 + 15·0.55 + 15·0.80) / 100
     = (36 + 26.25 + 8.25 + 12) / 100
     = 0.825

priority = round(100 · 0.825) = 83
```

**Honesty note.** Priority inherits the ordinal nature of the Jev scores (§4.4). It is a ranking aid, not a measurement, and the UI caption says so. The confidence shown for priority is the row's `minConfidence`.

**Tests** (table-driven):

- The worked example above.
- Every weight 0 → `null`.
- A single non-zero weight reduces priority to that dimension alone.
- The inversions hold: raising effort lowers priority.
- Monotonicity in each dimension.
- Clamping.
- `null` for unclassified rows.


---

## 5. GitHub integration design

### 5.1 Verified findings

| Question | Finding | Source |
|---|---|---|
| Is the REST API callable from a browser? | **Yes.** A preflight to `api.github.com` returns `204` with `Access-Control-Allow-Origin: *`. It allows the `Authorization` and `If-None-Match` headers and exposes `ETag`, `Link`, `Retry-After` and `X-RateLimit-*`. | Live probe, 2026-09-23 |
| Rate limits | 60 requests/hour unauthenticated, 5 000 requests/hour authenticated. Secondary limits: at most 100 concurrent requests and 900 points/minute for REST. | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api |
| Conditional requests | "Making a conditional request does not count against your primary rate limit if a `304` response is returned and the request was made while correctly authorized with an `Authorization` header." Anonymous 304s still count. | https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api |
| Concurrency guidance | "make requests serially instead of concurrently … implement a queue" | same page |
| Pagination | `per_page` is at most 100 and is clamped silently above that. Follow the `link` header's `rel="next"`; `rel="last"` gives the page count. | https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api |
| Issues endpoint | `GET /repos/{o}/{r}/issues` with `state=open\|closed\|all`, `sort=created\|updated\|comments`, `direction` and `since`. It returns PRs too, identified by the `pull_request` key. | https://docs.github.com/en/rest/issues/issues#list-repository-issues |
| Comments endpoints | Per issue: `GET /repos/{o}/{r}/issues/{n}/comments`. Per repo: `GET /repos/{o}/{r}/issues/comments` (`sort`, `direction`, `since`; each item has `issue_url`). | https://docs.github.com/en/rest/issues/comments |
| Fine-grained PAT permissions | Listing issues and issue comments requires the **"Issues"** repository permission. The README and `contents/{path}` endpoints require **"Contents"**. `GET /repos/{o}/{r}` requires **"Metadata"**. Read access is enough for all of them. | https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens |
| Creating a fine-grained PAT | Path: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. You choose a resource owner, an expiration, and repository access ("Public repositories", "All repositories" or "Only select repositories"). Then you select permissions; some are read-only. "Tokens always include read-only access to all public repositories on GitHub." | https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens |
| Classic PAT scopes (fallback) | No scope gives read-only access to public data. `repo` gives full read **and write** access to private repos. There is no read-only private scope. | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps |

The user said Metadata read-only is implied, that is, added automatically. **The pages I fetched do not state this explicitly**: the permissions page lists Metadata as its own permission. The how-to (§5.3) therefore tells the user to confirm that Metadata shows as "Read-only" before generating the token. In GitHub's token UI, Metadata is normally marked mandatory once any repository permission is selected; confirm this during Task 15.

### 5.2 Auth design: Personal Access Token only

- **How it is sent.** The token goes as `Authorization: Bearer <token>`, from the browser **directly** to `api.github.com`. CORS allows this, and it is the same in every deployment mode (§9). No proxy is involved.
- **Where it lives.** Only in the in-memory `Secrets.githubToken` (§8). The GitHub adapter receives a `getToken(): string` function and has no knowledge of storage.
- **Without a token.** Anonymous mode works for public repos at 60 requests/hour. Comments are skipped by default in that mode (`fetchComments: 'auto'`).
- **Clear keys.** Wipes the token from memory. The UI links to `https://github.com/settings/personal-access-tokens` so the user can revoke the token on GitHub.
- **Why no "Login with GitHub".** Dropped by user decision. For the record:
  - The OAuth web flow needs a client secret, which requires a server.
  - The device flow endpoints on `github.com/login/*` do not support CORS.
  - Either way, OAuth would add a server-side component that this design avoids.

### 5.3 How-to: getting a GitHub token (for the README)

Based on https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens and the permission map at https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens:

1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Give the token a name, for example `issue-criticity`. Pick an **expiration**; short is better. Pick the **resource owner** that owns the repositories.
3. Under **Repository access**, choose one of:
   - **Public repositories**, if you only analyse public repos. This mode is read-only. The token still gives you the 5 000 requests/hour limit.
   - **Only select repositories**, then pick the private repos to analyse.
4. Under **Permissions → Repository permissions**, set:
   - **Issues: Read-only**, for issues and their comments.
   - **Contents: Read-only**, for the README, CONTRIBUTING, `docs/` and the package manifest.
   - **Metadata: Read-only**, for repository info. Confirm it shows Read-only; GitHub normally adds it automatically.
5. Generate the token, copy it, and paste it into issue-criticity's Settings. It is kept in memory only, so you paste it again after every reload. Store it in your own password manager if you want to keep it.
6. Classic tokens also work. A classic token with no scope reads public repos. Private repos need `repo`, which also grants write access, so the fine-grained token above is preferred.

### 5.4 How-to: getting a Jev API key (for the README)

Based on the local Jev docs mirror:

1. Sign in to the TypeSafe console and open the **API keys dashboard** at `https://console.typesafe.ai/keys`. Source: `introduction/quickstart.md`, step 1: "Get your API key from the dashboard (https://console.typesafe.ai/keys)". Also linked from `agent-skill.md`.
2. Create a key and paste it into issue-criticity's Settings. It is kept in memory only.
3. The mirror documents only the dashboard link. It does **not** document account sign-up, key scopes, key rotation, spending limits or plans. The README must say so and point to https://docs.typesafe.ai for account questions. Pricing and rate limits are summarized from `models.md`.

### 5.5 Fetch sequence (`src/adapters/github/loader.ts`)

1. **Repo metadata.** `GET /repos/{o}/{r}` → `Repo`, including description, topics, default branch and `has_issues`. 1 request.
2. **Project context.** Optional; each 404 becomes `null`. About 4 requests in parallel:
   - `GET /repos/{o}/{r}/readme` with `Accept: application/vnd.github.raw+json`.
   - `GET /repos/{o}/{r}/contents/CONTRIBUTING.md`, falling back to `.github/CONTRIBUTING.md`, raw.
   - `GET /repos/{o}/{r}/contents/docs`, a directory listing; names only.
   - The first manifest that exists, in this order: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`. Only `name` and `description` are parsed: JSON for package.json, a regex for the TOML files, the module line for go.mod.
3. **Issues.**
   - Request: `GET /repos/{o}/{r}/issues?state={s}&sort=updated&direction=desc&per_page=100`.
   - Follow `rel="next"` until `maxIssuesToLoad` is reached. Drop items that have a `pull_request` key.
   - Cost: `ceil(total/100)` requests.
4. **Comments.** Only when enabled (§2.3), and only for issues with `comments > 0`.
   - Request: `GET /repos/{o}/{r}/issues/{n}/comments?per_page=100`. Page 1 holds the oldest comments.
   - If `rel="last"` exists and `commentCount > maxCommentsPerIssue`, also fetch the last page to get the newest comments.
   - Cost: about 1 request per commented issue, 2 for long threads.
   - Example: 200 issues, 150 of them commented, is about 150–170 requests. That is fine at 5 000/hour but not at the anonymous 60/hour.
   - The per-repo comments endpoint is **not** used. It returns comments on every issue and PR in the repo, so its cost has no bound.
5. **Request queue.** A serial queue with at most 2 requests in flight, following GitHub's guidance. The context requests and the first issue page may overlap.

### 5.6 HTTP core (`src/adapters/github/http.ts`, unit-tested with an injected `fetch`)

- **Headers.** `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`. `Authorization: Bearer …` only when `getToken()` returns a non-empty value.
- **ETag cache.** An in-memory `Map<url, { etag, lastModified, body, link }>` that lasts for the session and contains no secrets.
  - Requests send `If-None-Match`. A `304` returns the cached body and `link`.
  - A 304 is free only with a token, but conditional requests are sent in every mode.
- **Rate-limit state.** Parsed from every response (`x-ratelimit-limit`, `-remaining`, `-used`, `-reset`, `-resource`) and exposed reactively.
- **Error policy**, following GitHub's best-practices page:

  | Response | Action |
  |---|---|
  | `retry-after` present | Wait that many seconds, then retry once. |
  | `x-ratelimit-remaining: 0` | Throw `RateLimitedError(resetAt)`. The UI offers Resume after the reset. |
  | Other 403 or 429 | Wait 60 s, then exponential backoff, at most 2 retries. |
  | 5xx | Up to 2 retries with backoff. |
  | 401 | `AuthError`: "Token invalid or expired". The token is cleared from memory. |
  | 404 | `NotFoundError`. |

- **Pagination.** `parseLinkHeader(link): { next?, last? }` is pure and unit-tested. `paginate(url, onPage, signal)` builds on it.

---

## 6. UI

### 6.1 Screens

The app is a single page with no router. `App.vue` switches views based on composable state: Home when no analysis is current, Issues otherwise.

A top bar holds:

- an **Analyses** button that returns to Home;
- the current analysis name;
- the repo input and **New analysis** button;
- the GitHub quota badge;
- a **key status indicator**;
- a Settings gear.

The key status indicator shows one of:

- "Jev key: in memory" / "Jev key: missing"
- "GitHub: token" / "GitHub: anonymous"

Screens:

1. **Settings**, a modal, or a full view while in the "Keys required" state. It contains:
   - the Jev key and GitHub token fields, each with a "not saved" note;
   - Test buttons;
   - Clear keys;
   - the preferences;
   - short links to the §5.3 and §5.4 how-tos.
2. **Home**, the saved analyses list (§2.2). It shows a card or row per analysis with Open, Rename, Refresh and Delete, plus the storage meter, **Clear all local data** and the empty state.
3. **Issues**, the view of the current analysis. It has a header with the name, fetched-at time and **Refresh**, followed by the filters, the Show dismissed toggle, the Classify controls, the table and the Export button.
4. **Export dialog**, a modal.

### 6.2 Components (container / presentational)

| Container (uses composables) | Presentational (props/emits only) |
|---|---|
| `SettingsContainer.vue` | `KeysRequiredBanner.vue`, `SecretField.vue` (masked input with reveal/clear and a "not saved" hint), `PreferencesForm.vue`, `KeyStatus.vue` |
| `HomeContainer.vue` | `AnalysisList.vue`, `AnalysisCard.vue` (open / inline rename / refresh / delete), `StorageMeter.vue`, `ConfirmDialog.vue` (incl. typed confirmation for Clear all) |
| `RepoLoaderContainer.vue` | `RepoInput.vue`, `LoadProgress.vue`, `RateLimitBadge.vue`, `CostConfirm.vue`, `ExistingAnalysisPrompt.vue`, `SaveFailedNotice.vue` |
| `ClassifyContainer.vue` | `ClassifyButton.vue` (split menu), `RunProgress.vue`, `RunSummary.vue` |
| `IssuesContainer.vue` | `AnalysisHeader.vue`, `DismissToggle.vue`, `FilterBar.vue`, `LevelMultiSelect.vue`, `RangeSlider.vue`, `IssueTable.vue`, `IssueRow.vue`, `LevelCell.vue` (level chip, confidence bar, probability tooltip), `RelevanceCell.vue`, `StatusBadge.vue` |
| `ExportContainer.vue` | `SortRuleList.vue` (add/remove/reorder with up and down buttons; keyboard accessible), `ExportPreview.vue` (first 20 lines) |
| `PriorityContainer.vue` | `WeightEditor.vue` (popover: 4 sliders + numeric inputs, reset, live preview), `PriorityCell.vue` |

The base components (buttons, inputs, badges, dialogs, toasts, progress, cards) come from the UI kit in §10.4. The components above compose them.

### 6.3 Table

Columns, in order:

1. `#`, linking to GitHub.
2. Title, with labels shown as chips.
3. Kind.
4. **Priority**: 0–100 with a small bar, and the Weights popover button in its header (§4.9).
5. Criticality, Complexity and Effort: a level chip each. On hover, the raw score, the confidence and the probabilities.
6. Relevance: 0–100 with a bar.
7. Confidence: the row's minimum, with the low-confidence badge.
8. Status.
9. Updated: a relative date, computed in code.
10. Comments.
11. Actions: **Dismiss**, or **Restore** when showing dismissed. A row checkbox enables bulk dismiss.

Behaviour:

- Expanding a row shows the stored, trimmed body and comments, exactly as Jev saw them.
- Rows with `sourceStatus: 'missing'` get a "no longer in source" badge. Dismissed rows, shown only with the toggle, are greyed out.
- The table header is sticky.
- **Above 200 visible rows, the table body uses virtual scrolling** with `@tanstack/vue-virtual` (MIT) and a fixed row height. The expanded detail opens in a side drawer rather than an inline row, which keeps row heights fixed. At 200 rows or fewer, it renders plainly.
- Column sorting reuses `sortRows()`: a click sets a single rule, and shift-click appends a rule.

### 6.4 Filtering and sorting (pure, `src/domain/`)

- **`visibleRows(analysis)`**, in `domain/analysis.ts`, is the single pipeline the table and export use:
  1. Drop dismissed issues, unless `showDismissed` is set (table) or `includeDismissed` is set (export).
  2. Apply `filterRows`.
  3. Apply `sortRows` with the analysis's `tableSort` (table) or `exportOptions.order` (export).
- **`filterRows(rows, filter): IssueRow[]`.** Level filters match `classification.<dim>.level`. Unclassified rows pass the level and relevance filters only when those filters are empty.
- **`sortRows(rows, order: ExportOrder): IssueRow[]`.** A stable multi-key comparator:
  - `priority` compares by `priorityOf(classification, working.priorityWeights)`, and `null` sorts last.
  - Levels compare by raw `score`.
  - Relevance compares by `value`, then by `score`.
  - Dates compare by ISO string.
  - Rows without a classification always sort after classified rows, whatever the direction.
  - The final tie-break is `number` ascending.
- **`searchText(issue)`.** A memoized, lower-cased haystack for the text search.

### 6.5 Plain-text export format (`src/domain/exportText.ts`, pure)

Example, sorted by Priority desc then Effort asc, with confidence and URLs:

```text
issue-criticity report
Repository : acme/widgets (open issues)
Generated  : 2026-09-23 14:05 (local time)
Model      : jev-1.13.0 · questions v1
Order      : Priority (high→low), Effort (low→high)
Weights    : Criticality 40 · Relevance 30 · Complexity 15 (inverted) · Effort 15 (inverted)
Scope      : filtered view — 3 of 187 issues (filters: Relevance ≥ 50)
Note       : Levels, relevance and priority are model-based estimates; relevance and priority are ordinal 0–100 signals.

========================================================================
 1. #812  Crash when rendering empty list
    Priority   : 82/100
    Criticality: HIGH (conf 0.91)   Complexity: MEDIUM (0.74)   Effort: LOW (0.82)
    Relevance  : 88/100 (0.77)      Kind: bug       Labels: bug, regression
    Opened 2026-09-02 by @jdoe · updated 2026-09-20 · 3 comments
    https://github.com/acme/widgets/issues/812

 2. #640  Memory leak after hot reload
    Priority   : 57/100
    Criticality: HIGH (conf 0.66)   Complexity: HIGH (0.71)     Effort: HIGH (0.58)
    Relevance  : 75/100 (0.80)      Kind: bug       Labels: —
    Opened 2026-03-11 by @mkim · updated 2026-09-18 · 14 comments
    https://github.com/acme/widgets/issues/640

 3. #701  Typo in README install section
    Priority   : 45/100
    Criticality: LOW (conf 0.97)    Complexity: LOW (0.99)      Effort: LOW (0.98)
    Relevance  : 50/100 (0.62)      Kind: documentation   Labels: docs
    Opened 2026-06-30 by @ali · updated 2026-06-30 · 0 comments
    https://github.com/acme/widgets/issues/701

========================================================================
Unclassified (1)
 -  #815  Add Svelte adapter   (not classified: Rate limited — retried 3×)
```

Format rules:

- Fixed-width layout, two-space indentation, LF line endings, UTF-8 without BOM.
- Titles are forced onto one line: `\r\n` and `\t` become spaces.
- Omitted optional parts leave no empty placeholders.
- Levels are upper-cased. Confidence uses 2 decimals.
- Dates are `YYYY-MM-DD`. The header's generated time uses the local time zone.
- The export never contains a secret.
- When **Include dismissed** is set, a final `Dismissed (N)` section lists those issues in the same compact form as the `Unclassified` section.
- The header's `Repository` line also carries the analysis name when it differs from the default.

`downloadText(filename, text)` is anchor-based: Blob URL → `<a download>` click → revoke on the next tick. This follows the house convention of `downloadBlob`, `downloadText` and `safeStem`.

---

## 7. Architecture

### 7.1 Folder tree

```text
issue-criticity/
├─ SPEC.md
├─ README.md  CONTRIBUTING.md  LICENSE  .env.example  .gitignore
├─ docs/
│  ├─ architecture.md  jev-questions.md  export-format.md  deployment.md
├─ package.json  pnpm-workspace.yaml  tsconfig.json  tsconfig.node.json
├─ vite.config.ts                      # port 5200, Jev proxy (server + preview), test block
├─ index.html                          # CSP meta
├─ server/                             # Node-only, imported by vite.config.ts only
│  └─ jevProxy.ts                      # proxy options factory: allowlist + header stripping, no logging
├─ src/
│  ├─ main.ts  App.vue  style.css
│  ├─ domain/                          # pure TS: no Vue, no fetch, no storage
│  │  ├─ types.ts                      # model + defaultX() + STORAGE_KEYS
│  │  ├─ repoRef.ts  text.ts  dates.ts
│  │  ├─ jevState.ts                   # buildProjectContext, buildIssueState, size guard
│  │  ├─ classification.ts             # answer → Classification, staleness
│  │  ├─ priority.ts                   # priorityOf, clampWeights (§4.9)
│  │  ├─ analysis.ts                   # createAnalysis, mergeRefetch, dismiss/restore, summarize, visibleRows
│  │  ├─ filter.ts  sort.ts  estimate.ts  exportText.ts
│  ├─ adapters/
│  │  ├─ github/ http.ts  link.ts  loader.ts  mappers.ts  errors.ts
│  │  ├─ jev/    transport.ts  questions.ts  client.ts  runner.ts  pool.ts
│  │  ├─ storage/ preferencesStore.ts  analysisStore.ts   # non-secret only
│  │  └─ download.ts
│  ├─ composables/                     # module-singleton reactive stores
│  │  ├─ useSecrets.ts                 # in-memory only; no storage import allowed
│  │  ├─ usePreferences.ts  useAnalyses.ts (index + Home actions)  useAnalysis.ts (current analysis + debounced save)
│  │  ├─ useRepo.ts  useClassifier.ts  useFilters.ts  useExport.ts   # all operate on useAnalysis()
│  ├─ ui/                              # design system (§10): tokens.ts, contrast.ts, motion.ts,
│  │                                   #   base components Ui*.vue, LevelBadge, ScoreBar, KitPage.vue (dev only)
│  ├─ assets/icons/                    # generated Icon<Name>.vue (from design/icons via scripts/build-icons.mjs)
│  └─ components/
│     ├─ containers/ …Container.vue
│     └─ ui/ …feature presentational .vue (compose src/ui/ kit)
├─ design/icons/{streamline-pixel,custom}/   # icon sources (CC BY 4.0 / MIT)
├─ scripts/build-icons.mjs
├─ THIRD_PARTY_NOTICES.md
└─ tests/ (or co-located *.test.ts)
   └─ fixtures/                        # synthetic issues/READMEs only — no real personal data
```

### 7.2 Dependency direction

Dependencies point one way: `components → composables → adapters → domain`.

- Containers use composables. Presentational components depend only on `domain/types`.
- `domain/` imports nothing outside itself, including Vue and browser APIs. The clock and randomness are injected.
- `adapters/` import `domain/`. Network adapters take an injected `fetch`, and the stores take an injected `Storage`.
- `composables/` wire adapters to Vue reactivity as module singletons: `reactive()` at module scope, and `useX()` returns it.
  - `useSecrets.ts` must not import any storage adapter or any web-storage API. A test enforces this.
- `server/` is Node-only. Only `vite.config.ts` imports it.
- `src/ui/` (the design system) imports only Vue and `src/assets/icons/`. It never imports composables, adapters or domain code. Both `components/` layers may import it.
- An architecture test checks the import rules by globbing source files. It fails on:
  - `domain/` importing outside itself;
  - `useSecrets.ts` importing `adapters/storage/*`;
  - any `src/` file referencing `sessionStorage`, `indexedDB` or `document.cookie`.

### 7.3 What is pure and testable

- **Pure, unit-tested (no DOM):**
  - everything in `domain/`;
  - `adapters/github/link.ts` and `mappers.ts`;
  - `adapters/jev/questions.ts`, via a snapshot plus a `QUESTIONS_VERSION` guard.
- **Tested with fakes:**
  - `adapters/github/http.ts` and `loader.ts`, with a fake `fetch`;
  - the Jev `transport` (fake `fetch`) and `client`, `runner` and `pool` (fake `JevTransport`, fake timers, seeded random);
  - the stores, with a fake `Storage`, including a fake that throws `QuotaExceededError` and corrupt or unknown-`schemaVersion` entries.
- **Analysis domain:**
  - `mergeRefetch` tables covering new, changed (→ stale), unchanged and missing issues, and that working state is preserved.
  - `dismiss` / `restore` round-trips.
  - `removeMissing`.
  - `visibleRows`: dismissal, then filter, then sort.
  - `summarize` counts.
  - Immutability: inputs are deep-frozen in tests.
- **Server:** the `server/jevProxy.ts` options factory. Assert the allowlist regex, the rewrite, header stripping via a mock `proxyReq`, and that nothing is logged.
- **Components:** `@vue/test-utils` + `happy-dom` for presentational components with logic: `SortRuleList`, `LevelCell`, `FilterBar`, `SecretField` and `KeysRequiredBanner`.
- **Design system:**
  - pure `contrastRatio` plus the token-pair AA test (§10.2);
  - a `tokensToCss` snapshot for both themes;
  - `priorityOf` / `clampWeights` tables (§4.9);
  - `useReducedMotion` with a `matchMedia` mock, checking that durations resolve to 0;
  - render tests for `UiButton` states, `UiSecretInput` reveal / `aria-pressed`, `LevelBadge` label, glyph and `aria-label`, `UiDialog` focus trap and return, `UiToast` roles, and `WeightEditor` live emit and all-zero warning;
  - the generated-icon sanity test (§10.5).
- **Secrets never persisted, as a behaviour test.**
  1. Set both secrets, apply preferences, create and save an analysis, classify one issue with a fake transport, and change the working state.
  2. Assert that no value in `localStorage`, `sessionStorage` or `document.cookie` contains either secret. Scan every key.
  3. Simulate a module reload (`vi.resetModules()`). Assert that `useSecrets()` is empty **and** that the analysis, its classification and its working state are restored.
- **Strict TDD.** For every behaviour: RED first, then GREEN, then REFACTOR. The runner is `pnpm test` (`vitest run`). No test touches the real network.

### 7.4 Stack and conventions

- **Stack.** Vue 3.5, Vite 6, TypeScript 5.x (strict), pnpm, Vitest, `@vue/test-utils`, `happy-dom` and `vue-tsc`. No UI framework and no Tailwind, same as steam-picker.
- **Port.** **5200** with `strictPort: true`. Siblings use 5173, 5180 and 5190.
- **pnpm builds.** `pnpm-workspace.yaml` must declare `allowBuilds` as a **YAML map**, because pnpm 11 ignores the `pnpm` field in `package.json`:
  ```yaml
  allowBuilds:
    esbuild: true
  ```
- **Scripts.** `dev`, `build` (`vue-tsc --noEmit && vite build`), `preview`, `test` (`vitest run`), `test:watch`, `typecheck`.
- **Environment variables.**
  - `.env` is optional and may hold only **non-secret** configuration: `VITE_JEV_BASE_URL` (default `/jev`).
  - Secrets are never read from `.env` or `import.meta.env`, so they can never enter a bundle.

---

## 8. Security and privacy

### Secrets are in memory only

- The Jev API key and the GitHub token live **only** in the reactive `useSecrets()` module state. There is no `STORAGE_KEYS` entry for them.
- They are never written to `localStorage`, `sessionStorage`, cookies, IndexedDB, the Cache API, URLs or query strings, `history.state`, the export file, or console output.
- A page refresh, closing the tab, or **Clear keys** loses them. The app then shows the "Keys required" state (§2.1).
- A 401 from either service clears the affected key from memory.
- The architecture and behaviour tests in §7.2 and §7.3 enforce all of this.

### What is persisted, all non-secret

Stored in `localStorage`, all under the `issue-criticity:` prefix:

- **Preferences** (§3): the last repo text, the last analysis id, and the defaults.
- **Saved analyses** (§3.1, §4.8). Each holds:
  - repo metadata and the project context: README, CONTRIBUTING, `docs/` names, manifest;
  - issue titles, **trimmed issue bodies and selected comments**, labels, authors and dates;
  - classifications;
  - working state: filters, sort, export order, dismissed issues.

**Private-repo content is stored in plain text in this browser.** If you analyse a private repository, its issue text and README excerpts live unencrypted in this browser profile's `localStorage` until you delete them.

- Anyone with access to your OS account or browser profile can read them. So can browser extensions allowed on `localhost`.
- Settings says this in a notice next to the privacy notice. The New-analysis flow repeats it once for a private repo (`Repo.isPrivate`).
- Encryption at rest is out of scope. A key derived from a password would have to be re-entered after every reload, like the secrets. It is noted as a possible future option.

**Wiping data.** Both actions are available from Home and from Settings:

- **Delete analysis** removes one analysis entry and its index row.
- **Clear all local data** removes every `issue-criticity:*` key (preferences and all analyses) after a typed confirmation ("delete"). It also clears the in-memory secrets.

The README also documents the manual route: browser settings → site data for `localhost:5200`.

**Still no secrets on disk.** The no-secrets rule is unchanged. The §7.3 behaviour test scans every persisted key, including analyses, for the two secret values.

### Residual risks, stated in the README

- Any script running on the app's origin could read in-memory state and `localStorage`. To limit that, the app loads **no third-party scripts, fonts or CDNs**; everything is bundled.
- Browser extensions and password managers are outside the app's control.
- In-memory keys can remain in the tab's memory until it is closed or reloaded.

### Network destinations

- The browser talks to `api.github.com` directly, and to `{jevBaseUrl}` for Jev.
- In v1 the local Vite proxy forwards the Jev calls only to `api.typesafe.ai`. No other hosts are contacted.
- `index.html` sets a CSP `<meta>`:
  `default-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' data: https://avatars.githubusercontent.com; style-src 'self' 'unsafe-inline'`
- A hosted mode with an absolute function URL adds that origin to `connect-src` (§9).

### No logging of secrets

- No `console.*` call receives headers, request bodies, or objects that contain secrets.
- UI error messages are built from the response status and body only, never from the request.
- The proxy's `configure` hook must not log. A test asserts that `console` stays silent.

### Proxy hardening (v1)

- A path allowlist: only `/v1/systemone` and `/v1/models`.
- The proxy strips `cookie`, `origin` and `referer`.
- The dev and preview servers bind to `localhost` only. This is Vite's default; do not set `host: true`. Other machines on the LAN therefore cannot use the proxy.
- The proxy only forwards the `Authorization` header. It stores nothing.

### CORS summary

| Host | Browser access | Route |
|---|---|---|
| `api.github.com` | Allowed (`*`) | Called directly, in every mode. |
| `api.typesafe.ai` | Rejects browser origins | Always behind a proxy that holds the key only in transit (§9). |

### Data sent to Jev

- The app sends issue text and trimmed repo documentation. For private repos, that is private content.
- Settings shows a notice: "Issue content of the repositories you classify is sent to TypeSafe AI." It links to TypeSafe's legal page and cites `models.md` §Data handling: "Jev is not trained on customer requests or responses".

### Untrusted content

- Issue bodies and README text are rendered as **plain text**, never with `v-html`.
- Links are built only from the API's `html_url`.

Public-repo hygiene is covered in §12.2.

---

## 9. Deployment modes

**Invariant for every mode: no server ever stores a key or a token.** Keys live in the browser tab's memory (§8). Any server component only forwards the `Authorization` header while the request is in flight. It never logs, caches or persists it. GitHub is always called **directly from the browser**, because `api.github.com` allows CORS. Only Jev needs a proxy.

- **(a) v1: local, the only mode implemented.**
  - The app runs with `pnpm dev` or `pnpm preview` on `localhost:5200`.
  - The Vite proxy (§4.1) forwards `/jev/v1/systemone` and `/jev/v1/models` to `api.typesafe.ai`, carrying the user's key in transit only.
  - `jevBaseUrl = '/jev'`.
- **(b) Future: hosted on a public domain, for example Firebase Hosting. Not implemented in v1.**
  - The static build is served by the host. The same proxy contract is provided by a serverless function, for example a Firebase Cloud Function behind a Hosting rewrite of `/jev/**`.
  - The contract is: same allowlisted paths; forward `Authorization` and the JSON body unchanged; strip `cookie`, `origin` and `referer`; no logging of headers or bodies; no storage.
  - With a same-origin rewrite, `jevBaseUrl` stays `'/jev'`. With a function on another origin, set `VITE_JEV_BASE_URL` to its absolute URL, add that origin to the CSP `connect-src`, and let the function answer CORS for the site origin only.
  - Switching modes is configuration only. `JevTransport` (§4.1) is the single seam, and nothing above it changes.
  - Before going public, the function needs its own review of abuse and rate limiting, because it is an open relay for anyone who holds a Jev key. That design is out of scope here.

`docs/deployment.md` records this section for readers of the public repo.

---

## 10. Design and UX

### 10.1 Direction and principles

- **Look and feel:** modern, friendly, tasteful and professional.
- **Pixel art is the accent, never the reading surface.** The logo, icons, illustrations, empty states, badge glyphs and small details are pixel art. They sit on a clean, modern layout. All body text, table text and numbers use a highly readable sans-serif.
- **One obvious primary action per screen:**

  | Screen | Primary action |
  |---|---|
  | Home | **New analysis** |
  | Issues, nothing classified | **Classify N issues** |
  | Issues, classified | **Export** |

  The primary action is the only filled accent button on screen. Every other action is secondary, ghost or in an overflow menu.
- **Progressive disclosure.** Advanced preferences sit under a collapsed "Advanced" group. Weights live in a popover. Per-level probabilities appear in tooltips. Raw scores and trimmed state appear in the detail drawer.
- **Easy to understand at first use:**
  - **First-run checklist.** A small three-step checklist on Home — **1 Keys → 2 Repository → 3 Classify** — stays until each step has been completed once. It is persisted as a non-secret preference.
  - **Inline help for the two keys.** Each key field has a "Where do I get this?" disclosure with the short how-to from §5.3 or §5.4, a link, and "Kept in memory only".
  - **Empty and error states.** Every one has a pixel illustration, one plain sentence saying what happened, and exactly one action.
- **Motion helps interaction, never decorates** (§10.6).

### 10.2 Design tokens (`src/ui/tokens.ts`, pure, then CSS custom properties)

Tokens are a typed TypeScript object. The pure function `tokensToCss(tokens, theme)` emits `:root[data-theme=light|dark]` variables. The `theme` preference is `'system' | 'light' | 'dark'` (default `'system'`) and follows `prefers-color-scheme`. It is set with a toggle in the top bar and added to `Preferences`.

**Color, with semantic roles.** The values below are the starting palette.

| Role | Light | Dark |
|---|---|---|
| `bg` (app background) | `#F7F7FA` | `#111318` |
| `surface` (cards, table) | `#FFFFFF` | `#1A1D24` |
| `surface-2` (header, hover) | `#F0F1F5` | `#232733` |
| `border` | `#DADCE5` | `#333848` |
| `text` | `#16181D` | `#ECEEF3` |
| `text-muted` | `#5B6070` | `#A3A9B8` |
| `accent` (primary action, focus, links) | `#4B4BC8` | `#9A9AF2` |
| `on-accent` | `#FFFFFF` | `#111318` |
| `success` / `warning` / `danger` / `info` (text) | `#1E6B3A` / `#8A5A00` / `#A3261D` / `#1F5BB8` | `#7FD69B` / `#F5C56B` / `#FF9C92` / `#8DB8FF` |
| `level-high` fg / bg | `#A3261D` / `#FDE7E4` | `#FF9C92` / `#3A1A18` |
| `level-medium` fg / bg | `#7A5000` / `#FFF1D6` | `#F5C56B` / `#3A2C10` |
| `level-low` fg / bg | `#1E6B3A` / `#E3F4E8` | `#7FD69B` / `#15301F` |
| `scale-1..5` (relevance / priority bars, sequential indigo) | `#E6E6FA` `#C4C4F2` `#9D9DE8` `#7373DC` `#4B4BC8` | `#2A2A4A` `#3D3D73` `#5656A3` `#7676CF` `#9A9AF2` |

**Semantics of the level colors.** "High" uses the same hot color for every dimension, so the scale reads as intensity. What high *means* depends on the dimension: urgent, hard or costly. The column header and tooltip carry that meaning. Color is never the only signal:

- every level badge also shows a pixel "signal" glyph with 3, 2 or 1 filled bars;
- every level badge shows its text label;
- scale bars always sit next to their number.

**Contrast is enforced by a test, not by eye.** A pure `contrastRatio(fg, bg)` function checks every text/background pair above:

- at least 4.5:1 for text;
- at least 3:1 for borders, focus rings and scale bars against `surface`.

If a value fails, adjust the token until it passes. The test is the authority, not the hex values in this table.

**Spacing, on an 8 px grid.**

- Tokens: `space-1 = 4` (half step, only for icon-to-label gaps), `space-2 = 8`, `space-3 = 16`, `space-4 = 24`, `space-5 = 32`, `space-6 = 48`, `space-7 = 64`.
- Component heights: 32 (compact), 40 (default) and 48 (large).
- Table row height: 40. Icon sizes: 16, 24 and 32, always integer multiples of the icon's pixel grid, so pixel art stays crisp.

**Radii.**

- `radius-sm = 4` for chips and inputs; `radius-md = 8` for buttons and cards; `radius-lg = 12` for dialogs.
- `radius-pixel = 0` for pixel-art frames, such as the empty-state illustration frame and the logo tile.
- An optional "pixel border" utility draws a 2 px stepped outline with `box-shadow`. It is an accent for the Home cards' hover state only.

**Elevation.** Three levels, each using a softer shadow in dark mode plus a lighter `surface`:

| Level | Used by |
|---|---|
| `elev-1` | cards, sticky table header |
| `elev-2` | popovers, dropdowns, toasts |
| `elev-3` | dialogs |

**Motion.**

- Durations: `dur-fast = 120ms` (hover, press), `dur-base = 200ms` (popover and drawer open, row state change), `dur-slow = 320ms` (dialog, toast enter).
- Easings: `ease-out = cubic-bezier(0, 0, 0.2, 1)` for entering, `ease-in = cubic-bezier(0.4, 0, 1, 1)` for leaving, `ease-standard = cubic-bezier(0.2, 0, 0, 1)`.
- `ease-pixel = steps(4, end)` is reserved for pixel sprites, such as the progress mascot and the logo blink.

### 10.3 Typography

- **Body and UI: Inter (variable).** Bundled with `@fontsource-variable/inter`, license OFL-1.1, self-hosted with no CDN, matching the CSP in §8.
  - Tables and numbers use `font-variant-numeric: tabular-nums`.
  - Fallback stack: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Pixel font: Silkscreen.** Bundled with `@fontsource/silkscreen`, license OFL-1.1.
  - Allowed **only** for the logo wordmark, the Home H1, empty-state headlines, and the priority badge's "P" glyph.
  - Minimum 16 px, rendered at integer sizes.
  - Fallback: `ui-monospace, "Cascadia Mono", Consolas, monospace`.
  - **Never** used for body text, table cells, form labels or numbers.
- **Type scale** (size / line height, px):

  | Step | Size / line height | Use |
  |---|---|---|
  | caption | 12 / 16 | |
  | table | 14 / 20 | table cells, dense UI |
  | body | 16 / 24 | prose, dialogs |
  | h3 | 20 / 28 | |
  | h2 | 24 / 32 | |
  | h1 | 32 / 40 | |

  Weights are 400, 500 and 600.
- **Verify the font licenses** during Task 2: both packages declare OFL-1.1 in their npm metadata. Record them in the third-party notices.

### 10.4 Component inventory (UI kit, `src/ui/`)

Every component takes props and emits events only; none of them uses a store. Every interactive component has visible **default, hover, focus-visible, active and disabled** states, plus the extra states listed below.

| Component | Variants and extra states |
|---|---|
| `UiButton` | primary / secondary / ghost / danger; sizes 32 / 40 / 48; `loading` (inline pixel spinner, label kept for width); icon-only (requires `aria-label`) |
| `UiInput`, `UiTextarea` | error (message below, `aria-invalid`, `aria-describedby`); with prefix icon; clearable |
| `UiSecretInput` | masked by default; reveal toggle (eye icon, `aria-pressed`); clear; "Kept in memory only" hint; "Where do I get this?" disclosure; validation states *untested / checking / ok / invalid* after **Test** |
| `UiSelect`, `UiMultiSelect` | chips inside the multi-select; keyboard type-ahead |
| `UiSlider` | with a paired numeric input; step 5; `aria-valuetext` |
| `LevelBadge` | high / medium / low × light / dark; pixel signal glyph (3 / 2 / 1 bars); `aria-label` such as "Criticality: high"; stale variant (dashed outline) |
| `ConfidenceBadge` | high ≥ 0.8 (subtle, often hidden), medium 0.5–0.8, low < 0.5 (warning color and a pixel "?" glyph); tooltip with probabilities |
| `ScoreBar` | 0–100 value in text plus a bar in `scale-1..5`; used for Relevance and Priority |
| `UiTable` | sticky header; sortable headers with `aria-sort` and a small multi-key order index ("1", "2"); row states: default / hover / selected / focused / dismissed (muted) / missing (badge) / pending (shimmer) / error (danger stripe); **virtual scrolling above 200 rows** (§6.3) |
| `FilterChip` | inactive / active / removable (×); an "N filters" summary chip that opens the filter panel |
| `SortRuleList` (sort-order editor) | add, remove, move up / down, direction toggle; keyboard reorder with Alt+↑/↓; empty state "No sort — default order" |
| `WeightEditor` | 4 `UiSlider`s; live preview; reset; all-zero warning (§2.5) |
| `UiDialog` | focus trap; Esc closes; returns focus on close; destructive variant with a typed confirmation |
| `UiPopover`, `UiTooltip` | tooltips on hover and focus, 300 ms delay, no interactive content; popovers are click-toggled with a focus trap |
| `UiToast` | success / info / warning / error; auto-dismiss after 5 s (not for errors); pause on hover; `role="status"` or `role="alert"` for errors; at most 3 stacked |
| `ClassifyProgress` | determinate bar (done / total) plus counts; a small pixel mascot sprite (`ease-pixel`) walks along the bar and is static under reduced motion; paused / cancelled / finished states |
| `AnalysisCard` (Home) | default / hover (pixel border accent) / focused / unreadable; name, repo, counts, fetched date, size; actions in an overflow menu, with Open as the whole-card primary action |
| `EmptyState` | pixel illustration (32×32 or 48×48 grid, scaled 4×) + title (pixel font allowed) + one sentence + one action |
| `StorageMeter`, `KeyStatus`, `RateLimitBadge` | ok / warning (>80%) / critical |

**Visual check page.** `src/ui/KitPage.vue` renders every component in every state in both themes.

- It is served only in dev, when the URL has `?kit`, through a dynamic import guarded by `import.meta.env.DEV`. It is therefore excluded from production builds.
- There is no Storybook.
- The Task 2 acceptance includes a manual pass of this page in light, dark and reduced-motion modes.

### 10.5 Icons and illustrations (licensing verified 2026-09-23)

**Findings.**

- **The Streamline "Pixel" set exists and is free.** The set page lists 662 icons, labeled "Free + Open-source", "Licensed under the Creative Commons - CC BY 4.0", and shows the attribution "Icons by Streamline". Source: https://www.streamlinehq.com/icons/pixel
- **Streamline's other free sets use the proprietary Streamline Free License.** Source: https://help.streamlinehq.com/en/articles/5354376-streamline-free-license. Under that license:
  - attribution with a link to https://streamlinehq.com is mandatory;
  - use is limited to 50 icons per project;
  - assets must not be made available "as standalone design resources".

  Raw SVGs committed to a public repository can be downloaded by anyone, so that clause is a poor fit for an open-source repo.
- **CC BY 4.0 allows redistribution and modification,** including in a public MIT-licensed repo, provided there is attribution, a license link and an indication of changes. The icons **remain CC BY 4.0**: they are not relicensed under MIT, and the notices must say so.

**Decision.**

1. **Primary icon source: the Streamline Pixel set (CC BY 4.0) only.**
   - Do not use Streamline sets that are under the Free License.
   - Keep the icon count small anyway, around 30 or fewer.
2. **Custom pixel-art SVGs**, authored in this repo under MIT, for:
   - the logo;
   - the empty-state and error illustrations;
   - the progress mascot;
   - any icon the Pixel set lacks, including the level signal glyph.
3. **Fallback.** If, at download time in Task 2, the Pixel set page no longer states CC BY 4.0, switch entirely to custom pixel-art SVGs. The pipeline below is identical either way.

**Pipeline.**

- Source SVGs live in `design/icons/{streamline-pixel,custom}/*.svg`.
- `scripts/build-icons.mjs` normalizes each file:
  - enforce the `viewBox`;
  - `fill="currentColor"`;
  - `shape-rendering="crispEdges"`;
  - strip metadata and IDs.
- The script generates one Vue SFC per icon, `src/assets/icons/Icon<Name>.vue`. Each icon is imported explicitly where used, so the build is tree-shaken. There is no runtime CDN and no global icon registry.
- The generated files are committed, and `pnpm icons` re-runs the script.
- A unit test checks that every generated icon has `currentColor`, has a `viewBox`, and has no `<script>` or `on*` attributes.
- Icons render at 16, 24 or 32 px only. Decorative icons are `aria-hidden="true"`; icon-only buttons carry an `aria-label`.

**Attribution.**

- **README "Credits" section** and `THIRD_PARTY_NOTICES.md`:
  > Pixel icons by Streamline (https://www.streamlinehq.com), from the "Pixel" set, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: recolored to `currentColor` and optimized.
- **In the UI:** an "About" section at the bottom of Settings shows the same line, links and font licenses.
- **`LICENSE`** (MIT) states that third-party assets are excluded and points to `THIRD_PARTY_NOTICES.md`.

### 10.6 Motion and effects

- **What is animated.**
  - Hover and press: background and border color, `dur-fast`.
  - Focus ring: appears instantly; no animation on focus.
  - Row state changes, such as pending → done: a 200 ms background flash in `surface-2`, then the level badges fade in.
  - Classification progress: the bar width, plus the mascot sprite.
  - Popovers and the drawer: opacity plus a 4 px translate, `dur-base`.
  - Dialogs and toasts: opacity plus scale 0.98 → 1, `dur-slow`.
  - Dismiss: the row collapses in height over `dur-base`, then an undo toast appears ("Issue dismissed · Undo").
- **What is never animated.** Table sorting, which reorders instantly. Filtering. Numbers, which never count up. Nothing loops except progress while work is running.
- **Reduced motion.**
  - `@media (prefers-reduced-motion: reduce)` and `useReducedMotion()` set every duration to 0 ms, except opacity fades capped at 80 ms.
  - Transforms and sprite stepping are removed, and the mascot is static.
  - Tested with a `matchMedia` mock.
- **Performance.** Animate only `opacity`, `transform` and colors, never layout properties. The one exception is the dismiss collapse, which uses the FLIP technique. Virtualized rows do not animate on scroll.

### 10.7 Accessibility baseline (WCAG 2.2 AA)

- **Keyboard.**
  - Every action is reachable, in logical tab order.
  - The table uses roving `tabindex`: ↑/↓ moves between rows, Enter opens the detail drawer, and `D` dismisses the focused row.
  - `/` focuses the search. `Esc` closes the topmost popover or dialog.
  - The shortcuts are listed in a "Keyboard shortcuts" dialog opened with `?`.
- **Focus.** A visible `focus-visible` ring on every interactive element: 2 px `accent` with a 2 px offset, at least 3:1 against both themes. Focus is never removed.
- **Contrast.** AA is enforced by the token test (§10.2): 4.5:1 for text, 3:1 for UI components.
- **Semantics.**
  - A native `<table>` with `<th scope="col">` and `aria-sort`.
  - Labelled form controls.
  - `aria-live="polite"` for classification progress and load progress; toasts use `role="status"`, or `role="alert"` for errors.
  - Dialogs use `role="dialog"` with `aria-modal` and a labelled title.
  - Badges carry full `aria-label`s, for example "Priority 82 of 100", or "Criticality high, confidence 0.91".
- **No color-only meaning** (§10.2). Pixel illustrations are `aria-hidden`, with the meaning carried by the adjacent text.
- **Zoom.** The layout works at 200% browser zoom at 1280 px.

### 10.8 Responsive behaviour

- **Desktop first.** Designed at 1440 px; fully usable at **1024 px**.
- **Below 1280 px.**
  - The Kind, Comments and Updated columns move behind a "Columns" menu, and the user can bring them back.
  - The filter bar collapses into an "N filters" chip plus a panel.
- **At 1024 px.**
  - The top bar hides the analysis name behind the Analyses button.
  - Home cards use `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`.
- **Below 1024 px.** The app stays functional: the table scrolls horizontally inside its container, never the page. A dismissible notice says "issue-criticity works best on a wider window".
- **Touch.** Not a target. Controls still meet a 32 px minimum hit area.

---

## 11. Task breakdown

These conventions apply to every task:

- **Strict TDD.** Write the listed tests first and watch them fail, then implement, then refactor.
- **Checks.** `pnpm test` and `pnpm typecheck` must be green.
- **Docs.** Each task **ships its own docs updates**: the affected README section, `docs/*.md`, and code comments on the questions file. The line estimates include them.
- **Commits.** One Conventional Commit or more per task.
- **Size.** About 400 authored changed lines per task is a planning heuristic, not a cap.

| # | Title | Files touched | Tests first | Acceptance criteria | ≈ lines | Model |
|---|---|---|---|---|---|---|
| 1 | Project scaffold and tooling | `package.json`, `pnpm-workspace.yaml` (allowBuilds map), `vite.config.ts` (port 5200, strictPort, test block), `tsconfig*.json`, `index.html` (CSP meta), `src/main.ts`, `App.vue`, `.gitignore`, `.env.example` (`VITE_JEV_BASE_URL=/jev` only), README skeleton | Smoke test (App mounts). Architecture test for the §7.2 import rules, including no `sessionStorage` / `indexedDB` / `document.cookie` in `src/`. | `pnpm i && pnpm dev` serves on 5200. Test and typecheck green. `.gitignore` covers `.env`, `node_modules`, `dist`, `coverage`. | 230 | sonnet |
| 2 | Design system and UI kit | `src/ui/tokens.ts`, `contrast.ts`, `motion.ts` (`useReducedMotion`), `theme.ts` (system / light / dark, `data-theme`), base components (`UiButton`, `UiInput`, `UiSecretInput`, `UiSelect`, `UiMultiSelect`, `UiSlider`, `UiDialog`, `UiPopover`, `UiTooltip`, `UiToast`, `LevelBadge`, `ConfidenceBadge`, `ScoreBar`, `EmptyState`, `FilterChip`), `KitPage.vue` (dev only, `?kit`), `scripts/build-icons.mjs`, `design/icons/*`, first icons and the logo, font packages, `THIRD_PARTY_NOTICES.md`, `docs/design.md` | `contrastRatio` plus the AA test over every token pair in both themes. `tokensToCss` snapshot. `useReducedMotion` → 0 ms durations. Render tests: button variants and states, secret-input reveal (`aria-pressed`), LevelBadge text, glyph and `aria-label`, dialog focus trap and return, toast roles. Generated-icon sanity test. | Kit page shows every component in every state, in light, dark and reduced-motion. Streamline Pixel license re-confirmed and recorded, or the custom-only fallback applied (§10.5). No runtime CDN. | 400 | opus |
| 3 | Domain model, factories, repo URL parser | `domain/types.ts` (incl. `Analysis`, `AnalysisWorkingState`, `AnalysisSummary`, `PriorityWeights`, theme and onboarding prefs), `domain/repoRef.ts`, `domain/dates.ts`, `domain/text.ts` | `parseRepoRef` (every URL form, plus errors). Date buckets with an injected clock. `trimMiddle`, `stripMarkdownNoise`, `estimateTokens`. Every `defaultX()` (incl. `defaultAnalysis`, `defaultWorkingState`, `defaultPriorityWeights`) returns fresh objects. `STORAGE_KEYS` has no secret key, and `analysis(id)` builds a prefixed key. | All §3 types exported. Factories exist. The parser covers §2.3. | 360 | sonnet |
| 4 | In-memory secrets, preferences storage, Settings screen | `composables/useSecrets.ts`, `adapters/storage/preferencesStore.ts`, `composables/usePreferences.ts`, `containers/SettingsContainer.vue`, `ui/KeysRequiredBanner.vue`, `PreferencesForm.vue`, `KeyStatus.vue`, About / credits block, README "Keys" section | Secrets live in memory only, and a module reset leaves them empty. `clearKeys()`. Preferences load/save with a fake `Storage` (corrupt JSON → defaults; quota error surfaced; theme persisted). The banner shows when the Jev key is absent and can be dismissed. "Where do I get this?" disclosures. `beforeunload` is registered only while a run is active. | After a reload, the app shows "Keys required" and preferences survive. No secret appears in any storage. Uses the kit components from Task 2. | 380 | sonnet |
| 5 | GitHub HTTP core | `adapters/github/http.ts`, `link.ts`, `errors.ts` | `parseLinkHeader`. Auth header only when the token is non-empty. ETag 304 returns the cached body. Rate-limit header parsing. `retry-after` wait (fake timers). remaining = 0 → `RateLimitedError(resetAt)`. 401 clears the token via callback. 404 and 5xx policy. Serial queue with at most 2 in flight. | All §5.6 behaviours pass with a fake `fetch`. No real network. | 380 | opus |
| 6 | GitHub loader and project context | `adapters/github/loader.ts`, `mappers.ts` (stored-form trimming of body and comments), `domain/jevState.ts` (`buildProjectContext`), fixtures, README "GitHub token" how-to (§5.3) | PRs always dropped. `maxIssuesToLoad` cap. Comments only for `comments > 0`, first and last page. README stripping and budgets. Manifest parsing for 4 ecosystems. 404 → `null` fields. Comment cost estimate. Stored-form budgets (§4.8). | Loading a fixture repo yields `Repo`, `Issue[]` (stored form) and `ProjectContext` per §5.5. `has_issues: false` → typed error. | 400 | opus |
| 7 | Analysis domain and persistence | `domain/analysis.ts`, `adapters/storage/analysisStore.ts`, `composables/useAnalyses.ts`, `composables/useAnalysis.ts` (current analysis, debounced and coalesced saves) | `createAnalysis`. `mergeRefetch` table tests: new, changed → stale, unchanged, missing, working state (incl. weights) preserved. `dismiss` / `restore` / `removeMissing` / `rename`. `summarize` counts. `visibleRows` order of operations. Immutability. Store: `loadIndex`, `loadAnalysis`, `saveAnalysis` (with index upsert), `removeAnalysis`, `clearAll` (prefix only), `usage`. Quota → `{ok:false, reason:'quota'}` with no eviction. Corrupt or unknown schema → "unreadable". Debounce and coalesce timing. The full §7.3 secrets-never-persisted test, including restore after reload. | A reload restores the last analysis with its issues, classifications and working state. Delete and Clear all remove exactly the right keys. | 400 | opus |
| 8 | Home screen, New analysis and Refresh UI | `composables/useRepo.ts` (fetch → `createAnalysis` / `mergeRefetch`), `containers/HomeContainer.vue`, `RepoLoaderContainer.vue`, `ui/AnalysisList.vue`, `AnalysisCard.vue`, `StorageMeter.vue`, `ConfirmDialog.vue`, `RepoInput.vue`, `LoadProgress.vue`, `RateLimitBadge.vue`, `CostConfirm.vue`, `ExistingAnalysisPrompt.vue`, `SaveFailedNotice.vue`, first-run checklist, Home empty state, README "Local data" section | Load state machine: idle → loading → done / rate-limited / error, plus resume. Comment-cost confirm at 80% of remaining. Huge-repo confirm above 20 pages. The existing-analysis prompt. Refresh merges and keeps working state. Save-failed notice with Retry save. Home ordering, inline rename, delete confirm, typed Clear-all confirmation. Private-repo storage notice shown once. Onboarding checklist progression. | Every §2.2 and §2.3 edge case is visible in the UI. Exactly one primary action on Home. Cancel works. The quota badge and storage meter update live. | 400 | sonnet |
| 9 | Jev questions, state builder and size guard | `adapters/jev/questions.ts`, `domain/jevState.ts` (`buildIssueState`, guard), `domain/estimate.ts`, `docs/jev-questions.md` | `QUESTIONS` snapshot plus version guard (a text change without a version bump fails). State shape. Date buckets, with no raw dates. Comment selection (first 2 and last 6; bots and "+1" dropped). Trimming order. "Too large" error. Token and cost estimate. | State matches §4.3. The guard keeps state at or below 12k estimated tokens. The docs page explains each question. | 380 | opus |
| 10 | Jev transport adapter, client, mapping and Vite proxy | `adapters/jev/transport.ts` (interface plus `createHttpJevTransport`), `adapters/jev/client.ts`, `domain/classification.ts`, `server/jevProxy.ts`, `vite.config.ts` (server and preview proxy), `docs/deployment.md`, README "Jev key" how-to (§5.4) | Transport: URL built from `baseUrl`, Bearer header, `retry-after` and `retry-after-ms` parsed, per-attempt timeout, no logging. Client: request body shape. Mapping: `round(score)` → level, relevance `round(100·score/4)`, `minConfidence`, malformed response → error. Proxy options: allowlist regex, rewrite, strips origin / referer / cookie, silent. | Swapping `baseUrl` needs no code change. A manual check with a real key through `pnpm dev` returns a `Classification`; the key is entered at runtime and never committed. | 380 | opus |
| 11 | Classification runner and Classify UI | `adapters/jev/pool.ts`, `runner.ts`, `composables/useClassifier.ts` (writes via `applyClassification` into `useAnalysis`), `containers/ClassifyContainer.vue`, `ui/ClassifyButton.vue`, `ClassifyProgress` wiring, `RunSummary.vue`, toasts | Pool concurrency. Retry with backoff and jitter (fake timers, seeded random). `retry-after`. Adaptive halving and restore. 401 aborts the run and clears the key. Cancel keeps completed results. Incremental apply and coalesced saves. Unclassified / stale selection. Dismissed issues are skipped. `aria-live` progress announcements. | §2.4 flows work, including resume after a reload by re-entering the key, with no re-fetch. The §4.7 latency row is updated with a measured value. Progress respects reduced motion. | 380 | opus |
| 12 | Issues table, filters, search and dismiss | `domain/filter.ts`, `domain/sort.ts` (single key), `composables/useFilters.ts` (persists into working state), `containers/IssuesContainer.vue`, `ui/AnalysisHeader.vue`, `DismissToggle.vue`, `FilterBar.vue`, `IssueTable.vue` (on `UiTable`: sticky header, virtual scroll above 200 rows via `@tanstack/vue-virtual`), `IssueRow.vue`, `LevelCell.vue`, `RelevanceCell.vue`, `StatusBadge.vue`, detail drawer | `filterRows` for each filter and in combination. Unclassified handling. AND text search. Dismiss, bulk dismiss, undo toast, Show dismissed and Restore. Missing badge and Remove missing. Virtualization switches on above 200 rows. Roving-tabindex keyboard navigation and shortcuts (`/`, `D`, Enter). Filter state is restored when the analysis is reopened. | The "K of N (D dismissed)" count is correct. Filters AND together and persist per analysis. Bodies render as plain text, with no `v-html`. Usable at 1024 px (§10.8). | 400 | sonnet |
| 13 | Multi-key sort, export formatter and dialog | `domain/sort.ts` (multi-key, incl. `priority` key), `domain/exportText.ts`, `adapters/download.ts`, `composables/useExport.ts`, `containers/ExportContainer.vue`, `ui/SortRuleList.vue` (also used by the table Sort popover), `ExportPreview.vue`, `docs/export-format.md` | Stable multi-key sort. Unclassified and null priority always last. Tie-break by number. Shift-click adds a key. Table sort and export options persist per analysis. Golden-file test against §6.5, incl. the Priority and Weights lines and the Dismissed section. Filename stem. SortRuleList keyboard reorder (Alt+↑/↓). | The output matches the golden file byte-for-byte, apart from the timestamp line. "Use current table sort" works. Optional pin-to-top (§2.5) goes in only if the task stays within budget; otherwise it is deferred. | 380 | sonnet |
| 14 | Priority score and weight editor | `domain/priority.ts` (`priorityOf`, `clampWeights`), `ui/WeightEditor.vue`, `PriorityCell.vue`, `containers/PriorityContainer.vue`, wiring into `visibleRows` and the table column, `docs/jev-questions.md` (priority section) | `priorityOf` table tests (§4.9: worked example, all-zero → null, single weight, inversions, monotonicity, clamping, unclassified → null). WeightEditor: live preview emit (debounced by 150 ms), reset to 40 / 30 / 15 / 15, all-zero warning, keyboard slider operation. Weights persist per analysis and survive a reload. | The Priority column and sort update live while weights change. Export shows priority and weights. The caption explains the inversion and the ordinal nature. | 320 | sonnet |
| 15 | README and public-repo readiness | `README.md` (final, incl. Credits), `CONTRIBUTING.md`, `LICENSE` (MIT), `THIRD_PARTY_NOTICES.md` review, `docs/architecture.md`, `.env.example`, `.gitignore` review, hygiene check script plus test | The hygiene check fails on: a committed `.env`; token-like strings (`ghp_`, `github_pat_`, `gho_`, `Bearer [A-Za-z0-9]`) in tracked files; real e-mail addresses or local machine paths in fixtures and docs; a Streamline asset outside `design/icons/streamline-pixel/`. | The §12.2 checklist and the §12.3 design checklist are fully ticked. The README is complete per §12.1. A fresh clone plus the README steps gives a working app. | 360 | sonnet |

**Order.** Tasks run in order, 1 → 15.

- Task 2 (design system) comes before any UI work. **All UI tasks (4, 8, 11, 12, 13, 14) depend on Task 2.**
- Task 7 depends on 3. Task 8 depends on 6 and 7. Task 10 depends on 3 and 9. Task 11 depends on 4, 7 and 10. Task 14 depends on 12 and 13.

**Total.** About 5 550 authored lines. Per the delivery policy, expect several PR slices, for example {1–2}, {3–4}, {5–6}, {7–8}, {9–11}, {12–14}, {15}.

---

## 12. Documentation and public-repo readiness

The project must be fully documented and ready to publish as a **public** GitHub repository.

### 12.1 Documentation deliverables

**`README.md`** at the top level, covering:

- What it is: a one-paragraph pitch and the four dimensions.
- Screenshots: a placeholder section, with a TODO note for `docs/screenshots/`.
- Requirements: Node 20+ and pnpm 11. A Jev API key is required; a GitHub token is optional.
- Install: `pnpm install`, with a note on the `allowBuilds` map.
- **Getting a Jev API key**, from §5.4, including what the docs do not cover.
- **Getting a GitHub token**, the fine-grained PAT how-to from §5.3.
- Run: `pnpm dev` → http://localhost:5200. Test: `pnpm test`, `pnpm typecheck`.
- How classification works: the question design, and relevance as an ordinal value. Plus the cost estimate.
- **Keys and privacy**:
  - Keys are held in memory only and must be re-entered after every reload.
  - They are sent only to `api.github.com` (directly) and to `api.typesafe.ai` (through the local proxy, in transit only).
  - No server stores them. There is no telemetry.
  - Issue content is sent to TypeSafe AI for classification.
  - Residual risks: extensions, password managers.
- **What is stored locally, and how to wipe it**:
  - The list of what persists in `localStorage`: preferences and saved analyses, meaning issue text, project context, classifications and working state.
  - A plain statement that private-repo issue text is stored **unencrypted** in the browser profile.
  - That secrets are never stored.
  - The size limits and the storage meter.
  - How to remove data: **Delete analysis**, **Clear all local data**, or the browser's site-data settings for `localhost:5200`.
- **Using saved analyses**: Home, Refresh (what changes and what is preserved), dismiss / restore, and per-analysis sort and filters.
- **Priority score**: the formula in plain words, the default weights, the inversion of complexity and effort, and a reminder that it is a ranking aid.
- **Credits**: the Streamline Pixel attribution line (§10.5) and the font licenses.
- Limitations: v1 runs only on the local dev or preview server, and why; the hosted mode is future work (`docs/deployment.md`).
- License.

**`docs/`**:

- `architecture.md`: the layers, the dependency direction, the transport seam and the proxy.
- `jev-questions.md`: each question and its rationale, the mapping rules, and how to change the questions (bump `QUESTIONS_VERSION`).
- `export-format.md`: the format specification with an example.
- `deployment.md`: the §9 modes and the no-server-stores-secrets invariant.
- `design.md`: the §10 tokens, typography, component inventory, motion rules and icon pipeline, with the "how to add an icon" steps.

**Other files**:

- **`CONTRIBUTING.md`**: dev setup, the strict-TDD expectation, Conventional Commits, the folder and dependency rules, and "never commit secrets or real personal data; never add code that persists secrets".
- **`LICENSE`**: the MIT License text, with `Copyright (c) 2026 <copyright holder>`. Fill in the holder's name at publish time, and never commit personal e-mail addresses. Add one extra line stating that third-party assets (icons and fonts) keep their own licenses, see `THIRD_PARTY_NOTICES.md`.
- **`THIRD_PARTY_NOTICES.md`**: the Streamline Pixel icons (CC BY 4.0, with the attribution and changes, §10.5) and the fonts Inter and Silkscreen (OFL-1.1). List any other bundled asset with a non-MIT license here too.
- **`.env.example`**: only `VITE_JEV_BASE_URL=/jev`, with a comment saying it is non-secret configuration. No keys and no real values.

### 12.2 Public-repo hygiene checklist

- [ ] `.gitignore` covers `.env`, `.env.*` (except `.env.example`), `node_modules/`, `dist/`, `coverage/`, `*.log` and `.DS_Store`.
- [ ] No secrets in code, fixtures, docs, screenshots or git history. The Task 15 hygiene check scans for token patterns.
- [ ] No code path persists a secret. The Task 1, 4 and 7 tests enforce this.
- [ ] Test fixtures for analyses and storage use synthetic data only. Never commit an exported `localStorage` dump or a real `.txt` export.
- [ ] No personal data. Fixtures use synthetic users and repos (`acme/widgets`, `@jdoe`). No real e-mail addresses. No machine paths such as `C:\Users\…`.
- [ ] No hardcoded API key or token anywhere.
- [ ] Every artifact is in English: code, comments, UI copy, tests, docs and commit messages.
- [ ] The README has no references to private sibling tools or local-only paths. Before publishing, either keep SPEC.md's evidence references or move it to `docs/spec.md` with the local mirror paths replaced by the public docs.typesafe.ai URLs.
- [ ] `package.json` has `"private": true` (not published to npm), plus `license`, `description` and `repository`.
- [ ] `pnpm test` and `pnpm typecheck` are green on a fresh clone.
- [ ] `LICENSE` (MIT) and `THIRD_PARTY_NOTICES.md` are present. Every Streamline icon lives under `design/icons/streamline-pixel/`, and the attribution appears in the README and in Settings → About.

### 12.3 UI design-quality acceptance checklist

Run this against the kit page (`?kit`) and the real screens, in light, dark and reduced-motion modes, at 1440 px and 1024 px.

- [ ] **One primary action per screen.** Exactly one filled accent button per screen: New analysis, Classify or Export.
- [ ] **First-use clarity.** A new user reaches a classified table without reading the README, using only the first-run checklist, the key help disclosures and the empty states.
- [ ] **Empty and error states.** Every one shows a pixel illustration, one sentence and one action, with no dead ends.
- [ ] **Pixel art is an accent only.** The pixel font appears only in the logo, the Home H1, empty-state headlines and the "P" glyph. All body, table and number text uses Inter with tabular numbers.
- [ ] **Tokens only.** No hard-coded colors, spacing or durations in components. A lint rule or grep check finds no hex colors or pixel literals outside `src/ui/tokens.ts`.
- [ ] **8 px grid.** Spacing and component heights come from the scale in §10.2.
- [ ] **Contrast.** The AA token test passes. Level meaning never relies on color alone: each badge has a label and a glyph.
- [ ] **Keyboard.** Every flow can be completed with the keyboard only: new analysis, classify, filter, dismiss and restore, sort, weights, export. Focus rings are always visible, and dialogs trap and return focus.
- [ ] **Screen reader.** A spot check with NVDA or VoiceOver: badges, progress and toasts are announced, and the table reports its sort state.
- [ ] **Motion.** Every animation has a purpose (§10.6). Nothing loops while idle. With `prefers-reduced-motion`, there are no transforms or sprites.
- [ ] **Performance.** 1 000 rows scroll smoothly, with virtualization on. Opening the weight editor and moving a slider re-sorts without visible jank.
- [ ] **Icons.** Every icon is crisp at 16, 24 and 32 px, uses `currentColor`, and has an `aria-label` or `aria-hidden`.
- [ ] **Responsive.** At 1024 px there is no horizontal page scroll, and the table scrolls only within its container.

---

## 13. Open questions

None. All product decisions are resolved:

| Decision | Resolution | Where |
|---|---|---|
| License | MIT | §12.1 |
| Pull requests | Excluded in v1, with no option | §2.3 |
| Persisting fetched issues | Yes, as saved analyses | §3.1, §4.8 |
| Weighted priority | In v1 | §4.9 |
| GitHub auth | Token only | §5.2 |
| Secrets | Memory only | §8 |
