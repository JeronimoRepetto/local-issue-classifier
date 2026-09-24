// Task 7 — current analysis store with debounced and coalesced saves,
// now over the async IndexedDB store (FB IndexedDB lane; the fake database is
// installed per test by tests/setup/indexedDb.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import type { Analysis } from '../domain/types'
import { STORAGE_KEYS, defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeClassification, fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'
import { ANALYSIS_STORES } from '../adapters/storage/analysisDb'
import type { AnalysisDb } from '../adapters/storage/analysisDb'
import { globalFactory, rawPut } from '../../tests/fakes/idb'

type AnalysisModule = typeof import('./useAnalysis')

let mod: AnalysisModule
let storage: MemoryStorage
let db: AnalysisDb

function analysis(id = 'a1'): Analysis {
  return createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [fakeIssue(1), fakeIssue(2), fakeIssue(3)],
    commentsFetched: false,
  })
}

async function stored(id = 'a1'): Promise<Analysis> {
  const result = await db.loadAnalysis(id)
  if (!result.ok) throw new Error(`no stored analysis ${id}: ${result.reason}`)
  return result.analysis
}

const settled = () => mod.useAnalysis().settled()

beforeEach(async () => {
  // Only the save timers are faked: the fake database schedules its own work with setImmediate.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.resetModules()
  storage = new MemoryStorage()
  const storageModule = await import('../adapters/storage/appStorage')
  storageModule.setAppStorage(storage)
  db = (await import('../adapters/storage/analysisDb')).getAnalysisDb()
  mod = await import('./useAnalysis')
  mod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useAnalysis singleton', () => {
  it('returns the same state on every call', () => {
    expect(mod.useAnalysis().current).toBe(mod.useAnalysis().current)
    expect(mod.useAnalysis().status).toBe(mod.useAnalysis().status)
  })
})

