// Design v2: the issues table shows a default subset of columns; the rest are
// re-enabled from a "Columns" menu and persisted per analysis.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VISIBLE_COLUMNS,
  REQUIRED_COLUMNS,
  TABLE_COLUMN_IDS,
  resolveVisibleColumns,
  toggleColumn,
} from './columns'

describe('table columns', () => {
  it('hide complexity, confidence and comments by default and keep the rest in table order', () => {
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual(
      TABLE_COLUMN_IDS.filter((id) => !['complexity', 'confidence', 'comments'].includes(id)),
    )
  })

  it('always keep the issue number and title', () => {
    expect(REQUIRED_COLUMNS).toEqual(['number', 'title'])
    expect(resolveVisibleColumns(['priority'])).toEqual(['number', 'title', 'priority'])
  })

  it('fall back to the defaults when nothing valid is stored', () => {
    expect(resolveVisibleColumns(undefined)).toEqual(DEFAULT_VISIBLE_COLUMNS)
    expect(resolveVisibleColumns('priority')).toEqual(DEFAULT_VISIBLE_COLUMNS)
    expect(resolveVisibleColumns([42, null])).toEqual(DEFAULT_VISIBLE_COLUMNS)
  })

  it('drop unknown ids and duplicates, and return the canonical order', () => {
    expect(resolveVisibleColumns(['effort', 'bogus', 'kind', 'effort', 'title', 'number'])).toEqual([
      'number',
      'title',
      'kind',
      'effort',
    ])
  })

  it('toggle a column on and off, but never a required one', () => {
    const withComplexity = toggleColumn(DEFAULT_VISIBLE_COLUMNS, 'complexity')
    expect(withComplexity).toContain('complexity')
    expect(withComplexity.indexOf('complexity')).toBe(withComplexity.indexOf('criticality') + 1)
    expect(toggleColumn(withComplexity, 'complexity')).toEqual(DEFAULT_VISIBLE_COLUMNS)
    expect(toggleColumn(DEFAULT_VISIBLE_COLUMNS, 'title')).toEqual(DEFAULT_VISIBLE_COLUMNS)
  })
})
