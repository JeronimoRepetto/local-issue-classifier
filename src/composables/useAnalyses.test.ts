// Task 7 — SPEC.md §2.2 / §4.8: the saved-analyses list behind Home, over the
// async IndexedDB store (FB IndexedDB lane; tests/setup/indexedDb.ts installs a
// fresh fake database per test).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import type { Analysis } from '../domain/types'
import { STORAGE_KEYS, defaultPreferences, defaultProjectContext } from '../domain/types'
import { saveAnalysis as saveLegacy } from '../adapters/storage/analysisStore'
import { ANALYSIS_STORES } from '../adapters/storage/analysisDb'
import type { AnalysisDb } from '../adapters/storage/analysisDb'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'
import { globalFactory, rawDump, rawPut } from '../../tests/fakes/idb'

let analyses: typeof import('./useAnalyses')
let current: typeof import('./useAnalysis')
let dbModule: typeof import('../adapters/storage/analysisDb')
let db: AnalysisDb
let storage: MemoryStorage

function analysis(id: string, updatedAt = '2026-03-01T10:00:00Z'): Analysis {
  return {
    ...createAnalysis({
      id,
      repo: fakeRepo(),
      stateFilter: 'open',
      now: '2026-03-01T10:00:00Z',
      prefs: defaultPreferences(),
      projectContext: defaultProjectContext('acme/widgets'),
      issues: [fakeIssue(1)],
      commentsFetched: false,
    }),
    updatedAt,
  }
}

function ids(): string[] {
  return analyses.useAnalyses().state.entries.map((e) => (e.status === 'ok' ? e.summary.id : `!${e.id}`))
}

