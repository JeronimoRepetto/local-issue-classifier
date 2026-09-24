// Task 7 — SPEC.md §3.1 / §4.8: current analysis store with debounced and coalesced saves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import type { Analysis } from '../domain/types'
import { STORAGE_KEYS, defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeClassification, fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

type AnalysisModule = typeof import('./useAnalysis')

let mod: AnalysisModule
let storage: MemoryStorage

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

function stored(id = 'a1'): Analysis {
  return JSON.parse(storage.getItem(STORAGE_KEYS.analysis(id)) as string) as Analysis
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  storage = new MemoryStorage()
  const storageModule = await import('../adapters/storage/appStorage')
  storageModule.setAppStorage(storage)
  mod = await import('./useAnalysis')
  mod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAnalysis singleton', () => {
  it('returns the same state on every call', () => {
    expect(mod.useAnalysis().current).toBe(mod.useAnalysis().current)
    expect(mod.useAnalysis().status).toBe(mod.useAnalysis().status)
  })
})

describe('setCurrent and open', () => {
  it('setCurrent makes it current, saves immediately and records the last-opened id', () => {
    const store = mod.useAnalysis()
    store.setCurrent(analysis())
    expect(store.current.value?.id).toBe('a1')
    expect(stored().id).toBe('a1')
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).lastAnalysisId).toBe('a1')
    expect(store.status.save).toBe('saved')
  })

  it('writes only the lastAnalysisId field of existing preferences', () => {
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...defaultPreferences(), maxCommentsPerIssue: 3 }))
    mod.useAnalysis().setCurrent(analysis())
    const prefs = JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string)
    expect(prefs).toMatchObject({ maxCommentsPerIssue: 3, lastAnalysisId: 'a1' })
  })

  it('open loads a saved analysis; a corrupt one reports corrupt and stays closed', () => {
    const store = mod.useAnalysis()
    store.setCurrent(analysis('a1'))
    store.close()
    expect(store.current.value).toBeNull()
    expect(store.open('a1')).toMatchObject({ ok: true })
    expect(store.current.value?.id).toBe('a1')

    storage.setItem(STORAGE_KEYS.analysis('bad'), 'garbage')
    expect(store.open('bad')).toEqual({ ok: false, reason: 'corrupt' })
    expect(store.status.openError).toBe('corrupt')
  })

  it('restoreLastOpened reopens the last analysis', () => {
    mod.useAnalysis().setCurrent(analysis('a1'))
    mod.useAnalysis().discard()
    expect(mod.useAnalysis().restoreLastOpened()).toBe(true)
    expect(mod.useAnalysis().current.value?.id).toBe('a1')
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
  it('open() on the analysis that is already current is a no-op: no reload, no second lastOpened write', () => {
    const write = vi.fn()
    mod.configureAnalysis({ lastOpened: { read: () => null, write } })
    const store = mod.useAnalysis()
    store.setCurrent(analysis('a1'))
    write.mockClear()

    const result = store.open('a1')

    expect(result).toEqual({ ok: true, analysis: store.current.value })
    expect(write).not.toHaveBeenCalled()
  })

  it('accepts an injected last-opened hook instead of the preferences key', () => {
    const write = vi.fn()
    mod.configureAnalysis({ lastOpened: { read: () => null, write } })
    mod.useAnalysis().setCurrent(analysis('a1'))
    expect(write).toHaveBeenCalledWith('a1')
    expect(storage.getItem(STORAGE_KEYS.preferences)).toBeNull()
  })
})

