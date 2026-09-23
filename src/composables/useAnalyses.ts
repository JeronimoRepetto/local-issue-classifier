// The saved-analyses list behind Home (SPEC.md §2.2): a module singleton over
// the analysis index. It refreshes itself after every save of the current analysis.
// Clearing in-memory secrets on "Clear all local data" (§8) is the caller's job
// (useSecrets, Task 4); this module only touches non-secret storage.
import { reactive } from 'vue'
import { rename as renameAnalysis } from '../domain/analysis'
import {
  clearAll as clearStorage,
  loadAnalysis,
  loadIndex,
  removeAnalysis,
  saveAnalysis,
  usage,
} from '../adapters/storage/analysisStore'
import type { ClearResult, IndexEntry, LoadResult, RemoveResult, SaveResult } from '../adapters/storage/analysisStore'
import { getAppStorage } from '../adapters/storage/appStorage'
import { analysisNow, useAnalysis } from './useAnalysis'

const state = reactive<{ entries: IndexEntry[]; usageBytes: number }>({ entries: [], usageBytes: 0 })

function refresh(): void {
  const storage = getAppStorage()
  state.entries = loadIndex(storage)
  state.usageBytes = usage(storage)
}

useAnalysis().onPersisted(refresh)

function markUnreadable(id: string): void {
  state.entries = state.entries.map((e) =>
    e.status === 'ok' && e.summary.id === id ? { status: 'unreadable', id, approxBytes: e.summary.approxBytes } : e,
  )
}

/** Make a saved analysis current. A corrupt one is relisted as unreadable (Delete only). */
function open(id: string): LoadResult {
  const result = useAnalysis().open(id)
  if (!result.ok) {
    if (result.reason === 'corrupt') markUnreadable(id)
    else refresh()
  }
  return result
}

function rename(id: string, name: string): SaveResult | LoadResult {
  const store = useAnalysis()
  if (store.current.value?.id === id) {
    store.rename(name)
    return store.flush() ?? { ok: false, reason: 'missing' }
  }
  const loaded = loadAnalysis(getAppStorage(), id)
  if (!loaded.ok) return loaded
  const result = saveAnalysis(getAppStorage(), renameAnalysis(loaded.analysis, name, analysisNow()))
  refresh()
  return result
}

function remove(id: string): RemoveResult {
  const store = useAnalysis()
  if (store.current.value?.id === id) store.discard({ forget: true })
  const result = removeAnalysis(getAppStorage(), id)
  refresh()
  return result
}

/** Remove every issue-criticity:* key (preferences and all analyses). */
function clearAll(): ClearResult {
  useAnalysis().discard()
  const result = clearStorage(getAppStorage())
  refresh()
  return result
}

export function useAnalyses() {
  return { state, refresh, open, rename, remove, clearAll }
}
