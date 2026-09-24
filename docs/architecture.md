# Architecture

local-issue-classifier is a client-only Vue 3 app plus one small Node-only proxy module
(`server/jevProxy.ts`). There is no backend: state lives in memory (secrets), in the browser's
IndexedDB (saved analyses) or in its `localStorage` (preferences), see "Storage layout" below.

## Folder tree

```text
src/
  domain/         Pure TypeScript. No Vue, no fetch, no storage, no browser APIs.
  adapters/
    github/       GitHub REST client, pagination, mappers, typed errors.
    jev/          Jev transport, client, request/response mapping, the concurrency pool
                  and the classification runner.
    browser/      In-browser inference (docs/browser-inference.md): the JevK5-style readout,
                  an in-process JevTransport, the transformers.js model loader (lazy import),
                  the WebGPU check and the model cache (Cache API).
    storage/      Thin browser-storage adapters: localStorage for preferences (and the
                  legacy analysis layout), IndexedDB for saved analyses (analysisDb.ts), and
                  the one-time migration between them (analysisMigration.ts).
    download.ts   Anchor-based file download helper.
  composables/    Vue composition functions: wire domain + adapters into reactive state.
  components/
    containers/   Screen-level components: own composables and data flow.
    ui/           Presentational components: props in, events out, no composable imports.
  ui/             The design system (tokens, themed CSS, base components, KitPage).
  assets/icons/   Generated icon components (see "Icon pipeline" below).
server/
  jevProxy.ts     Node-only Vite middleware; imported by vite.config.ts alone.
  jevProxyPolicy.ts  Pure /jev proxy policy (allowlists, same-origin, rate limit, body cap),
                  shared by jevProxy.ts and the hosted function.
functions/
  jev/[[path]].ts Cloudflare Pages Function for the hosted /jev proxy: not part of the Vite build
                  ("Deployment modes" below, docs/security.md).
  ortAssets.ts    Serves/emits ONNX Runtime Web's wasm + loader under /ort/ (no CDN).
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
- `sessionStorage` may be referenced only by `src/adapters/storage/secretsStore.ts`, and `indexedDB`
  only by `src/adapters/storage/analysisDb.ts` (both exact allowlists: the test also fails if that
  one file stops using it); no file under `src/` may reference `document.cookie`.
- The Cache API may be referenced only by `src/adapters/browser/modelCache.ts` (exact allowlist), and
  `@huggingface/transformers` may be imported only by `src/adapters/browser/browserModel.ts`, and
  only with a dynamic `import()`, so ONNX Runtime stays out of the main bundle.

## Key composables

| Composable | Role |
|---|---|
| `useSecrets` | Store for the Jev API key, GitHub token and local key (§8): in memory by default, opt-in tab/device persistence through `secretsStore.ts` only. |
| `usePreferences` | Loads/saves `Preferences` through `adapters/storage/preferencesStore.ts`. |
| `useAnalyses` | The analysis index: `boot` (migration, then the first listing), list, rename, delete, `clearAll`, storage usage/quota and the persistence state. |
| `useAnalysis` | The current analysis: async load, debounced/coalesced async save, `updateWorking`, `restoreLastOpened`. |
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

## Deployment modes

The proxy runs on two hosts, both driven by the same pure policy (`server/jevProxyPolicy.ts`), so
they answer every request identically: locally, `pnpm dev`/`pnpm preview` serve `/jev` through the
Vite proxy (`server/jevProxy.ts`, bound to `localhost` only); hosted, a Cloudflare Pages Function
(`functions/jev/[[path]].ts`) serves the same routes at the same same-origin path, so
`VITE_JEV_BASE_URL` stays `/jev` either way. The hosted function's entire contract is two Pages
environment variables: `ALLOWED_ORIGINS` (comma-separated site origins accepted from `Origin` or
`Referer` when `Sec-Fetch-Site` is absent — **required**: the function fails closed with a 403 on
every request when this is unset or empty, rather than trusting `Sec-Fetch-Site` alone) and
`JEV_UPSTREAM_URL` (optional; defaults to `https://api.typesafe.ai`). See
[security.md](security.md#the-proxy-trust-boundary) for the full threat model and
[local-providers.md](local-providers.md) for what a hosted build does not offer (no `/jev-local`,
no local-provider proxy).

## Storage layout

Saved analyses live in **IndexedDB**; every other non-secret value stays in `localStorage`.
Analyses moved (FB IndexedDB lane, 2026-09-24) because real ones hit localStorage's ~5 MB
per-origin quota.

### IndexedDB: saved analyses

`adapters/storage/analysisDb.ts` is the only module that touches `indexedDB`. Database
`local-issue-classifier`, version 1, with two object stores, both keyed by analysis id:

| Store | Holds |
|---|---|
| `analyses` | One full `Analysis` (repo metadata, project context, issue rows, classifications and working state) as its serialized JSON text: byte-for-byte what the legacy `localStorage` entry held, `schemaVersion` included. One parser (`analysisStore.parseAnalysis`) validates both, and a Vue proxy can never hit a `DataCloneError`. |
| `summaries` | The `AnalysisSummary` for the Home list, written in the **same transaction** as its analysis, so the two cannot drift. |

- The adapter is async and never throws or rejects. Results are typed exactly like the legacy
  store's (`LoadResult`, `SaveResult`, `IndexEntry`, `{ ok: false, reason: 'quota' | 'unavailable' }`).
  Every operation is queued and runs in call order: a later save always wins, and a delete or
  Clear all is never overtaken by an earlier save.
- A record with no summary is recovered by parsing it; one that does not parse (garbage, or an
  unknown `schemaVersion`) is listed as **unreadable** (Delete only). Orphan summaries are dropped.
- `usage()` uses `navigator.storage.estimate()` when the browser reports usage and quota, and
  otherwise sums serialized sizes (plus the app's localStorage keys) with an unknown quota. The
  storage meter reads "Local storage used: 12.3 MB of 48.2 GB available", or the usage alone.
- No database (blocked site data, some private modes): reads are empty and writes fail as
  `unavailable`. A failed open is retried by the next call (e.g. **Retry save**).
- Persistence: the first successful save of a session calls `navigator.storage.persist()`, unless
  storage is already persistent. Settings → Local data shows the state (`persisted()`, read-only).

`useAnalysis` changes the in-memory analysis synchronously and saves asynchronously: working
state is debounced 500 ms, classification results are coalesced to one save per second plus
`flush()` at the end of a run, and fetch/refresh results are saved immediately. A save clears the
dirty flag only if nothing changed while it was in flight. `App.vue` renders a loading state until
boot (migration, then `restoreLastOpened()`) has finished.

### localStorage: preferences (and the legacy layout)

Keys prefixed with `local-issue-classifier:` (`STORAGE_PREFIX` / `STORAGE_KEYS` in
`src/domain/types.ts`):

| Key | Holds |
|---|---|
| `local-issue-classifier:preferences:v1` | `Preferences`: last repo, last analysis id (`lastAnalysisId`), defaults, theme, onboarding flags. |
| `local-issue-classifier:secrets:v1` | Only with the opt-in `device` secrets level (see "Secrets policy"). Never in IndexedDB. |
| `local-issue-classifier:analyses:v1` | **Legacy** `AnalysisSummary[]` index. Removed by the migration. |
| `local-issue-classifier:analysis:v1:{id}` | **Legacy** full `Analysis`. Removed by the migration once copied. |

`adapters/storage/analysisStore.ts` keeps the legacy reader (for the migration), the shared parser
and result types, and `clearAll()` / `usage()`, which operate on `STORAGE_PREFIX` only, so they
never touch an unrelated key that merely starts with the same characters without the trailing
colon (see the "not our prefix" case in `analysisStore.test.ts`).

### One-time migration

`adapters/storage/analysisMigration.ts` runs on every boot (`useAnalyses().boot()`) and is
idempotent: once the legacy keys are gone there is nothing left to move. For each legacy
`analysis:v1:{id}` key it writes the entry to IndexedDB, **reads it back and compares** it, and only
then deletes the key. A readable entry becomes a normal record; an unreadable one is copied as-is,
so Home keeps listing it as unreadable instead of dropping it silently. A failed copy keeps its
legacy key for the next boot, and a readable database copy (an interrupted earlier run) is never
overwritten. The legacy index key goes once no legacy entry is left. `App.vue` shows a one-line
toast: "Moved N analyses to the larger local database." Preferences, `lastAnalysisId` and the
secrets entry are never touched.

**Clear all local data** removes every app-prefixed localStorage key (synchronously, first), then
empties both IndexedDB stores.

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
`preview.proxy`) and a guard middleware. The guard runs every request through the pure policy in
`server/jevProxyPolicy.ts`: an allowlist of exactly `POST /v1/systemone` and `GET /v1/models`,
same-origin callers only, a 2 MB body cap and a per-IP token-bucket rate limit. Only
`authorization`, `content-type` and `accept` reach upstream, and answers carry
`Cache-Control: no-store`. It forwards the JSON body unchanged, logs nothing, and stores
nothing — the key passes through in transit only. The hosted function
(`functions/jev/[[path]].ts`) imports the same policy. The threat model is in
[security.md](security.md). GitHub is always called
directly from the browser, since `api.github.com` allows CORS. See "Deployment modes" above for
the two hosts and their environment variable contract.