describe('setCurrent and open', () => {
  it('setCurrent makes it current at once, saves immediately and records the last-opened id', async () => {
    const store = mod.useAnalysis()
    const saving = store.setCurrent(analysis())
    expect(store.current.value?.id).toBe('a1')
    expect(store.status.save).toBe('pending')
    expect(await saving).toMatchObject({ ok: true })
    expect((await stored()).id).toBe('a1')
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).lastAnalysisId).toBe('a1')
    expect(store.status.save).toBe('saved')
  })

  it('never writes the analysis to localStorage', async () => {
    await mod.useAnalysis().setCurrent(analysis())
    expect(storage.keys()).toEqual([STORAGE_KEYS.preferences])
  })

  it('writes only the lastAnalysisId field of existing preferences', async () => {
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...defaultPreferences(), maxCommentsPerIssue: 3 }))
    await mod.useAnalysis().setCurrent(analysis())
    const prefs = JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string)
    expect(prefs).toMatchObject({ maxCommentsPerIssue: 3, lastAnalysisId: 'a1' })
  })

  it('open loads a saved analysis; a corrupt one reports corrupt and stays closed', async () => {
    const store = mod.useAnalysis()
    await store.setCurrent(analysis('a1'))
    store.close()
    expect(store.current.value).toBeNull()
    expect(await store.open('a1')).toMatchObject({ ok: true })
    expect(store.current.value?.id).toBe('a1')

    await rawPut(globalFactory(), ANALYSIS_STORES.analyses, 'bad', 'garbage')
    expect(await store.open('bad')).toEqual({ ok: false, reason: 'corrupt' })
    expect(store.status.openError).toBe('corrupt')
    expect(store.current.value?.id).toBe('a1')
  })

  it('restoreLastOpened reopens the last analysis', async () => {
    await mod.useAnalysis().setCurrent(analysis('a1'))
    mod.useAnalysis().discard()
    expect(await mod.useAnalysis().restoreLastOpened()).toBe(true)
    expect(mod.useAnalysis().current.value?.id).toBe('a1')
  })

  it('restoreLastOpened survives a reload (fresh modules, same database)', async () => {
    await mod.useAnalysis().setCurrent(analysis('a1'))
    vi.resetModules()
    ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
    const reloaded = (await import('./useAnalysis')).useAnalysis()
    expect(reloaded.current.value).toBeNull()
    expect(await reloaded.restoreLastOpened()).toBe(true)
    expect(reloaded.current.value?.id).toBe('a1')
  })

  it('restoreLastOpened is false when nothing was opened or the analysis is gone', async () => {
    expect(await mod.useAnalysis().restoreLastOpened()).toBe(false)
    mod.configureAnalysis({ lastOpened: { read: () => 'gone', write: () => {} } })
    expect(await mod.useAnalysis().restoreLastOpened()).toBe(false)
    expect(mod.useAnalysis().current.value).toBeNull()
  })

  // Regression (found via odd/tasks/home-provider-onboarding.md): a caller
  // that re-opens the analysis setCurrent() just made current (e.g.
  // RepoLoaderContainer's watcher, right after a new analysis finishes
  // loading) used to reload from storage and call lastOpened.write() a
  // second time. That second write is harmless with the default
  // preferencesKeyHook (a targeted read-modify-write of one field), but once
  // usePreferences' reactive lastOpened hook is wired in (App.vue, and Home's
  // ProviderOnboardingCard), the second persist() writes the whole in-memory
  // Preferences snapshot and can clobber a concurrent direct-storage writer
  // (useRepo's onboarding-checklist flag). open() now short-circuits instead.
  it('open() on the analysis that is already current is a no-op: no reload, no second lastOpened write', async () => {
    const write = vi.fn()
    mod.configureAnalysis({ lastOpened: { read: () => null, write } })
    const store = mod.useAnalysis()
    await store.setCurrent(analysis('a1'))
    write.mockClear()
    const load = vi.spyOn(db, 'loadAnalysis')

    const result = await store.open('a1')

    expect(result).toEqual({ ok: true, analysis: store.current.value })
    expect(write).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })

  it('an open() overtaken by setCurrent() does not replace the newer current analysis', async () => {
    const store = mod.useAnalysis()
    await store.setCurrent(analysis('a1'))
    store.close()
    const opening = store.open('a1')
    store.setCurrent(analysis('a2'))
    await opening
    expect(store.current.value?.id).toBe('a2')
  })

  it('accepts an injected last-opened hook instead of the preferences key', async () => {
    const write = vi.fn()
    mod.configureAnalysis({ lastOpened: { read: () => null, write } })
    await mod.useAnalysis().setCurrent(analysis('a1'))
    expect(write).toHaveBeenCalledWith('a1')
    expect(storage.getItem(STORAGE_KEYS.preferences)).toBeNull()
  })
})

