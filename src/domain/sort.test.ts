// Task 12 — SPEC.md §2.5 item 3, §6.4: single-key sortRows, pure and stable.
// Task 13 extends this into a multi-key sort by chaining `compareBy` per rule.
import { describe, expect, it } from 'vitest'
import { compareBy, sortRows } from './sort'
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
  scores: { criticality?: number; complexity?: number; effort?: number; relevance?: number; minConfidence?: number },
): IssueRow {
  const classification = fakeClassification({
    criticality: { level: 'high', score: scores.criticality ?? 1, confidence: 0.9, probabilities: [0, 0, 1] },
    complexity: { level: 'medium', score: scores.complexity ?? 1, confidence: 0.8, probabilities: [0, 1, 0] },
    effort: { level: 'low', score: scores.effort ?? 1, confidence: 0.8, probabilities: [1, 0, 0] },
    relevance: { value: scores.relevance ?? 50, score: 2, confidence: 0.7, probabilities: [0, 0, 1, 0, 0] },
    minConfidence: scores.minConfidence ?? 0.7,
  })
  return row(number, { status: 'done', classification })
}

describe('sortRows — level dimensions compare by raw score', () => {
  it('sorts ascending and descending by criticality score', () => {
    const low = classifiedRow(1, { criticality: 0 })
    const mid = classifiedRow(2, { criticality: 1 })
    const high = classifiedRow(3, { criticality: 2 })
    const rows = [mid, high, low]
    expect(sortRows(rows, 'criticality', 'asc')).toEqual([low, mid, high])
    expect(sortRows(rows, 'criticality', 'desc')).toEqual([high, mid, low])
  })

  it('sorts by complexity and effort scores independently', () => {
    const a = classifiedRow(1, { complexity: 0, effort: 2 })
    const b = classifiedRow(2, { complexity: 2, effort: 0 })
    expect(sortRows([a, b], 'complexity', 'asc')).toEqual([a, b])
    expect(sortRows([a, b], 'effort', 'asc')).toEqual([b, a])
  })
})

describe('sortRows — unclassified rows always sort last', () => {
  it('regardless of direction', () => {
    const classified = classifiedRow(1, { criticality: 0 })
    const unclassified = row(2)
    const rows = [unclassified, classified]
    expect(sortRows(rows, 'criticality', 'asc')).toEqual([classified, unclassified])
    expect(sortRows(rows, 'criticality', 'desc')).toEqual([classified, unclassified])
  })
})

describe('sortRows — relevance', () => {
  it('compares by value, then falls back to the number tie-break', () => {
    const a = classifiedRow(1, { relevance: 50 })
    const b = classifiedRow(2, { relevance: 80 })
    expect(sortRows([a, b], 'relevance', 'asc')).toEqual([a, b])
    expect(sortRows([a, b], 'relevance', 'desc')).toEqual([b, a])
  })
})

describe('sortRows — minConfidence', () => {
  it('compares by the classification minConfidence', () => {
    const a = classifiedRow(1, { minConfidence: 0.4 })
    const b = classifiedRow(2, { minConfidence: 0.9 })
    expect(sortRows([a, b], 'minConfidence', 'asc')).toEqual([a, b])
    expect(sortRows([a, b], 'minConfidence', 'desc')).toEqual([b, a])
  })

  it('sorts rows with undefined minConfidence after rows with defined values in both directions', () => {
    const classification = fakeClassification({ minConfidence: undefined })
    const withUndefined = row(3, { status: 'done', classification })
    const withDefined = classifiedRow(1, { minConfidence: 0.8 })
    expect(sortRows([withUndefined, withDefined], 'minConfidence', 'asc')).toEqual([withDefined, withUndefined])
    expect(sortRows([withUndefined, withDefined], 'minConfidence', 'desc')).toEqual([withDefined, withUndefined])
  })
})

describe('sortRows — dates compare by ISO string', () => {
  it('createdAt and updatedAt sort correctly regardless of classification', () => {
    const older = row(1, { issue: fakeIssue(1, { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-05T00:00:00Z' }) })
    const newer = row(2, { issue: fakeIssue(2, { createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-05T00:00:00Z' }) })
    expect(sortRows([newer, older], 'createdAt', 'asc')).toEqual([older, newer])
    expect(sortRows([newer, older], 'updatedAt', 'desc')).toEqual([newer, older])
  })
})

describe('sortRows — commentCount and number need no classification', () => {
  it('sorts unclassified rows by commentCount without pushing them last', () => {
    const a = row(1, { issue: fakeIssue(1, { commentCount: 5 }) })
    const b = row(2, { issue: fakeIssue(2, { commentCount: 1 }) })
    expect(sortRows([a, b], 'commentCount', 'asc')).toEqual([b, a])
  })

  it('sorts by issue number', () => {
    const a = row(9)
    const b = row(3)
    expect(sortRows([a, b], 'number', 'asc')).toEqual([b, a])
  })
})

describe('sortRows — tie-break is always issue number ascending', () => {
  it('breaks a tie on the primary key by number, regardless of direction', () => {
    const a = classifiedRow(5, { criticality: 1 })
    const b = classifiedRow(2, { criticality: 1 })
    const c = classifiedRow(8, { criticality: 1 })
    expect(sortRows([a, b, c], 'criticality', 'asc')).toEqual([b, a, c])
    expect(sortRows([a, b, c], 'criticality', 'desc')).toEqual([b, a, c])
  })
})

describe('sortRows — stability and purity', () => {
  it('never mutates the input array', () => {
    const rows = [classifiedRow(2, { criticality: 0 }), classifiedRow(1, { criticality: 1 })]
    const copy = [...rows]
    sortRows(rows, 'criticality', 'asc')
    expect(rows).toEqual(copy)
  })
})

describe('sortRows — priority (Task 14 wires the real computation)', () => {
  it('ties every row on priority today, so the number tie-break decides the order', () => {
    const a = classifiedRow(5, {})
    const b = classifiedRow(2, {})
    expect(sortRows([a, b], 'priority', 'asc')).toEqual([b, a])
    expect(sortRows([a, b], 'priority', 'desc')).toEqual([b, a])
  })
})

describe('compareBy', () => {
  it('returns an ascending comparator that Task 13 can chain per sort rule', () => {
    const a = classifiedRow(1, { criticality: 0 })
    const b = classifiedRow(2, { criticality: 2 })
    const cmp = compareBy('criticality')
    expect(cmp(a, b)).toBeLessThan(0)
    expect(cmp(b, a)).toBeGreaterThan(0)
    expect(cmp(a, a)).toBe(0)
  })

  it('ranks an unclassified row after a classified one first, before any raw value', () => {
    const classified = classifiedRow(1, { criticality: 0 })
    const unclassified = row(2)
    expect(compareBy('criticality')(unclassified, classified)).toBeGreaterThan(0)
    expect(compareBy('criticality')(classified, unclassified)).toBeLessThan(0)
  })
})
