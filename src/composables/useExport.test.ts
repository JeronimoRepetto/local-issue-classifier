// Task 13 — export options persisted per analysis (via
// useAnalysis().updateWorking, like useFilters), "Use current table sort",
// a preview built by the pure formatter, and download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis, visibleRows } from '../domain/analysis'
import { filterRows } from '../domain/filter'
import { sortRowsBy } from '../domain/sort'
import type { Analysis, ExportOptions } from '../domain/types'
import { defaultExportOptions, defaultFilter, defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeClassification, fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }) // the fake IndexedDB needs a real setImmediate
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

  it('defaults orderMode to "table" (FB export: export must match the table)', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { options } = exportMod.useExport()
    expect(options.value.orderMode).toBe('table')
  })

  it('tolerantly resolves orderMode to "table" for an older saved analysis missing the field', () => {
    const a = analysis()
    const stale: Partial<ExportOptions> = { ...a.working.exportOptions }
    delete stale.orderMode
    analysisMod.useAnalysis().setCurrent({
      ...a,
      working: { ...a.working, exportOptions: stale as ExportOptions },
    })
    const { options } = exportMod.useExport()
    expect(options.value.orderMode).toBe('table')
  })
})

describe('useExport — scopeCount mirrors the table in orderMode "table"', () => {
  it('equals visibleRows().length for the current analysis, not a separately-filtered count', () => {
    const a = analysis()
    a.rows[0].status = 'done'
    a.rows[0].classification = fakeClassification()
    analysisMod.useAnalysis().setCurrent(a)
    analysisMod.useAnalysis().updateWorking({ filter: { ...defaultFilter(), statuses: ['done'] } })

    const { scopeCount } = exportMod.useExport()
    const current = analysisMod.useAnalysis().current.value!
    const expected = visibleRows(current, { filter: filterRows, sort: sortRowsBy }).length
    expect(expected).toBe(1) // only rows[0] has status 'done'
    expect(scopeCount.value).toBe(expected)
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

  it('persists per analysis and survives a reload', async () => {
    const store = analysisMod.useAnalysis()
    store.setCurrent(analysis('a1'))
    exportMod.useExport().setOptions({ scope: 'all', includeDismissed: true })
    vi.advanceTimersByTime(500)

    store.close()
    await store.settled()
    expect(await store.open('a1')).toMatchObject({ ok: true })

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
    expect(previewText.value).toContain('local-issue-classifier report')
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

describe('useExport — format: markdown/html previews and downloads (see docs/export-format.md)', () => {
  it('previewText renders Markdown (H1 + metadata list) when format is "markdown"', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { options, setOptions, previewText } = exportMod.useExport()
    setOptions({ format: 'markdown' })
    expect(options.value.format).toBe('markdown')
    expect(previewText.value.startsWith('# local-issue-classifier report')).toBe(true)
    expect(previewText.value).toContain('- **Repository:**')
  })

  it('previewText renders a self-contained HTML document when format is "html"', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { setOptions, previewText } = exportMod.useExport()
    setOptions({ format: 'html' })
    expect(previewText.value.startsWith('<!doctype html>')).toBe(true)
    expect(previewText.value).toContain('<style>')
    expect(previewText.value).not.toContain('<script')
  })

  it('download() uses a .md filename and text/markdown MIME for format "markdown"', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { setOptions, download, previewText } = exportMod.useExport()
    setOptions({ format: 'markdown' })
    download()
    expect(downloadMod.downloadText).toHaveBeenCalledWith(
      previewText.value,
      'acme-widgets-issues-20260923-1405.md',
      'text/markdown;charset=utf-8',
    )
  })

  it('download() uses a .html filename and text/html MIME for format "html"', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { setOptions, download, previewText } = exportMod.useExport()
    setOptions({ format: 'html' })
    download()
    expect(downloadMod.downloadText).toHaveBeenCalledWith(
      previewText.value,
      'acme-widgets-issues-20260923-1405.html',
      'text/html;charset=utf-8',
    )
  })

  it('download() for format "text" still calls downloadText with exactly two arguments (unchanged)', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const { download, previewText } = exportMod.useExport()
    download()
    expect(downloadMod.downloadText).toHaveBeenCalledWith(previewText.value, 'acme-widgets-issues-20260923-1405.txt')
    expect(downloadMod.downloadText).toHaveBeenCalledTimes(1)
    expect((downloadMod.downloadText as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(2)
  })
})
