// Task 14 — the priority score, a composite ranking aid
// computed on the fly from a classification's raw scores and the analysis's
// weights. It is never stored; changing a weight never touches a
// classification. Table-driven.
import { describe, expect, it } from 'vitest'
import { clampWeights, priorityOf } from './priority'
import { defaultPriorityWeights } from './types'
import type { PriorityWeights } from './types'
import { fakeClassification } from '../../tests/fakes/domainFixtures'

function weights(overrides: Partial<PriorityWeights> = {}): PriorityWeights {
  return { ...defaultPriorityWeights(), ...overrides }
}

describe('priorityOf — worked example', () => {
  it('rounds to 83 with the default weights (criticality 1.8, relevance 3.5, complexity 0.9, effort 0.4)', () => {
    const c = fakeClassification({
      criticality: { level: 'high', score: 1.8, confidence: 0.9, probabilities: [0, 0.1, 0.9] },
      relevance: { value: 88, score: 3.5, confidence: 0.8, probabilities: [0, 0, 0, 0.8, 0.2] },
      complexity: { level: 'medium', score: 0.9, confidence: 0.7, probabilities: [0.2, 0.7, 0.1] },
      effort: { level: 'low', score: 0.4, confidence: 0.9, probabilities: [0.8, 0.2, 0] },
    })
    expect(priorityOf(c, defaultPriorityWeights())).toBe(83)
  })
})

describe('priorityOf — null cases', () => {
  it('is null when there is no classification', () => {
    expect(priorityOf(null, defaultPriorityWeights())).toBeNull()
    expect(priorityOf(undefined, defaultPriorityWeights())).toBeNull()
  })

  it('is null when every weight is 0, even for a classified row', () => {
    const c = fakeClassification()
    expect(priorityOf(c, weights({ criticality: 0, relevance: 0, complexity: 0, effort: 0 }))).toBeNull()
  })
})

describe('priorityOf — a single non-zero weight isolates that dimension', () => {
  it('criticality alone: the highest criticality score maxes out priority', () => {
    const c = fakeClassification({
      criticality: { level: 'high', score: 2, confidence: 0.9, probabilities: [0, 0, 1] },
    })
    expect(priorityOf(c, weights({ criticality: 40, relevance: 0, complexity: 0, effort: 0 }))).toBe(100)
  })

  it('relevance alone: the highest relevance score maxes out priority', () => {
    const c = fakeClassification({
      relevance: { value: 100, score: 4, confidence: 0.9, probabilities: [0, 0, 0, 0, 1] },
    })
    expect(priorityOf(c, weights({ criticality: 0, relevance: 30, complexity: 0, effort: 0 }))).toBe(100)
  })

  it('complexity alone: the lowest complexity score maxes out priority (inverted)', () => {
    const c = fakeClassification({
      complexity: { level: 'low', score: 0, confidence: 0.9, probabilities: [1, 0, 0] },
    })
    expect(priorityOf(c, weights({ criticality: 0, relevance: 0, complexity: 15, effort: 0 }))).toBe(100)
  })

  it('effort alone: the lowest effort score maxes out priority (inverted)', () => {
    const c = fakeClassification({ effort: { level: 'low', score: 0, confidence: 0.9, probabilities: [1, 0, 0] } })
    expect(priorityOf(c, weights({ criticality: 0, relevance: 0, complexity: 0, effort: 15 }))).toBe(100)
  })
})

describe('priorityOf — inversions hold', () => {
  it('raising effort lowers priority, all else equal', () => {
    const low = fakeClassification({ effort: { level: 'low', score: 0, confidence: 0.9, probabilities: [1, 0, 0] } })
    const high = fakeClassification({ effort: { level: 'high', score: 2, confidence: 0.9, probabilities: [0, 0, 1] } })
    expect(priorityOf(high, defaultPriorityWeights())).toBeLessThan(priorityOf(low, defaultPriorityWeights())!)
  })

  it('raising complexity lowers priority, all else equal', () => {
    const low = fakeClassification({
      complexity: { level: 'low', score: 0, confidence: 0.9, probabilities: [1, 0, 0] },
    })
    const high = fakeClassification({
      complexity: { level: 'high', score: 2, confidence: 0.9, probabilities: [0, 0, 1] },
    })
    expect(priorityOf(high, defaultPriorityWeights())).toBeLessThan(priorityOf(low, defaultPriorityWeights())!)
  })
})

describe('priorityOf — monotonicity in each dimension', () => {
  it('is non-decreasing in criticality score', () => {
    const values = [0, 0.5, 1, 1.5, 2].map(
      (score) =>
        priorityOf(
          fakeClassification({ criticality: { level: 'high', score, confidence: 0.9, probabilities: [0, 0, 1] } }),
          defaultPriorityWeights(),
        )!,
    )
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
  })

  it('is non-decreasing in relevance score', () => {
    const values = [0, 1, 2, 3, 4].map(
      (score) =>
        priorityOf(
          fakeClassification({
            relevance: { value: score * 25, score, confidence: 0.9, probabilities: [0, 0, 0, 0, 0] },
          }),
          defaultPriorityWeights(),
        )!,
    )
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
  })

  it('is non-increasing in complexity score (inverted)', () => {
    const values = [0, 0.5, 1, 1.5, 2].map(
      (score) =>
        priorityOf(
          fakeClassification({ complexity: { level: 'medium', score, confidence: 0.9, probabilities: [0, 1, 0] } }),
          defaultPriorityWeights(),
        )!,
    )
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1])
  })

  it('is non-increasing in effort score (inverted)', () => {
    const values = [0, 0.5, 1, 1.5, 2].map(
      (score) =>
        priorityOf(
          fakeClassification({ effort: { level: 'medium', score, confidence: 0.9, probabilities: [0, 1, 0] } }),
          defaultPriorityWeights(),
        )!,
    )
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1])
  })
})

describe('clampWeights — rounds each weight to a multiple of 5 within 0..100', () => {
  it.each<[PriorityWeights, PriorityWeights]>([
    [
      { criticality: 40, relevance: 30, complexity: 15, effort: 15 },
      { criticality: 40, relevance: 30, complexity: 15, effort: 15 },
    ],
    [
      { criticality: 42, relevance: 30, complexity: 15, effort: 15 },
      { criticality: 40, relevance: 30, complexity: 15, effort: 15 },
    ],
    [
      { criticality: 43, relevance: 30, complexity: 15, effort: 15 },
      { criticality: 45, relevance: 30, complexity: 15, effort: 15 },
    ],
    [
      { criticality: -10, relevance: 30, complexity: 15, effort: 15 },
      { criticality: 0, relevance: 30, complexity: 15, effort: 15 },
    ],
    [
      { criticality: 250, relevance: 30, complexity: 15, effort: 15 },
      { criticality: 100, relevance: 30, complexity: 15, effort: 15 },
    ],
    [
      { criticality: 0, relevance: 0, complexity: 0, effort: 0 },
      { criticality: 0, relevance: 0, complexity: 0, effort: 0 },
    ],
  ])('clamps %o to %o', (input, expected) => {
    expect(clampWeights(input)).toEqual(expected)
  })
})
