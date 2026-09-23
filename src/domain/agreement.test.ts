// Agreement harness (docs/batching.md, scripts/compare-batching.mjs): how well a
// candidate run (batched, per trimming profile) agrees with the per-issue baseline.
import { describe, expect, it } from 'vitest'
import { compareClassifications, formatAgreementTable, type HarnessRow } from './agreement'
import type { Classification, Level } from './types'
import { fakeClassification } from '../../tests/fakes/domainFixtures'

function c(levels: [Level, Level, Level], relevance: number, kind: Classification['kind']['choice'], confidence = 0.8) {
  const dim = (level: Level) => ({
    level,
    score: ['low', 'medium', 'high'].indexOf(level),
    confidence,
    probabilities: [0.1, 0.8, 0.1] as [number, number, number],
  })
  return fakeClassification({
    complexity: dim(levels[0]),
    criticality: dim(levels[1]),
    effort: dim(levels[2]),
    relevance: { value: relevance, score: relevance / 25, confidence, probabilities: [0, 0.1, 0.1, 0.7, 0.1] },
    kind: { choice: kind, confidence },
  })
}

const baseline = new Map<number, Classification>([
  [1, c(['low', 'high', 'low'], 100, 'bug', 0.9)],
  [2, c(['medium', 'medium', 'medium'], 75, 'feature', 0.8)],
  [3, c(['high', 'low', 'high'], 50, 'question', 0.7)],
  [4, c(['low', 'low', 'low'], 25, 'bug', 0.6)],
])

describe('compareClassifications', () => {
  it('is perfect agreement against itself', () => {
    const report = compareClassifications(baseline, baseline)
    expect(report.compared).toBe(4)
    expect(report.missing).toEqual([])
    for (const d of ['complexity', 'criticality', 'effort', 'kind'] as const) expect(report[d].exact).toBe(1)
    expect(report.relevance.meanAbsDiff).toBe(0)
    expect(report.complexity.meanConfidenceDelta).toBe(0)
  })

  it('measures exact level matches, relevance distance and confidence deltas', () => {
    const candidate = new Map<number, Classification>([
      [1, c(['low', 'high', 'low'], 75, 'bug', 0.8)],
      [2, c(['high', 'medium', 'medium'], 75, 'feature', 0.7)],
      [3, c(['high', 'low', 'medium'], 100, 'bug', 0.8)],
      [4, c(['low', 'low', 'low'], 25, 'bug', 0.5)],
    ])
    const report = compareClassifications(baseline, candidate)
    expect(report.complexity.exact).toBe(0.75)
    expect(report.criticality.exact).toBe(1)
    expect(report.effort.exact).toBe(0.75)
    expect(report.kind.exact).toBe(0.75)
    // |100-75| + 0 + |50-100| + 0 over 4
    expect(report.relevance.meanAbsDiff).toBe(18.75)
    expect(report.relevance.exact).toBe(0.5)
    // (-0.1 - 0.1 + 0.1 - 0.1) / 4
    expect(report.complexity.meanConfidenceDelta).toBeCloseTo(-0.05, 10)
    expect(report.complexity.meanAbsConfidenceDelta).toBeCloseTo(0.1, 10)
  })

  it('compares only issues present in both runs and lists the missing ones', () => {
    const candidate = new Map([[1, baseline.get(1) as Classification]])
    const report = compareClassifications(baseline, candidate)
    expect(report.compared).toBe(1)
    expect(report.missing).toEqual([2, 3, 4])
  })

  it('an empty comparison has null metrics, never NaN', () => {
    const report = compareClassifications(baseline, new Map())
    expect(report.compared).toBe(0)
    expect(report.complexity.exact).toBeNull()
    expect(report.relevance.meanAbsDiff).toBeNull()
  })

  it('treats a missing confidence as no delta', () => {
    const noConfidence = fakeClassification()
    delete noConfidence.complexity.confidence
    const report = compareClassifications(new Map([[1, fakeClassification()]]), new Map([[1, noConfidence]]))
    expect(report.complexity.meanConfidenceDelta).toBeNull()
    expect(report.complexity.exact).toBe(1)
  })
})

describe('formatAgreementTable', () => {
  it('prints one compact row per mode with calls, tokens, seconds and agreement', () => {
    const candidate = new Map(baseline)
    candidate.set(3, c(['low', 'low', 'high'], 50, 'question', 0.7))
    const rows: HarnessRow[] = [
      { label: 'per-issue', requests: 4, inputTokens: 16_000, seconds: 2.1, report: null },
      { label: 'batched compact', requests: 1, inputTokens: 5_000, seconds: 0.9, report: compareClassifications(baseline, candidate) },
    ]
    const table = formatAgreementTable(rows)
    expect(table).toMatchSnapshot()
    const lines = table.split('\n')
    expect(lines[0]).toMatch(/^mode\s+calls\s+tokens\s+secs\s+cmplx\s+crit\s+effort\s+kind\s+rel±\s+conf±$/)
    expect(lines[2]).toMatch(/^per-issue\s+4\s+16000\s+2\.1\s+\(baseline\)$/)
    expect(lines[3]).toContain('75%')
  })
})
