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
- `src/composables/useSecrets.ts` may import only the dedicated `adapters/storage/secretsStore.ts`
  (no other storage adapter, no web-storage API), and only `useSecrets.ts` may import that store.
- `sessionStorage` may be referenced only by `src/adapters/storage/secretsStore.ts` (an exact
  allowlist); no file under `src/` may reference `indexedDB` or `document.cookie`.

## Key composables

| Composable | Role |
|---|---|
| `useSecrets` | Store for the Jev API key, GitHub token and local key (§8): in memory by default, opt-in tab/device persistence through `secretsStore.ts` only. |
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

The Jev API key, the GitHub token and a local server's key live in `useSecrets()`'s reactive
module state. By **default** (`Preferences.secretsPersistence: 'memory'`) that is the only place
they exist: a reload, closing the tab, or **Forget keys** loses them, and nothing is written to the
browser.

Since FB-2 (2026-09-24) the user may opt in, in Settings (`SecretsPersistenceToggle`), to one of two
persistence levels:

| Level | Storage | Lifetime |
|---|---|---|
| `memory` (default) | none | until reload or tab close |
| `tab` | `sessionStorage` | survives a reload, deleted when the tab closes |
| `device` | `localStorage` | stays on this device until forgotten |

- Only the **choice** is stored in preferences. The keys themselves are stored by
  `adapters/storage/secretsStore.ts` under one dedicated key, `local-issue-classifier:secrets:v1`,
  in the chosen storage only — never in preferences or analyses, and never in both storages.
- Every key change is written through; an empty key (for example one dropped after a 401) is
  removed from storage too, and an all-empty value removes the entry.
- Switching level migrates the keys and wipes the previous location. On load, the keys are
  restored from the chosen level's storage and any copy elsewhere is wiped; an unknown stored level
  counts as `memory`. A corrupt entry is removed, not trusted.
- **Forget keys** (`clearKeys()`) wipes memory and both storages whatever the level. The
  `device` entry shares `STORAGE_PREFIX`, so **Clear all local data** removes it as well.

The risk is stated in the UI: keys stored in the browser can be read by anyone with access to this
Windows user profile or by malware; the app runs on localhost only. `useSecrets.ts` is
architecturally forbidden from touching a web-storage API or any other storage adapter (enforced
above). `tests/secretsNeverPersisted.test.ts` proves the default guarantee (nothing persisted,
reload empties keys) and each opt-in level (dedicated key only, reload restore, migration,
wipe, no secret in preferences or analyses in any mode).

## The Jev proxy

The Jev API rejects browser origins, so the browser never calls `api.typesafe.ai` directly.
`server/jevProxy.ts` builds the proxy options consumed by `vite.config.ts` (`server.proxy` and
`preview.proxy`): an allowlist of exactly `/v1/systemone` and `/v1/models`, a rewrite that strips
the `/jev` prefix, and header stripping of `cookie`, `origin` and `referer` before the request
reaches upstream. It forwards the `Authorization` header and the JSON body unchanged, logs
nothing, and stores nothing — the key passes through in transit only. GitHub is always called
directly from the browser, since `api.github.com` allows CORS. See `docs/deployment.md` for the
full contract and how a future hosted mode would honour it.
