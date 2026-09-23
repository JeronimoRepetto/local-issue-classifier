# Architecture

local-issue-classifier is a client-only Vue 3 app plus one small Node-only proxy module
(`server/jevProxy.ts`). There is no backend and no database: state lives in memory (secrets) or
in the browser's `localStorage` (everything else, see "Storage layout" below).

## Folder tree

```text
src/
  domain/         Pure TypeScript. No Vue, no fetch, no storage, no browser APIs.
  adapters/
    github/       GitHub REST client, pagination, mappers, typed errors.
    jev/          Jev transport, client, request/response mapping, the concurrency pool
                  and the classification runner.
    storage/      Thin localStorage read/write for preferences and analyses.
    download.ts   Anchor-based file download helper.
  composables/    Vue composition functions: wire domain + adapters into reactive state.
  components/
    containers/   Screen-level components: own composables and data flow.
    ui/           Presentational components: props in, events out, no composable imports.
  ui/             The design system (tokens, themed CSS, base components, KitPage).
  assets/icons/   Generated icon components (see "Icon pipeline" below).
server/
  jevProxy.ts     Node-only Vite middleware; imported by vite.config.ts alone.
tests/            Cross-cutting tests: architecture rules, tokens-only rule, icons, the
                  secrets-never-persisted behaviour test, the proxy tests, and fixtures.
```

## Dependency direction

```text
components (containers) ──▶ composables ──▶ adapters ──▶ domain
components (ui)         ──▶ composables (only via props/events from a container)
src/ui (design system)  ──▶ nothing but Vue and src/assets/icons/
domain                  ──▶ nothing (no Vue, no adapters, no browser APIs)
```

The rule in one line: **domain is imported by everyone and imports nothing project-local**;
everything else only ever points "down" the list above, never sideways or back up.

`tests/architecture.test.ts` enforces this by scanning source files directly, so a forbidden
import turns the test suite red instead of relying on code review:

- `src/domain/**` may only import other `src/domain` files (relative imports) or, in a co-located
  `*.test.ts` file, `vitest` itself. No Vue, no adapters, no composables.
- `src/ui/**` (the design system) may not import `adapters`, `composables` or `domain`.
- `src/components/ui/**` may not import `adapters`.
- `src/composables/useSecrets.ts` may not import a storage adapter, and no file under `src/`
  may reference `sessionStorage`, `indexedDB` or `document.cookie`.

## Key composables

| Composable | Role |
|---|---|
| `useSecrets` | In-memory-only store for the Jev API key and GitHub token (§8). No storage import. |
| `usePreferences` | Loads/saves `Preferences` through `adapters/storage/preferencesStore.ts`. |
| `useAnalyses` | The analysis index: list, create, delete, `clearAll`. |
| `useAnalysis` | The current analysis: load, debounced/coalesced save, `updateWorking`. |
| `useRepo` | Drives a new-analysis or refresh fetch through the GitHub adapter, then
  `createAnalysis`/`mergeRefetch` into `useAnalysis`. |
| `useClassifier` | Runs a classification scope through the Jev pool/runner and applies results
  incrementally into `useAnalysis`. |
| `useFilters` | Reads/writes the current analysis's filter and persists it into working state. |
| `useExport` | Export options, the pure preview text (`domain/exportText.ts`), and download. |
| `useView` | Which screen (Home vs. an open analysis) is shown. |
| `useRunGuard` | Registers `beforeunload` only while a classification run is active. |

Every composable is a module-singleton function (`useX()` returns the same reactive state on
every call within a module instance) — there is no external store library.

## Storage layout

All non-secret state lives in `localStorage`, under keys prefixed with
`local-issue-classifier:` (`STORAGE_PREFIX` / `STORAGE_KEYS` in `src/domain/types.ts`):

| Key | Holds |
|---|---|
| `local-issue-classifier:preferences:v1` | `Preferences` — last repo, last analysis id, defaults, theme, onboarding flags. |
| `local-issue-classifier:analyses:v1` | `AnalysisSummary[]` — the Home list index. |
| `local-issue-classifier:analysis:v1:{id}` | One full `Analysis` — repo metadata, project context, issue rows, classifications and working state (filter, sort, dismissed, export options, priority weights). |

`adapters/storage/analysisStore.ts`'s `clearAll()` and `usage()` operate on `STORAGE_PREFIX` only,
so they never touch an unrelated key that merely starts with the same characters without the
trailing colon (see the "not our prefix" case in `analysisStore.test.ts`).

## Secrets policy

The Jev API key and the GitHub token live **only** in `useSecrets()`'s reactive module state —
there is no `STORAGE_KEYS` entry for them, and `useSecrets.ts` is architecturally forbidden from
importing a storage adapter or a web-storage API (enforced above). A reload, closing the tab, or
**Clear keys** loses them; a 401 from either service clears the affected key. Every persisted key
(preferences and every saved analysis) is scanned for both secret values by
`tests/secretsNeverPersisted.test.ts`. See `SPEC.md` §8 for the full policy and residual risks.

## The Jev proxy

The Jev API rejects browser origins, so the browser never calls `api.typesafe.ai` directly.
`server/jevProxy.ts` builds the proxy options consumed by `vite.config.ts` (`server.proxy` and
`preview.proxy`): an allowlist of exactly `/v1/systemone` and `/v1/models`, a rewrite that strips
the `/jev` prefix, and header stripping of `cookie`, `origin` and `referer` before the request
reaches upstream. It forwards the `Authorization` header and the JSON body unchanged, logs
nothing, and stores nothing — the key passes through in transit only. GitHub is always called
directly from the browser, since `api.github.com` allows CORS. See `docs/deployment.md` for the
full contract and how a future hosted mode would honour it.
