// Task 11 — SPEC.md §2.4: which issues a Classify scope sends.
import { describe, expect, it } from 'vitest'
import { selectForClassification, needsClassification, scopeCounts, estimateSeconds } from './classifyRun'
import { applyClassification, createAnalysis, dismiss, markStale } from './analysis'
import type { Analysis } from './types'
import { defaultPreferences, defaultProjectContext } from './types'
import { deepFreeze, fakeClassification, fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'

const NOW = '2026-09-23T00:00:00Z'

/** #1 unclassified, #2 done, #3 error, #4 stale (issue edited), #5 done but older questions version, #6 dismissed. */
function analysis(): Analysis {
  let a = createAnalysis({
    id: 'a1',
    repo: fakeRepo(),
    stateFilter: 'open',
    now: NOW,
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [1, 2, 3, 4, 5, 6].map((n) => fakeIssue(n)),
    commentsFetched: false,
  })
  a = applyClassification(a, 2, { ok: true, classification: fakeClassification() }, NOW)
  a = applyClassification(a, 3, { ok: false, error: 'Timeout' }, NOW)
  a = applyClassification(
    a,
    4,
    { ok: true, classification: fakeClassification({ issueUpdatedAt: '2025-12-01T00:00:00Z' }) },
    NOW,
  )
  a = applyClassification(a, 5, { ok: true, classification: fakeClassification({ questionsVersion: 0 }) }, NOW)
  a = applyClassification(a, 6, { ok: false, error: 'Timeout' }, NOW)
  return deepFreeze(dismiss(a, [6], NOW))
}

const numbers = (a: Analysis, ...args: Parameters<typeof selectForClassification> extends [Analysis, ...infer R] ? R : never) =>
  selectForClassification(a, ...args).map((i) => i.number)

describe('selectForClassification', () => {
  it('unclassified scope sends unclassified, failed and stale issues, never dismissed ones', () => {
    expect(numbers(analysis(), { scope: 'unclassified', questionsVersion: 1 })).toEqual([1, 3, 4, 5])
  })

  it('also treats rows already marked stale by markStale as unclassified', () => {
    const a = markStale(analysis(), 1)
    expect(a.rows.find((r) => r.issue.number === 4)?.status).toBe('stale')
    expect(numbers(a, { scope: 'unclassified', questionsVersion: 1 })).toEqual([1, 3, 4, 5])
  })

  it('all scope re-sends every non-dismissed issue', () => {
    expect(numbers(analysis(), { scope: 'all', questionsVersion: 1 })).toEqual([1, 2, 3, 4, 5])
  })

  it('an explicit number list (filtered view, retry failed) narrows the unclassified scope', () => {
    expect(numbers(analysis(), { scope: 'unclassified', questionsVersion: 1, only: [2, 3, 6] })).toEqual([3])
  })

  it('needsClassification is false only for a current done classification', () => {
    const rows = analysis().rows
    expect(rows.map((r) => needsClassification(r, 1))).toEqual([true, false, true, true, true, true])
  })
})

describe('scopeCounts', () => {
  it('counts each scope, with filtered null when no view is given', () => {
    expect(scopeCounts(analysis(), 1)).toEqual({ unclassified: 4, all: 5, filtered: null })
    expect(scopeCounts(analysis(), 1, [1, 2, 6])).toEqual({ unclassified: 4, all: 5, filtered: 1 })
  })
})

describe('estimateSeconds', () => {
  it('assumes 2 s per call spread over the concurrency, rounded up', () => {
    expect(estimateSeconds(22, 4)).toBe(11)
    expect(estimateSeconds(200, 4)).toBe(100)
    expect(estimateSeconds(0, 4)).toBe(0)
    expect(estimateSeconds(3, 0)).toBe(6)
  })
})
