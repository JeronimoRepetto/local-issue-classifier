// Task 12 — SPEC.md §2.5 item 1, §6.4: filterRows and searchText, pure.
import { describe, expect, it } from 'vitest'
import { filterRows, searchText } from './filter'
import { defaultFilter } from './types'
import type { IssueRow } from './types'
import { fakeClassification, fakeIssue } from '../../tests/fakes/domainFixtures'

function row(number: number, overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    issue: fakeIssue(number),
    status: 'unclassified',
    classification: null,
    error: null,
    sourceStatus: 'present',
    ...overrides,
  }
}

function classifiedRow(
  number: number,
  overrides: {
    criticality?: 'low' | 'medium' | 'high'
    complexity?: 'low' | 'medium' | 'high'
    effort?: 'low' | 'medium' | 'high'
    relevance?: number
    minConfidence?: number
    kind?: 'bug' | 'feature' | 'documentation' | 'question' | 'maintenance' | 'other'
  } = {},
  rowOverrides: Partial<IssueRow> = {},
): IssueRow {
  const classification = fakeClassification({
    criticality: { level: overrides.criticality ?? 'high', score: 2, confidence: 0.9, probabilities: [0, 0, 1] },
    complexity: { level: overrides.complexity ?? 'medium', score: 1, confidence: 0.8, probabilities: [0, 1, 0] },
    effort: { level: overrides.effort ?? 'low', score: 0, confidence: 0.8, probabilities: [1, 0, 0] },
    relevance: {
      value: overrides.relevance ?? 75,
      score: 3,
      confidence: 0.7,
      probabilities: [0, 0, 0, 1, 0],
    },
    minConfidence: overrides.minConfidence ?? 0.7,
    kind: { choice: overrides.kind ?? 'bug', confidence: 0.9 },
  })
  return row(number, { status: 'done', classification, ...rowOverrides })
}

describe('filterRows — level dimensions (complexity, criticality, effort)', () => {
  it('an empty filter passes every row, classified or not', () => {
    const rows = [row(1), classifiedRow(2)]
    expect(filterRows(rows, defaultFilter())).toEqual(rows)
  })

  it('matches rows whose level is one of the selected values', () => {
    const high = classifiedRow(1, { criticality: 'high' })
    const low = classifiedRow(2, { criticality: 'low' })
    const rows = [high, low]
    expect(filterRows(rows, { ...defaultFilter(), criticality: ['high'] })).toEqual([high])
    expect(filterRows(rows, { ...defaultFilter(), criticality: ['high', 'low'] })).toEqual(rows)
  })

  it('unclassified rows fail a non-empty level filter', () => {
    const unclassified = row(1)
    const classified = classifiedRow(2, { criticality: 'high' })
    const result = filterRows([unclassified, classified], { ...defaultFilter(), criticality: ['high'] })
    expect(result).toEqual([classified])
  })

  it('filters independently by complexity and effort', () => {
    const a = classifiedRow(1, { complexity: 'low', effort: 'low' })
    const b = classifiedRow(2, { complexity: 'high', effort: 'high' })
    expect(filterRows([a, b], { ...defaultFilter(), complexity: ['low'] })).toEqual([a])
    expect(filterRows([a, b], { ...defaultFilter(), effort: ['high'] })).toEqual([b])
  })
})

describe('filterRows — kind', () => {
  it('an empty kind filter passes every row', () => {
    const rows = [row(1), classifiedRow(2, { kind: 'feature' })]
    expect(filterRows(rows, defaultFilter())).toEqual(rows)
  })

  it('matches the classified kind, and unclassified rows fail a non-empty filter', () => {
    const bug = classifiedRow(1, { kind: 'bug' })
    const feature = classifiedRow(2, { kind: 'feature' })
    const unclassified = row(3)
    const result = filterRows([bug, feature, unclassified], { ...defaultFilter(), kind: ['bug'] })
    expect(result).toEqual([bug])
  })
})

describe('filterRows — relevance range', () => {
  it('the full 0-100 range is "no filter" and passes unclassified rows too', () => {
    const rows = [row(1), classifiedRow(2, { relevance: 40 })]
    expect(filterRows(rows, defaultFilter())).toEqual(rows)
  })

  it('a narrowed range keeps only rows inside it, and drops unclassified rows', () => {
    const low = classifiedRow(1, { relevance: 10 })
    const mid = classifiedRow(2, { relevance: 55 })
    const high = classifiedRow(3, { relevance: 90 })
    const unclassified = row(4)
    const result = filterRows([low, mid, high, unclassified], {
      ...defaultFilter(),
      relevanceMin: 50,
      relevanceMax: 80,
    })
    expect(result).toEqual([mid])
  })
})

describe('filterRows — minimum confidence', () => {
  it('minConfidence 0 is "no filter" and passes unclassified rows', () => {
    const rows = [row(1), classifiedRow(2, { minConfidence: 0.2 })]
    expect(filterRows(rows, defaultFilter())).toEqual(rows)
  })

  it('drops rows (and unclassified rows) below the threshold', () => {
    const confident = classifiedRow(1, { minConfidence: 0.9 })
    const unsure = classifiedRow(2, { minConfidence: 0.3 })
    const unclassified = row(3)
    const result = filterRows([confident, unsure, unclassified], { ...defaultFilter(), minConfidence: 0.5 })
    expect(result).toEqual([confident])
  })

  it('drops rows with undefined minConfidence when a threshold is active', () => {
    const classification = fakeClassification({ minConfidence: undefined })
    const withUndefined = row(1, { status: 'done', classification })
    const withDefined = classifiedRow(2, { minConfidence: 0.8 })
    const result = filterRows([withUndefined, withDefined], { ...defaultFilter(), minConfidence: 0.5 })
    expect(result).toEqual([withDefined])
  })
})

