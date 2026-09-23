import { describe, expect, it } from 'vitest'
import { estimateRun, estimateStateTokens, JEV_USD_PER_MILLION_INPUT_TOKENS } from './estimate'

describe('estimate (SPEC §4.7)', () => {
  it('estimates state tokens as ceil(chars / 3.5) of the serialized state', () => {
    const state = { issue: { body: 'x'.repeat(100) } }
    expect(estimateStateTokens(state)).toBe(Math.ceil(JSON.stringify(state).length / 3.5))
  })

  it('uses $0.042 per million input tokens (models.md)', () => {
    expect(JEV_USD_PER_MILLION_INPUT_TOKENS).toBe(0.042)
  })

  it('sums state tokens plus the question tokens once per request', () => {
    const run = estimateRun([1_000, 2_000, 3_000], 900)
    expect(run.requests).toBe(3)
    expect(run.inputTokens).toBe(6_000 + 3 * 900)
    expect(run.costUsd).toBeCloseTo((8_700 / 1_000_000) * 0.042, 10)
  })

  it('matches the §4.7 order of magnitude: 200 issues at about 4 000 tokens cost about $0.03', () => {
    const run = estimateRun(
      Array.from({ length: 200 }, () => 3_100),
      900,
    )
    expect(run.inputTokens).toBe(800_000)
    expect(run.costUsd).toBeCloseTo(0.0336, 4)
  })

  it('accepts a custom price and handles an empty run', () => {
    expect(estimateRun([], 900)).toEqual({ requests: 0, inputTokens: 0, costUsd: 0 })
    expect(estimateRun([1_000_000], 0, 1).costUsd).toBe(1)
  })
})