const factory = globalFactory
const settled = () => analyses.useAnalyses().settled()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
  dbModule = await import('../adapters/storage/analysisDb')
  dbModule.setStorageManager(null)
  db = dbModule.getAnalysisDb()
  current = await import('./useAnalysis')
  analyses = await import('./useAnalyses')
  current.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAnalyses', () => {
  it('is a singleton and refresh loads the index newest first, with usage', async () => {
    expect(analyses.useAnalyses().state).toBe(analyses.useAnalyses().state)
    await db.saveAnalysis(analysis('old', '2026-01-01T00:00:00Z'))
    await db.saveAnalysis(analysis('new', '2026-02-01T00:00:00Z'))
    await analyses.useAnalyses().refresh()
    expect(ids()).toEqual(['new', 'old'])
    expect(analyses.useAnalyses().state.usageBytes).toBeGreaterThan(0)
    expect(analyses.useAnalyses().state.quotaBytes).toBeNull()
  })

  it('reports the browser quota from navigator.storage.estimate() when available', async () => {
    vi.resetModules()
    ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
    ;(await import('../adapters/storage/analysisDb')).setStorageManager({
      estimate: async () => ({ usage: 1234, quota: 99_000_000 }),
    })
    const list = (await import('./useAnalyses')).useAnalyses()
    await list.refresh()
    expect(list.state).toMatchObject({ usageBytes: 1234, quotaBytes: 99_000_000 })
  })

  it('refreshes automatically after the current analysis is saved', async () => {
    await analyses.useAnalyses().refresh()
    current.useAnalysis().setCurrent(analysis('a1'))
    await settled()
    expect(ids()).toEqual(['a1'])
  })

  it('open makes it current; a corrupt entry is shown as unreadable', async () => {
    await db.saveAnalysis(analysis('a1'))
    await db.saveAnalysis(analysis('a2'))
    await rawPut(factory(), ANALYSIS_STORES.analyses, 'a2', 'garbage')
    const list = analyses.useAnalyses()
    await list.refresh()
    expect(await list.open('a1')).toMatchObject({ ok: true })
    expect(current.useAnalysis().current.value?.id).toBe('a1')
    expect(await list.open('a2')).toEqual({ ok: false, reason: 'corrupt' })
    expect(list.state.entries).toContainEqual({ status: 'unreadable', id: 'a2', approxBytes: expect.any(Number) })
  })

  it('rename works for the current analysis and for a closed one', async () => {
    await db.saveAnalysis(analysis('closed'))
    await current.useAnalysis().setCurrent(analysis('open'))
    const list = analyses.useAnalyses()
    await list.rename('open', 'Current one')
    await list.rename('closed', 'Closed one')
    await settled()
    expect(current.useAnalysis().current.value?.name).toBe('Current one')
    const names = list.state.entries.map((e) => (e.status === 'ok' ? e.summary.name : ''))
    expect(names.sort()).toEqual(['Closed one', 'Current one'])
  })

  it('remove deletes the entry and closes it when current', async () => {
    await current.useAnalysis().setCurrent(analysis('a1'))
    await db.saveAnalysis(analysis('a2'))
    const list = analyses.useAnalyses()
    expect(await list.remove('a1')).toEqual({ ok: true })
    expect(current.useAnalysis().current.value).toBeNull()
    expect(await db.loadAnalysis('a1')).toEqual({ ok: false, reason: 'missing' })
    expect(ids()).toEqual(['a2'])
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).lastAnalysisId).toBeNull()
  })

  it('clearAll empties the database and the app keys, and never resurrects the current analysis', async () => {
    await current.useAnalysis().setCurrent(analysis('a1'))
    current.useAnalysis().dismiss([1]) // pending debounced save
    storage.setItem('other-app:x', 'keep')
    const list = analyses.useAnalyses()
    const clearing = list.clearAll()
    // Preferences (and every other app key) are gone synchronously, before the database.
    expect(storage.keys()).toEqual(['other-app:x'])
    expect(await clearing).toMatchObject({ ok: true })
    vi.advanceTimersByTime(5000)
    await settled()
    expect(storage.keys()).toEqual(['other-app:x'])
    expect(await rawDump(factory())).toEqual([])
    expect(current.useAnalysis().current.value).toBeNull()
    expect(list.state.entries).toEqual([])
    expect(list.state.usageBytes).toBe(0)
  })

  it('clearAll reports a database failure', async () => {
    vi.spyOn(db, 'clearAll').mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
    expect(await analyses.useAnalyses().clearAll()).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('boot: one-time migration from localStorage', () => {
  it('moves legacy analyses into the database, lists them, and returns the notice', async () => {
    saveLegacy(storage, analysis('a1', '2026-01-01T00:00:00Z'))
    saveLegacy(storage, analysis('a2', '2026-02-01T00:00:00Z'))
    storage.setItem(STORAGE_KEYS.analysis('bad'), 'garbage')

    const list = analyses.useAnalyses()
    const result = await list.boot()

    expect(result).toEqual({ moved: 3, unreadable: 1, failed: 0 })
    expect(analyses.migrationNotice(result)).toBe('Moved 3 analyses to the larger local database.')
    expect(ids()).toEqual(['a2', 'a1', '!bad'])
    expect(storage.keys()).toEqual([])

    // Idempotent: a second boot moves nothing and shows no notice.
    const again = await list.boot()
    expect(again).toEqual({ moved: 0, unreadable: 0, failed: 0 })
    expect(analyses.migrationNotice(again)).toBeNull()
  })

  it('words the notice for one analysis, and for entries that could not be moved', () => {
    expect(analyses.migrationNotice({ moved: 1, unreadable: 0, failed: 0 })).toBe(
      'Moved 1 analysis to the larger local database.',
    )
    expect(analyses.migrationNotice({ moved: 0, unreadable: 0, failed: 2 })).toBe(
      '2 saved analyses could not be moved to the larger local database yet; they stay in the old storage and the move is retried on the next load.',
    )
  })
})

describe('persistent storage (navigator.storage.persist)', () => {
  it('asks once, on the first successful save, and exposes the result', async () => {
    vi.resetModules()
    ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
    const persist = vi.fn(async () => true)
    ;(await import('../adapters/storage/analysisDb')).setStorageManager({ persisted: async () => false, persist })
    const store = (await import('./useAnalysis')).useAnalysis()
    const list = (await import('./useAnalyses')).useAnalyses()
    expect(list.state.persistence).toBe('unknown')

    await store.setCurrent(analysis('a1'))
    await list.settled()
    await store.setCurrent(analysis('a2'))
    await list.settled()

    expect(persist).toHaveBeenCalledTimes(1)
    expect(list.state.persistence).toBe('persisted')
  })

  it('checkPersistence reads the state without asking', async () => {
    vi.resetModules()
    ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
    const persist = vi.fn(async () => true)
    ;(await import('../adapters/storage/analysisDb')).setStorageManager({ persisted: async () => false, persist })
    const list = (await import('./useAnalyses')).useAnalyses()
    await list.checkPersistence()
    expect(list.state.persistence).toBe('best-effort')
    expect(persist).not.toHaveBeenCalled()
  })
})
