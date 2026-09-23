// Task 13 — SPEC.md §2.6: export options persisted per analysis (via
// useAnalysis().updateWorking, like useFilters), "Use current table sort",
// a preview built by the pure formatter, and download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import type { Analysis } from '../domain/types'
import { defaultExportOptions, defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

vi.mock('../adapters/download', () => ({ downloadText: vi.fn() }))

type AnalysisModule = typeof import('./useAnalysis')
type ExportModule = typeof import('./useExport')
type DownloadModule = typeof import('../adapters/download')

let analysisMod: AnalysisModule
let exportMod: ExportModule
let downloadMod: DownloadModule
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
  vi.useFakeTimers()
  vi.resetModules()
  storage = new MemoryStorage()
  const storageModule = await import('../adapters/storage/appStorage')
  storageModule.setAppStorage(storage)
  analysisMod = await import('./useAnalysis')
  analysisMod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
  exportMod = await import('./useExport')
  downloadMod = await import('../adapters/download')
  exportMod.configureExport({ clock: () => new Date('2026-09-23T14:05:00') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useExport — reading options', () => {
  it('defaults to defaultExportOptions() when no analysis is current', () => {
    const { options } = exportMod.useExport()
    expect(options.value).toEqual(defaultExportOptions())
  })

  it('reflects the current analysis working state', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { options } = exportMod.useExport()
    expect(options.value).toEqual(defaultExportOptions())
  })
})

describe('useExport — setOptions/setOrder persist into working state', () => {
  it('setOptions merges a patch without dropping other fields', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { options, setOptions } = exportMod.useExport()
    setOptions({ scope: 'all' })
    setOptions({ includeDismissed: true })
    expect(options.value).toMatchObject({ scope: 'all', includeDismissed: true, includeUrls: true })
  })

  it('setOrder replaces the export order only', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { options, setOrder } = exportMod.useExport()
    setOrder([{ key: 'number', direction: 'asc' }])
    expect(options.value.order).toEqual([{ key: 'number', direction: 'asc' }])
    expect(options.value.scope).toBe('filtered') // untouched
  })

  it('persists per analysis and survives a reload', () => {
    const store = analysisMod.useAnalysis()
    store.setCurrent(analysis('a1'))
    exportMod.useExport().setOptions({ scope: 'all', includeDismissed: true })
    vi.advanceTimersByTime(500)

    store.close()
    expect(store.open('a1')).toMatchObject({ ok: true })

    expect(exportMod.useExport().options.value).toMatchObject({ scope: 'all', includeDismissed: true })
  })
})

describe('useExport — "Use current table sort"', () => {
  it('copies the analysis working.tableSort into the export order', () => {
    const store = analysisMod.useAnalysis()
    store.setCurrent(analysis())
    store.updateWorking({
      tableSort: [
        { key: 'number', direction: 'asc' },
        { key: 'relevance', direction: 'desc' },
      ],
    })
    const { options, useCurrentTableSort } = exportMod.useExport()
    useCurrentTableSort()
    expect(options.value.order).toEqual([
      { key: 'number', direction: 'asc' },
      { key: 'relevance', direction: 'desc' },
    ])
  })

  it('copies a fresh array, not a shared reference to working.tableSort', () => {
    const store = analysisMod.useAnalysis()
    store.setCurrent(analysis())
    const { useCurrentTableSort } = exportMod.useExport()
    useCurrentTableSort()
    const tableSortRef = store.current.value!.working.tableSort
    const orderRef = store.current.value!.working.exportOptions.order
    expect(orderRef).not.toBe(tableSortRef)
  })

  it('is a no-op when no analysis is current', () => {
    const { options, useCurrentTableSort } = exportMod.useExport()
    expect(() => useCurrentTableSort()).not.toThrow()
    expect(options.value).toEqual(defaultExportOptions())
  })
})

describe('useExport — previewText and scopeCount', () => {
  it('builds the preview text with the pure formatter and the injected clock', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { previewText } = exportMod.useExport()
    expect(previewText.value).toContain('issue-criticity report')
    expect(previewText.value).toContain('Generated  : 2026-09-23 14:05 (local time)')
  })

  it('is empty when no analysis is current', () => {
    const { previewText, scopeCount } = exportMod.useExport()
    expect(previewText.value).toBe('')
    expect(scopeCount.value).toBe(0)
  })

  it('scopeCount reflects the exportable rows', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { scopeCount } = exportMod.useExport()
    // Three unclassified rows, no classifications yet; includeUnclassified
    // defaults to true, so all three land in the Unclassified section.
    expect(scopeCount.value).toBe(3)
  })
})

describe('useExport — download', () => {
  it('downloads the preview text under the {owner}-{repo}-issues-{stamp}.txt filename', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { download, previewText } = exportMod.useExport()
    download()
    expect(downloadMod.downloadText).toHaveBeenCalledWith(previewText.value, 'acme-widgets-issues-20260923-1405.txt')
  })

  it('does nothing when there is no current analysis', () => {
    exportMod.useExport().download()
    expect(downloadMod.downloadText).not.toHaveBeenCalled()
  })
})
