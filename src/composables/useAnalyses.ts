// The saved-analyses list behind Home: a module singleton over
// the analysis index in IndexedDB (adapters/storage/analysisDb.ts). It refreshes
// itself after every save of the current analysis, and asks the browser once,
// on the first successful save, to keep the data persistent.
// boot() runs the one-time move from the legacy localStorage layout before the
// first listing. Clearing in-memory secrets on "Clear all local data" (§8) is
// the caller's job (useSecrets, Task 4); this module only touches non-secret storage.
import { reactive } from 'vue'
import { rename as renameAnalysis } from '../domain/analysis'
import { clearAll as clearAppKeys, usage as appKeysUsage } from '../adapters/storage/analysisStore'
import type { ClearResult, IndexEntry, LoadResult, RemoveResult, SaveResult } from '../adapters/storage/analysisStore'
import {
  getAnalysisDb,
  getStorageManager,
  persistenceState,
  requestPersistence,
} from '../adapters/storage/analysisDb'
import type { PersistenceState } from '../adapters/storage/analysisDb'
import { migrateLegacyAnalyses } from '../adapters/storage/analysisMigration'
import type { MigrationResult } from '../adapters/storage/analysisMigration'
import { getAppStorage } from '../adapters/storage/appStorage'
import { analysisNow, useAnalysis } from './useAnalysis'

const state = reactive<{
  entries: IndexEntry[]
  usageBytes: number
  /** The browser's quota for this origin, or null when it cannot tell. */
  quotaBytes: number | null
  persistence: PersistenceState | 'unknown'
}>({ entries: [], usageBytes: 0, quotaBytes: null, persistence: 'unknown' })

let refreshSeq = 0
let lastRefresh: Promise<void> = Promise.resolve()
let persistenceRequested = false

function refresh(): Promise<void> {
  const seq = ++refreshSeq
  const run = (async () => {
    const db = getAnalysisDb()
    const entries = await db.loadIndex()
    const used = await db.usage(appKeysUsage(getAppStorage()))
    // Only the latest refresh may write, so a slow earlier one never shows stale data.
    if (seq !== refreshSeq) return
    state.entries = entries
    state.usageBytes = used.usedBytes
    state.quotaBytes = used.quotaBytes
  })()
  lastRefresh = run
  return run
}

/** navigator.storage.persist(), at most once per session and only after a real save. */
async function ensurePersistence(): Promise<void> {
  if (persistenceRequested) return
  persistenceRequested = true
  state.persistence = await requestPersistence(getStorageManager())
}

/** The current persistence state, without prompting (Settings → Local data). */
async function checkPersistence(): Promise<void> {
  state.persistence = await persistenceState(getStorageManager())
}

let lastPersistence: Promise<void> = Promise.resolve()
useAnalysis().onPersisted((result) => {
  void refresh()
  if (result.ok) lastPersistence = ensurePersistence()
})

/** Every list operation still running (open, rename, remove, clear all, boot, refresh). */
const inFlight = new Set<Promise<unknown>>()
function track<A extends unknown[], T>(op: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  return (...args) => {
    const run = op(...args)
    inFlight.add(run)
    run.finally(() => inFlight.delete(run)).catch(() => undefined)
    return run
  }
}

/** Waits for pending saves, list operations and the refreshes they trigger. */
async function settled(): Promise<void> {
  do {
    await Promise.allSettled([...inFlight])
    await useAnalysis().settled()
    await lastRefresh
    await lastPersistence
  } while (inFlight.size > 0)
}

/** Move any legacy localStorage analyses into the database, then list them. Run once on boot. */
async function boot(): Promise<MigrationResult> {
  const result = await migrateLegacyAnalyses(getAppStorage(), getAnalysisDb())
  await refresh()
  return result
}

function markUnreadable(id: string): void {
  state.entries = state.entries.map((e) =>
    e.status === 'ok' && e.summary.id === id ? { status: 'unreadable', id, approxBytes: e.summary.approxBytes } : e,
  )
}

/** Make a saved analysis current. A corrupt one is relisted as unreadable (Delete only). */
async function open(id: string): Promise<LoadResult> {
  const result = await useAnalysis().open(id)
  if (!result.ok) {
    if (result.reason === 'corrupt') markUnreadable(id)
    else await refresh()
  }
  return result
}

async function rename(id: string, name: string): Promise<SaveResult | LoadResult> {
  const store = useAnalysis()
  if (store.current.value?.id === id) {
    store.rename(name)
    return (await store.flush()) ?? { ok: false, reason: 'missing' }
  }
  const db = getAnalysisDb()
  const loaded = await db.loadAnalysis(id)
  if (!loaded.ok) return loaded
  const result = await db.saveAnalysis(renameAnalysis(loaded.analysis, name, analysisNow()))
  await refresh()
  return result
}

async function remove(id: string): Promise<RemoveResult> {
  const store = useAnalysis()
  if (store.current.value?.id === id) store.discard({ forget: true })
  const result = await getAnalysisDb().removeAnalysis(id)
  await refresh()
  return result
}

/**
 * Remove every saved analysis (the whole database) and every
 * local-issue-classifier:* localStorage key (preferences, legacy entries).
 * The localStorage part happens synchronously, before the first await, so a
 * caller can re-read preferences right after calling this.
 */
async function clearAll(): Promise<ClearResult> {
  useAnalysis().discard()
  const keys = clearAppKeys(getAppStorage())
  const database = await getAnalysisDb().clearAll()
  await refresh()
  if (!database.ok) return database
  if (!keys.ok) return keys
  return { ok: true, removed: database.removed + keys.removed }
}

/** The one-line boot notice for a migration, or null when there is nothing to say. */
export function migrationNotice(result: MigrationResult): string | null {
  if (result.failed > 0) {
    const noun = result.failed === 1 ? 'saved analysis' : 'saved analyses'
    return `${result.failed} ${noun} could not be moved to the larger local database yet; they stay in the old storage and the move is retried on the next load.`
  }
  if (result.moved > 0) {
    return `Moved ${result.moved} ${result.moved === 1 ? 'analysis' : 'analyses'} to the larger local database.`
  }
  return null
}

const api = {
  state,
  boot: track(boot),
  refresh: track(refresh),
  open: track(open),
  rename: track(rename),
  remove: track(remove),
  clearAll: track(clearAll),
  checkPersistence: track(checkPersistence),
  settled,
}

export function useAnalyses() {
  return api
}
