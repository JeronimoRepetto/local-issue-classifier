import { describe, expect, it } from 'vitest'
import { confidenceLevel, levelBars, levelLabel, scaleStep } from './levels'

describe('levelBars / levelLabel', () => {
  it('maps high/medium/low to 3/2/1 bars and a capitalized label', () => {
    expect(levelBars('high')).toBe(3)
    expect(levelBars('medium')).toBe(2)
    expect(levelBars('low')).toBe(1)
    expect(levelLabel('medium')).toBe('Medium')
  })
})

describe('confidenceLevel', () => {
  it.each([
    [1, 'high'],
    [0.8, 'high'],
    [0.79, 'medium'],
    [0.5, 'medium'],
    [0.49, 'low'],
    [0, 'low'],
  ] as const)('%s → %s', (value, expected) => {
    expect(confidenceLevel(value)).toBe(expected)
  })
})

describe('scaleStep', () => {
  it.each([
    [0, 1],
    [19, 1],
    [20, 2],
    [59, 3],
    [80, 5],
    [100, 5],
    [-10, 1],
    [140, 5],
  ])('%s → scale-%s', (value, step) => {
    expect(scaleStep(value)).toBe(step)
  })
})