describe('working-state saves are debounced by 500 ms', () => {
  it('saves once, 500 ms after the last change', () => {
    const store = mod.useAnalysis()
    store.setCurrent(analysis())
    const calls = storage.setCalls

    store.dismiss([1])
    vi.advanceTimersByTime(400)
    store.dismiss([2])
    vi.advanceTimersByTime(400)
    expect(storage.setCalls).toBe(calls)
    expect(store.status.save).toBe('pending')

    vi.advanceTimersByTime(100)
    expect(stored().working.dismissed).toEqual([1, 2])
    expect(store.status.save).toBe('saved')
    // One entry write + one index write.
    expect(storage.setCalls).toBe(calls + 2)
  })

  it('updateWorking, restore, rename and removeMissing all go through the store', () => {
    const store = mod.useAnalysis()
    store.setCurrent(analysis())
    store.updateWorking({ showDismissed: true })
    store.dismiss([3])
    store.restore([3])
    store.rename('Triage')
    store.removeMissing()
    vi.advanceTimersByTime(500)
    expect(stored()).toMatchObject({ name: 'Triage', working: { showDismissed: true, dismissed: [] } })
    expect(stored().updatedAt).toBe('2026-03-05T00:00:00Z')
  })
})

describe('classification saves are coalesced to at most one per second', () => {
  it('coalesces a burst of results and flush() writes the final state', () => {
    const store = mod.useAnalysis()
    store.setCurrent(analysis())
    const calls = storage.setCalls

    store.applyResult(1, { ok: true, classification: fakeClassification() })
    vi.advanceTimersByTime(300)
    store.applyResult(2, { ok: true, classification: fakeClassification() })
    vi.advanceTimersByTime(300)
    expect(storage.setCalls).toBe(calls)
    vi.advanceTimersByTime(400)
    expect(storage.setCalls).toBe(calls + 2)
    expect(stored().rows.filter((r) => r.status === 'done')).toHaveLength(2)

    store.applyResult(3, { ok: false, error: 'Timeout' })
    store.flush()
    expect(stored().rows[2]).toMatchObject({ status: 'error', error: 'Timeout' })
    vi.advanceTimersByTime(2000)
    expect(storage.setCalls).toBe(calls + 4) // the flushed timer never fires again
  })

  it('uses an injected scheduler', () => {
    const pending: (() => void)[] = []
    mod.configureAnalysis({
      scheduler: {
        setTimeout: (fn) => pending.push(fn),
        clearTimeout: () => {},
      },
    })
    const store = mod.useAnalysis()
    store.setCurrent(analysis())
    store.applyResult(1, { ok: true, classification: fakeClassification() })
    expect(pending).toHaveLength(1)
    pending[0]()
    expect(stored().rows[0].status).toBe('done')
  })
})

describe('save failures', () => {
  it('keeps the analysis in memory, reports quota, and retrySave recovers', () => {
    const store = mod.useAnalysis()
    storage.quotaBytes = 10
    store.setCurrent(analysis())
    expect(store.current.value?.id).toBe('a1')
    expect(store.status).toMatchObject({ save: 'failed', failure: 'quota' })

    storage.quotaBytes = Infinity
    expect(store.retrySave()).toMatchObject({ ok: true })
    expect(store.status).toMatchObject({ save: 'saved', failure: null })
    expect(stored().id).toBe('a1')
  })

  it('notifies persisted listeners with the save result', () => {
    const listener = vi.fn()
    const off = mod.useAnalysis().onPersisted(listener)
    mod.useAnalysis().setCurrent(analysis())
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
    off()
    mod.useAnalysis().retrySave()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('close and discard', () => {
  it('close flushes a pending save before clearing', () => {
    const store = mod.useAnalysis()
    store.setCurrent(analysis())
    store.dismiss([1])
    store.close()
    expect(store.current.value).toBeNull()
    expect(stored().working.dismissed).toEqual([1])
  })

  it('discard drops pending saves and can forget the last-opened id', () => {
    const store = mod.useAnalysis()
    store.setCurrent(analysis())
    store.dismiss([1])
    store.discard({ forget: true })
    vi.advanceTimersByTime(5000)
    expect(stored().working.dismissed).toEqual([])
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).lastAnalysisId).toBeNull()
  })
})
