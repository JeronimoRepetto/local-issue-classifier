// Design v2: column visibility lives in the analysis working state, so it is
// saved with the analysis and restored when it is reopened or the page reloads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import { DEFAULT_VISIBLE_COLUMNS } from '../domain/columns'
import { defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

type AnalysisModule = typeof import('./useAnalysis')
type ColumnsModule = typeof import('./useColumns')

let analysisMod: AnalysisModule
let columnsMod: ColumnsModule
let storage: MemoryStorage

function analysis(id = 'a1') {
  return createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [fakeIssue(1)],
    commentsFetched: false,
  })
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
  analysisMod = await import('./useAnalysis')
  analysisMod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
  columnsMod = await import('./useColumns')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useColumns', () => {
  it('shows the default columns when no analysis is current, or none were chosen', () => {
    expect(columnsMod.useColumns().visible.value).toEqual(DEFAULT_VISIBLE_COLUMNS)
    analysisMod.useAnalysis().setCurrent(analysis())
    expect(columnsMod.useColumns().visible.value).toEqual(DEFAULT_VISIBLE_COLUMNS)
  })

  it('toggles a column and resets to the defaults', () => {
    analysisMod.useAnalysis().setCurrent(analysis())
    const columns = columnsMod.useColumns()
    columns.toggle('comments')
    expect(columns.visible.value).toContain('comments')
    columns.reset()
    expect(columns.visible.value).toEqual(DEFAULT_VISIBLE_COLUMNS)
  })

  it('persists with the analysis and survives a page reload', async () => {
    analysisMod.useAnalysis().setCurrent(analysis('a1'))
    columnsMod.useColumns().toggle('confidence')
    columnsMod.useColumns().toggle('kind')
    vi.advanceTimersByTime(500)

    vi.resetModules()
    ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
    const reloadedAnalysis: AnalysisModule = await import('./useAnalysis')
    const reloadedColumns: ColumnsModule = await import('./useColumns')
    reloadedAnalysis.useAnalysis().open('a1')

    const visible = reloadedColumns.useColumns().visible.value
    expect(visible).toContain('confidence')
    expect(visible).not.toContain('kind')
  })
})
