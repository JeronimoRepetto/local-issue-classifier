// Task 12 — filter/sort/search state, persisted into the current
// analysis working state through useAnalysis().updateWorking, restored on reopen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import type { Analysis } from '../domain/types'
import { defaultFilter, defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

type AnalysisModule = typeof import('./useAnalysis')
type FiltersModule = typeof import('./useFilters')

let analysisMod: AnalysisModule
let filtersMod: FiltersModule
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

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }) // the fake IndexedDB needs a real setImmediate
  vi.resetModules()
  storage = new MemoryStorage()
  const storageModule = await import('../adapters/storage/appStorage')
  storageModule.setAppStorage(storage)
  analysisMod = await import('./useAnalysis')
  analysisMod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
  filtersMod = await import('./useFilters')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useFilters — reading the current filter and sort', () => {
  it('defaults to defaultFilter() and no sort when no analysis is current', () => {
    const { filter, sort } = filtersMod.useFilters()
    expect(filter.value).toEqual(defaultFilter())
    expect(sort.value).toBeNull()
  })

  it('reflects the current analysis working state', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { filter, sort } = filtersMod.useFilters()
    expect(filter.value).toEqual(defaultFilter())
    expect(sort.value).toEqual({ key: 'criticality', direction: 'desc' })
  })
})

describe('useFilters — setFilter merges a patch and resetFilters clears it', () => {
  it('setFilter merges into the existing filter without dropping other fields', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { filter, setFilter } = filtersMod.useFilters()
    setFilter({ criticality: ['high'] })
    setFilter({ labels: ['bug'] })
    expect(filter.value).toMatchObject({ criticality: ['high'], labels: ['bug'] })
  })

  it('setSearch is a convenience wrapper that sets filter.text', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { filter, setSearch } = filtersMod.useFilters()
    setSearch('crash')
    expect(filter.value.text).toBe('crash')
  })

  it('resetFilters restores defaultFilter()', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { filter, setFilter, resetFilters } = filtersMod.useFilters()
    setFilter({ criticality: ['high'], text: 'crash' })
    resetFilters()
    expect(filter.value).toEqual(defaultFilter())
  })
})

describe('useFilters — setSort toggles direction on the same key, replaces on a new one', () => {
  it('a new key becomes the sole sort key', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { sort, setSort } = filtersMod.useFilters()
    setSort('relevance')
    expect(sort.value).toEqual({ key: 'relevance', direction: 'desc' })
  })

  it('clicking the same key again reverses direction', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { sort, setSort } = filtersMod.useFilters()
    setSort('relevance')
    setSort('relevance')
    expect(sort.value).toEqual({ key: 'relevance', direction: 'asc' })
    setSort('relevance')
    expect(sort.value).toEqual({ key: 'relevance', direction: 'desc' })
  })

  it('an explicit direction is honored as-is', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { sort, setSort } = filtersMod.useFilters()
    setSort('number', 'asc')
    expect(sort.value).toEqual({ key: 'number', direction: 'asc' })
  })
})

describe('useFilters — tableSort exposes the full multi-key order (Task 13)', () => {
  it('defaults to an empty array when no analysis is current', () => {
    const { tableSort } = filtersMod.useFilters()
    expect(tableSort.value).toEqual([])
  })

  it('reflects the analysis working state, and sort is its first rule', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { tableSort, sort } = filtersMod.useFilters()
    // defaultTableSort() (default order): Criticality desc → Relevance desc → Effort asc.
    expect(tableSort.value).toEqual([
      { key: 'criticality', direction: 'desc' },
      { key: 'relevance', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
    expect(sort.value).toEqual(tableSort.value[0])
  })

  it('setTableSort replaces the full order', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { tableSort, setTableSort } = filtersMod.useFilters()
    setTableSort([
      { key: 'relevance', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
    expect(tableSort.value).toEqual([
      { key: 'relevance', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
  })

  it('addSortKey appends a new key as the next sort key (shift-click)', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { tableSort, addSortKey } = filtersMod.useFilters()
    addSortKey('commentCount')
    expect(tableSort.value).toEqual([
      { key: 'criticality', direction: 'desc' },
      { key: 'relevance', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
      { key: 'commentCount', direction: 'desc' },
    ])
  })

  it('addSortKey is a no-op when the key is already part of the order', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { tableSort, addSortKey } = filtersMod.useFilters()
    addSortKey('criticality')
    expect(tableSort.value).toEqual([
      { key: 'criticality', direction: 'desc' },
      { key: 'relevance', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
  })

  it('setTableSort persists per analysis and survives a reload', async () => {
    const store = analysisMod.useAnalysis()
    store.setCurrent(analysis('a1'))
    filtersMod.useFilters().setTableSort([
      { key: 'relevance', direction: 'desc' },
      { key: 'number', direction: 'asc' },
    ])
    vi.advanceTimersByTime(500)

    store.close()
    await store.settled()
    expect(await store.open('a1')).toMatchObject({ ok: true })

    expect(filtersMod.useFilters().tableSort.value).toEqual([
      { key: 'relevance', direction: 'desc' },
      { key: 'number', direction: 'asc' },
    ])
  })
})

describe('useFilters — filter and sort persist per analysis and survive a reload', () => {
  it('is restored after the analysis is closed and reopened', async () => {
    const store = analysisMod.useAnalysis()
    store.setCurrent(analysis('a1'))
    const { setFilter, setSort, setSearch } = filtersMod.useFilters()
    setFilter({ criticality: ['high'] })
    setSort('relevance', 'asc')
    setSearch('crash')
    vi.advanceTimersByTime(500) // working-state debounce (Task 7)

    store.close()
    await store.settled()
    expect(await store.open('a1')).toMatchObject({ ok: true })

    const { filter, sort } = filtersMod.useFilters()
    expect(filter.value).toMatchObject({ criticality: ['high'], text: 'crash' })
    expect(sort.value).toEqual({ key: 'relevance', direction: 'asc' })
  })

  it('is restored after a fresh module load, simulating a page reload', async () => {
    const store = analysisMod.useAnalysis()
    store.setCurrent(analysis('a1'))
    filtersMod.useFilters().setFilter({ labels: ['bug'] })
    vi.advanceTimersByTime(500)
    await analysisMod.useAnalysis().settled()

    vi.resetModules()
    const reloadedStorageModule = await import('../adapters/storage/appStorage')
    reloadedStorageModule.setAppStorage(storage) // simulates the same browser localStorage after reload
    const reloadedAnalysis: AnalysisModule = await import('./useAnalysis')
    const reloadedFilters: FiltersModule = await import('./useFilters')
    await reloadedAnalysis.useAnalysis().open('a1')

    expect(reloadedFilters.useFilters().filter.value).toMatchObject({ labels: ['bug'] })
  })
})
