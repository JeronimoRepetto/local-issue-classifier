// Per-provider batching (docs/batching.md "Local providers"): a local Kev/JevK5
// runs a small model whose context is far below the cloud's 32k state budget,
// so a big batch comes back 422. The local settings cap the estimated state of
// every batch, stop trimming at `condensed` and send what still cannot fit one
// issue at a time; the cloud settings are unchanged.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCAL_MAX_STATE_TOKENS,
  LOCAL_MAX_STATE_TOKENS_RANGE,
  batchSettingsFor,
  sanitizeLocalMaxStateTokens,
} from './providerBatching'
import { DEFAULT_REQUEST_LIMITS, TRIMMING_PROFILE_IDS, planBatches } from './jevBatchState'
import type { QuestionBudget } from './jevBatchState'
import { typicalIssues, typicalProjectContext } from '../../tests/fakes/typicalIssues'

const NOW = new Date('2026-09-23T00:00:00Z')
const QUESTIONS: QuestionBudget = { perIssueTokens: 950, longestQuestionTokens: 300 }

describe('batchSettingsFor', () => {
  it('leaves the cloud unchanged: documented limits, the user floor, no per-issue fallback', () => {
    for (const kind of ['typesafe', 'browser'] as const) {
      expect(batchSettingsFor(kind, { trimmingFloor: 'minimal', localMaxStateTokens: 8_000 })).toEqual({
        limits: DEFAULT_REQUEST_LIMITS,
        floor: 'minimal',
        perIssueFallback: false,
      })
    }
  })

  it('caps a local state at the configured budget (default about 8k tokens)', () => {
    expect(DEFAULT_LOCAL_MAX_STATE_TOKENS).toBe(8_000)
    const local = batchSettingsFor('local', { trimmingFloor: 'minimal', localMaxStateTokens: 6_000 })
    expect(local.limits).toEqual({ ...DEFAULT_REQUEST_LIMITS, maxStateTokens: 6_000 })
    expect(local.perIssueFallback).toBe(true)
  })

  it('stops a local batch at the condensed profile, but keeps a looser user floor', () => {
    expect(batchSettingsFor('local', { trimmingFloor: 'minimal', localMaxStateTokens: 8_000 }).floor).toBe('condensed')
    expect(batchSettingsFor('local', { trimmingFloor: 'tight', localMaxStateTokens: 8_000 }).floor).toBe('condensed')
    expect(batchSettingsFor('local', { trimmingFloor: 'compact', localMaxStateTokens: 8_000 }).floor).toBe('compact')
  })
})

describe('sanitizeLocalMaxStateTokens', () => {
  it('keeps a whole number inside the range, clamps the rest and defaults garbage', () => {
    const { min, max } = LOCAL_MAX_STATE_TOKENS_RANGE
    expect(sanitizeLocalMaxStateTokens(12_000)).toBe(12_000)
    expect(sanitizeLocalMaxStateTokens(12_000.7)).toBe(12_000)
    expect(sanitizeLocalMaxStateTokens(10)).toBe(min)
    expect(sanitizeLocalMaxStateTokens(10_000_000)).toBe(max)
    expect(sanitizeLocalMaxStateTokens('8000')).toBe(DEFAULT_LOCAL_MAX_STATE_TOKENS)
    expect(sanitizeLocalMaxStateTokens(Number.NaN)).toBe(DEFAULT_LOCAL_MAX_STATE_TOKENS)
    expect(sanitizeLocalMaxStateTokens(undefined)).toBe(DEFAULT_LOCAL_MAX_STATE_TOKENS)
  })
})

describe('planning 100 issues for a local provider', () => {
  const issues = typicalIssues(100)
  const ctx = typicalProjectContext()
  const settings = batchSettingsFor('local', { trimmingFloor: 'minimal', localMaxStateTokens: DEFAULT_LOCAL_MAX_STATE_TOKENS })
  const plan = planBatches(issues, ctx, {
    now: () => NOW,
    questions: QUESTIONS,
    floor: settings.floor,
    limits: settings.limits,
  })

  it('never plans a batch above the cap', () => {
    expect(plan.batches.length).toBeGreaterThan(1)
    for (const batch of plan.batches) expect(batch.stateTokens).toBeLessThanOrEqual(DEFAULT_LOCAL_MAX_STATE_TOKENS)
  })

  it('accounts for every issue: batched, or left for the per-issue fallback', () => {
    const planned = plan.batches.flatMap((b) => b.issues).length + plan.tooLarge.length
    expect(planned).toBe(100)
  })

  it('never trims below condensed', () => {
    expect(TRIMMING_PROFILE_IDS.indexOf(plan.profile)).toBeLessThanOrEqual(TRIMMING_PROFILE_IDS.indexOf('condensed'))
  })

  it('while the cloud plan for the same issues is unchanged by the local settings', () => {
    const cloud = batchSettingsFor('typesafe', { trimmingFloor: 'minimal', localMaxStateTokens: 8_000 })
    const withSettings = planBatches(issues, ctx, { now: () => NOW, questions: QUESTIONS, floor: cloud.floor, limits: cloud.limits })
    const baseline = planBatches(issues, ctx, { now: () => NOW, questions: QUESTIONS })
    expect(withSettings.batches.map((b) => b.issues.length)).toEqual(baseline.batches.map((b) => b.issues.length))
    expect(withSettings.profile).toBe(baseline.profile)
  })
})
