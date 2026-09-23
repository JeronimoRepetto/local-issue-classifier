// Task 7 — SPEC.md §2.2 / §4.8: the saved-analyses list behind Home.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import type { Analysis } from '../domain/types'
import { STORAGE_KEYS, defaultPreferences, defaultProjectContext } from '../domain/types'
import { saveAnalysis } from '../adapters/storage/analysisStore'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

let analyses: typeof import('./useAnalyses')
let current: typeof import('./useAnalysis')
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

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
  current = await import('./useAnalysis')
  analyses = await import('./useAnalyses')
  current.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
})

describe('useAnalyses', () => {
  it('is a singleton and refresh loads the index newest first, with usage', () => {
    expect(analyses.useAnalyses().state).toBe(analyses.useAnalyses().state)
    saveAnalysis(storage, analysis('old', '2026-01-01T00:00:00Z'))
    saveAnalysis(storage, analysis('new', '2026-02-01T00:00:00Z'))
    analyses.useAnalyses().refresh()
    expect(ids()).toEqual(['new', 'old'])
    expect(analyses.useAnalyses().state.usageBytes).toBeGreaterThan(0)
  })

  it('refreshes automatically after the current analysis is saved', () => {
    analyses.useAnalyses().refresh()
    current.useAnalysis().setCurrent(analysis('a1'))
    expect(ids()).toEqual(['a1'])
  })

  it('open makes it current; a corrupt entry is shown as unreadable', () => {
    saveAnalysis(storage, analysis('a1'))
    saveAnalysis(storage, analysis('a2'))
    storage.setItem(STORAGE_KEYS.analysis('a2'), 'garbage')
    const list = analyses.useAnalyses()
    list.refresh()
    expect(list.open('a1')).toMatchObject({ ok: true })
    expect(current.useAnalysis().current.value?.id).toBe('a1')
    expect(list.open('a2')).toEqual({ ok: false, reason: 'corrupt' })
    expect(list.state.entries).toContainEqual({ status: 'unreadable', id: 'a2', approxBytes: expect.any(Number) })
  })

  it('rename works for the current analysis and for a closed one', () => {
    saveAnalysis(storage, analysis('closed'))
    current.useAnalysis().setCurrent(analysis('open'))
    const list = analyses.useAnalyses()
    list.rename('open', 'Current one')
    list.rename('closed', 'Closed one')
    expect(current.useAnalysis().current.value?.name).toBe('Current one')
    const names = list.state.entries.map((e) => (e.status === 'ok' ? e.summary.name : ''))
    expect(names.sort()).toEqual(['Closed one', 'Current one'])
  })

  it('remove deletes the entry and closes it when current', () => {
    current.useAnalysis().setCurrent(analysis('a1'))
    saveAnalysis(storage, analysis('a2'))
    const list = analyses.useAnalyses()
    list.remove('a1')
    expect(current.useAnalysis().current.value).toBeNull()
    expect(storage.getItem(STORAGE_KEYS.analysis('a1'))).toBeNull()
    expect(ids()).toEqual(['a2'])
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).lastAnalysisId).toBeNull()
  })

  it('clearAll removes only app keys and never resurrects the current analysis', () => {
    current.useAnalysis().setCurrent(analysis('a1'))
    current.useAnalysis().dismiss([1]) // pending debounced save
    storage.setItem('other-app:x', 'keep')
    const list = analyses.useAnalyses()
    list.clearAll()
    vi.advanceTimersByTime(5000)
    expect(storage.keys()).toEqual(['other-app:x'])
    expect(current.useAnalysis().current.value).toBeNull()
    expect(list.state.entries).toEqual([])
    expect(list.state.usageBytes).toBe(0)
  })
})