describe('working-state saves are debounced by 500 ms', () => {
  it('saves once, 500 ms after the last change', async () => {
    const store = mod.useAnalysis()
    await store.setCurrent(analysis())
    const save = vi.spyOn(db, 'saveAnalysis')

    store.dismiss([1])
    vi.advanceTimersByTime(400)
    store.dismiss([2])
    vi.advanceTimersByTime(400)
    expect(save).not.toHaveBeenCalled()
    expect(store.status.save).toBe('pending')

    vi.advanceTimersByTime(100)
    await settled()
    expect((await stored()).working.dismissed).toEqual([1, 2])
    expect(store.status.save).toBe('saved')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('updateWorking, restore, rename and removeMissing all go through the store', async () => {
    const store = mod.useAnalysis()
    await store.setCurrent(analysis())
    store.updateWorking({ showDismissed: true })
    store.dismiss([3])
    store.restore([3])
    store.rename('Triage')
    store.removeMissing()
    vi.advanceTimersByTime(500)
    await settled()
    expect(await stored()).toMatchObject({ name: 'Triage', working: { showDismissed: true, dismissed: [] } })
    expect((await stored()).updatedAt).toBe('2026-03-05T00:00:00Z')
  })

  it('a change made while a save is in flight stays pending and is saved by the next one', async () => {
    const store = mod.useAnalysis()
    await store.setCurrent(analysis())
    store.dismiss([1])
    vi.advanceTimersByTime(500) // save #1 starts with dismissed [1]
    store.dismiss([2]) // lands while #1 is in flight
    await settled()
    expect(store.status.save).toBe('pending')
    vi.advanceTimersByTime(500)
    await settled()
    expect(store.status.save).toBe('saved')
    expect((await stored()).working.dismissed).toEqual([1, 2])
  })
})

describe('classification saves are coalesced to at most one per second', () => {
  it('coalesces a burst of results and flush() writes the final state', async () => {
    const store = mod.useAnalysis()
    await store.setCurrent(analysis())
    const save = vi.spyOn(db, 'saveAnalysis')

    store.applyResult(1, { ok: true, classification: fakeClassification() })
    vi.advanceTimersByTime(300)
    store.applyResult(2, { ok: true, classification: fakeClassification() })
    vi.advanceTimersByTime(300)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    await settled()
    expect(save).toHaveBeenCalledTimes(1)
    expect((await stored()).rows.filter((r) => r.status === 'done')).toHaveLength(2)

    store.applyResult(3, { ok: false, error: 'Timeout' })
    await store.flush()
    expect((await stored()).rows[2]).toMatchObject({ status: 'error', error: 'Timeout' })
    vi.advanceTimersByTime(2000)
    await settled()
    expect(save).toHaveBeenCalledTimes(2) // the flushed timer never fires again
  })

  it('uses an injected scheduler', async () => {
    const pending: (() => void)[] = []
    mod.configureAnalysis({
      scheduler: {
        setTimeout: (fn) => pending.push(fn),
        clearTimeout: () => {},
      },
    })
    const store = mod.useAnalysis()
    await store.setCurrent(analysis())
    store.applyResult(1, { ok: true, classification: fakeClassification() })
    expect(pending).toHaveLength(1)
    pending[0]()
    await settled()
    expect((await stored()).rows[0].status).toBe('done')
  })
})

describe('save failures', () => {
  it('keeps the analysis in memory, reports quota, and retrySave recovers', async () => {
    const store = mod.useAnalysis()
    vi.spyOn(db, 'saveAnalysis').mockResolvedValueOnce({ ok: false, reason: 'quota' })
    await store.setCurrent(analysis())
    expect(store.current.value?.id).toBe('a1')
    expect(store.status).toMatchObject({ save: 'failed', failure: 'quota' })

    expect(await store.retrySave()).toMatchObject({ ok: true })
    expect(store.status).toMatchObject({ save: 'saved', failure: null })
    expect((await stored()).id).toBe('a1')
  })

  it('reports unavailable when the database cannot be opened', async () => {
    vi.spyOn(db, 'saveAnalysis').mockResolvedValue({ ok: false, reason: 'unavailable' })
    const store = mod.useAnalysis()
    await store.setCurrent(analysis())
    expect(store.status).toMatchObject({ save: 'failed', failure: 'unavailable' })
    await store.flush()
    expect(store.status.failure).toBe('unavailable')
  })

  it('notifies persisted listeners with the save result', async () => {
    const listener = vi.fn()
    const off = mod.useAnalysis().onPersisted(listener)
    await mod.useAnalysis().setCurrent(analysis())
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
    off()
    await mod.useAnalysis().retrySave()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('close and discard', () => {
  it('close flushes a pending save before clearing', async () => {
    const store = mod.useAnalysis()
    await store.setCurrent(analysis())
    store.dismiss([1])
    store.close()
    expect(store.current.value).toBeNull()
    await settled()
    expect((await stored()).working.dismissed).toEqual([1])
  })

  it('discard drops pending saves and can forget the last-opened id', async () => {
    const store = mod.useAnalysis()
    await store.setCurrent(analysis())
    store.dismiss([1])
    store.discard({ forget: true })
    vi.advanceTimersByTime(5000)
    await settled()
    expect((await stored()).working.dismissed).toEqual([])
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).lastAnalysisId).toBeNull()
  })
})