describe('filterRows — classification status', () => {
  it('an empty statuses filter passes every status', () => {
    const rows = [row(1, { status: 'unclassified' }), row(2, { status: 'stale' }), row(3, { status: 'error' })]
    expect(filterRows(rows, defaultFilter())).toEqual(rows)
  })

  it('keeps only the selected statuses, e.g. unclassified and stale', () => {
    const unclassified = row(1, { status: 'unclassified' })
    const stale = row(2, { status: 'stale' })
    const done = classifiedRow(3)
    const result = filterRows([unclassified, stale, done], { ...defaultFilter(), statuses: ['unclassified', 'stale'] })
    expect(result).toEqual([unclassified, stale])
  })
})

describe('filterRows — labels', () => {
  it('an empty labels filter passes every row', () => {
    const rows = [row(1, { issue: fakeIssue(1, { labels: [] }) })]
    expect(filterRows(rows, defaultFilter())).toEqual(rows)
  })

  it('matches rows with at least one selected label', () => {
    const a = row(1, { issue: fakeIssue(1, { labels: ['bug', 'p1'] }) })
    const b = row(2, { issue: fakeIssue(2, { labels: ['docs'] }) })
    const result = filterRows([a, b], { ...defaultFilter(), labels: ['p1'] })
    expect(result).toEqual([a])
  })
})

describe('filterRows — free-text search', () => {
  it('matches on number, title, body, labels and author, case-insensitively', () => {
    const byTitle = row(1, { issue: fakeIssue(1, { title: 'Crash on empty list' }) })
    const byBody = row(2, { issue: fakeIssue(2, { title: 'x', body: 'reproduces a CRASH here' }) })
    const byLabel = row(3, { issue: fakeIssue(3, { title: 'x', body: 'y', labels: ['crash-loop'] }) })
    const byAuthor = row(4, { issue: fakeIssue(4, { title: 'x', body: 'y', author: 'crashtest' }) })
    const byNumber = row(42, { issue: fakeIssue(42, { title: 'x', body: 'y' }) })
    const none = row(5, { issue: fakeIssue(5, { title: 'unrelated', body: 'nothing', labels: [] }) })
    const rows = [byTitle, byBody, byLabel, byAuthor, byNumber, none]

    expect(filterRows(rows, { ...defaultFilter(), text: 'crash' })).toEqual([byTitle, byBody, byLabel, byAuthor])
    expect(filterRows(rows, { ...defaultFilter(), text: '42' })).toEqual([byNumber])
  })

  it('ANDs multiple whitespace-separated terms', () => {
    const both = row(1, { issue: fakeIssue(1, { title: 'Crash on reload' }) })
    const onlyCrash = row(2, { issue: fakeIssue(2, { title: 'Crash on start' }) })
    const rows = [both, onlyCrash]
    expect(filterRows(rows, { ...defaultFilter(), text: 'crash reload' })).toEqual([both])
  })

  it('ignores blank search text', () => {
    const rows = [row(1)]
    expect(filterRows(rows, { ...defaultFilter(), text: '   ' })).toEqual(rows)
  })
})

describe('filterRows — combination (AND across dimensions)', () => {
  it('applies every active dimension together', () => {
    const match = classifiedRow(1, { criticality: 'high', relevance: 90 }, { issue: fakeIssue(1, { labels: ['bug'] }) })
    const failsCriticality = classifiedRow(
      2,
      { criticality: 'low', relevance: 90 },
      { issue: fakeIssue(2, { labels: ['bug'] }) },
    )
    const failsLabel = classifiedRow(
      3,
      { criticality: 'high', relevance: 90 },
      { issue: fakeIssue(3, { labels: ['docs'] }) },
    )
    const rows = [match, failsCriticality, failsLabel]
    const result = filterRows(rows, {
      ...defaultFilter(),
      criticality: ['high'],
      relevanceMin: 50,
      relevanceMax: 100,
      labels: ['bug'],
    })
    expect(result).toEqual([match])
  })

  it('never mutates its input', () => {
    const rows = [row(1), classifiedRow(2)]
    const snapshot = JSON.stringify(rows)
    filterRows(rows, { ...defaultFilter(), criticality: ['high'] })
    expect(JSON.stringify(rows)).toBe(snapshot)
  })
})

describe('searchText', () => {
  it('builds a lower-cased haystack of number, title, body, labels and author', () => {
    const issue = fakeIssue(7, { title: 'Title', body: 'Body', labels: ['A', 'B'], author: 'Octo' })
    const haystack = searchText(issue)
    expect(haystack).toBe(haystack.toLowerCase())
    expect(haystack).toContain('7')
    expect(haystack).toContain('title')
    expect(haystack).toContain('body')
    expect(haystack).toContain('a')
    expect(haystack).toContain('octo')
  })
})
