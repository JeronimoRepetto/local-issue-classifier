// Batched classification (docs/batching.md): the composite state and the
// adaptive fitter that packs every selected issue into as few requests as the
// documented Jev limits allow (models.md: 64k per request, 32k state + longest question).
import { describe, expect, it } from 'vitest'
import {
  batchIssueId,
  buildBatchState,
  DEFAULT_REQUEST_LIMITS,
  JEV_REQUEST_LIMITS,
  planBatches,
  profilesUpTo,
  TRIMMING_PROFILE_IDS,
  TRIMMING_PROFILES,
  type PlanBatchesOptions,
  type QuestionBudget,
} from './jevBatchState'
import { buildIssueState } from './jevState'
import { estimateStateTokens } from './estimate'
import { defaultProjectContext, type Issue } from './types'
import { fakeIssue } from '../../tests/fakes/domainFixtures'
import { typicalIssues, typicalProjectContext } from '../../tests/fakes/typicalIssues'

const NOW = new Date('2026-09-23T00:00:00Z')
const now = () => NOW
const QUESTIONS: QuestionBudget = { perIssueTokens: 950, longestQuestionTokens: 300 }

const plan = (issues: readonly Issue[], overrides: Partial<PlanBatchesOptions> = {}) =>
  planBatches(issues, typicalProjectContext(), { now, questions: QUESTIONS, ...overrides })

describe('request limits (models.md, 10% safety margin)', () => {
  it('uses the documented limits minus 10%', () => {
    expect(JEV_REQUEST_LIMITS).toEqual({ stateTokens: 32_000, totalTokens: 64_000 })
    expect(DEFAULT_REQUEST_LIMITS).toEqual({ stateTokens: 28_800, totalTokens: 57_600 })
  })
})

describe('trimming profiles', () => {
  it('are ordered loosest to tightest and end at minimal', () => {
    expect(TRIMMING_PROFILE_IDS).toEqual(['standard', 'compact', 'condensed', 'tight', 'minimal'])
    expect(TRIMMING_PROFILES.map((p) => p.id)).toEqual(TRIMMING_PROFILE_IDS)
  })

  it('step the body 1500 → 800 → 400 → 200 tokens and comments 6 → 2 → 0', () => {
    const [, compact, condensed, tight, minimal] = TRIMMING_PROFILES
    expect([compact, condensed, tight, minimal].map((p) => p.bodyTokens)).toEqual([1_500, 800, 400, 200])
    expect([compact, condensed, tight, minimal].map((p) => p.maxComments)).toEqual([6, 2, 0, 0])
  })

  it('drop the docs index first, then shorten the README', () => {
    const [standard, compact, condensed, tight, minimal] = TRIMMING_PROFILES
    expect(standard.docsIndex).toBe(true)
    expect(compact.docsIndex).toBe(false)
    expect(compact.readmeChars).toBe(standard.readmeChars)
    expect(condensed.readmeChars).toBeLessThan(compact.readmeChars)
    expect(tight.readmeChars).toBeLessThan(condensed.readmeChars)
    expect(minimal.readmeChars).toBeLessThan(tight.readmeChars)
  })

  it('profilesUpTo stops at the configured floor', () => {
    expect(profilesUpTo('condensed').map((p) => p.id)).toEqual(['standard', 'compact', 'condensed'])
    expect(profilesUpTo('minimal')).toHaveLength(5)
  })
})

describe('buildBatchState (composite state)', () => {
  const ctx = {
    ...defaultProjectContext('acme/widgets'),
    description: 'Widgets',
    readmeExcerpt: 'Acme widgets renders widgets.',
    docsIndex: ['api.md'],
  }
  const issues = [fakeIssue(7), fakeIssue(123, { labels: ['enhancement'], body: 'Please add dark mode' })]

  it('holds the project once and one entry per issue with an explicit id, in order', () => {
    const state = buildBatchState(issues, ctx, 'standard', { now })
    expect(Object.keys(state)).toEqual(['project', 'issues'])
    expect(state.issues.map((i) => i.id)).toEqual(['#7', '#123'])
    expect(batchIssueId(123)).toBe('#123')
    expect(JSON.stringify(state).match(/"readme_excerpt"/g)).toHaveLength(1)
  })

  it('matches the snapshot', () => {
    expect(buildBatchState(issues, ctx, 'standard', { now })).toMatchSnapshot()
  })

  it('reuses the per-issue shape of buildIssueState under the standard profile', () => {
    const single = buildIssueState(issues[1], ctx, { now })
    if (!single.ok) throw new Error('expected ok')
    const { number, ...rest } = single.state.issue
    const batched = buildBatchState(issues, ctx, 'standard', { now }).issues[1]
    expect(number).toBe(123)
    expect(batched).toEqual({ id: '#123', ...rest })
    expect(buildBatchState(issues, ctx, 'standard', { now }).project).toEqual(single.state.project)
  })

  it('applies the profile to the body, the comments and the project', () => {
    const [issue] = typicalIssues(1)
    const long = { ...issue, body: 'x'.repeat(20_000) }
    const tight = buildBatchState([long], typicalProjectContext(), 'tight', { now })
    expect(tight.issues[0].body.length).toBeLessThan(1_500)
    expect(tight.issues[0].comments).toEqual([])
    expect(tight.project.docs_index).toEqual([])
    expect(tight.project.readme_excerpt?.length).toBeLessThanOrEqual(1_500)
    const compact = buildBatchState([long], typicalProjectContext(), 'compact', { now })
    expect(compact.issues[0].comments.length).toBeLessThanOrEqual(6)
    expect(compact.project.readme_excerpt?.length).toBe(6_000)
  })
})

describe('planBatches (adaptive fitter)', () => {
  it('puts 22 typical issues in ONE request, stepping down to the profile that fits', () => {
    // Fixture sizes (tests/fakes/typicalIssues.ts): standard and compact need 2 requests.
    expect(plan(typicalIssues(22), { only: 'compact' }).batches).toHaveLength(2)
    const result = plan(typicalIssues(22))
    expect(result.batches).toHaveLength(1)
    expect(result.profile).toBe('condensed')
    expect(result.batches[0].issues.map((i) => i.number)).toEqual(typicalIssues(22).map((i) => i.number))
    expect(result.tooLarge).toEqual([])
  })

  it('keeps a small run at the loosest profile', () => {
    expect(plan(typicalIssues(5)).profile).toBe('standard')
  })

  it('reports the estimated tokens of each batch', () => {
    const [batch] = plan(typicalIssues(5)).batches
    expect(batch.stateTokens).toBe(estimateStateTokens(batch.state))
    expect(batch.questionsTokens).toBe(5 * QUESTIONS.perIssueTokens)
    expect(batch.totalTokens).toBe(batch.stateTokens + batch.questionsTokens)
  })

  it('steps down to a tighter profile before splitting', () => {
    const issues = typicalIssues(40)
    const standard = plan(issues, { only: 'standard' })
    expect(standard.batches.length).toBeGreaterThan(1)
    const adaptive = plan(issues)
    expect(adaptive.batches).toHaveLength(1)
    expect(adaptive.profile).not.toBe('standard')
  })

  it('never goes below the configured floor: it splits instead', () => {
    const issues = typicalIssues(40)
    const floored = plan(issues, { floor: 'standard' })
    expect(floored.profile).toBe('standard')
    expect(floored.batches.length).toBeGreaterThan(1)
  })

  it('splits into the minimum number of requests when even the floor does not fit, keeping order', () => {
    const issues = typicalIssues(130)
    const result = plan(issues)
    // 130 × 950 question tokens alone exceed one 57 600-token request.
    expect(result.batches.length).toBe(3)
    expect(result.batches.flatMap((b) => b.issues.map((i) => i.number))).toEqual(issues.map((i) => i.number))
    for (const batch of result.batches) {
      expect(batch.stateTokens + QUESTIONS.longestQuestionTokens).toBeLessThanOrEqual(DEFAULT_REQUEST_LIMITS.stateTokens)
      expect(batch.totalTokens).toBeLessThanOrEqual(DEFAULT_REQUEST_LIMITS.totalTokens)
    }
  })

  it('uses the loosest profile that keeps the minimum request count', () => {
    const issues = typicalIssues(130)
    const minimal = plan(issues, { only: 'minimal' })
    const result = plan(issues)
    expect(result.batches.length).toBe(minimal.batches.length)
    expect(TRIMMING_PROFILE_IDS.indexOf(result.profile)).toBeLessThanOrEqual(TRIMMING_PROFILE_IDS.indexOf('minimal'))
    const looser = TRIMMING_PROFILE_IDS.slice(0, TRIMMING_PROFILE_IDS.indexOf(result.profile))
    for (const id of looser) expect(plan(issues, { only: id }).batches.length).toBeGreaterThan(result.batches.length)
  })

  it('respects both budgets: state + longest question, and state + all questions', () => {
    const tiny = { stateTokens: 4_000, totalTokens: 9_000 }
    const result = plan(typicalIssues(22), { limits: tiny })
    for (const batch of result.batches) {
      expect(batch.stateTokens + QUESTIONS.longestQuestionTokens).toBeLessThanOrEqual(tiny.stateTokens)
      expect(batch.totalTokens).toBeLessThanOrEqual(tiny.totalTokens)
    }
    expect(result.batches.flatMap((b) => b.issues)).toHaveLength(22)
  })

  it('an issue too large alone, even at the floor profile, fails by itself and is never batched', () => {
    const issues = [fakeIssue(1), fakeIssue(2, { title: 'x'.repeat(20_000) }), fakeIssue(3)]
    const result = planBatches(issues, defaultProjectContext('acme/widgets'), {
      now,
      questions: QUESTIONS,
      limits: { stateTokens: 3_000, totalTokens: 10_000 },
    })
    expect(result.tooLarge.map((i) => i.number)).toEqual([2])
    expect(result.batches.flatMap((b) => b.issues.map((i) => i.number))).toEqual([1, 3])
  })

  it('an empty selection plans no requests', () => {
    expect(plan([])).toMatchObject({ batches: [], tooLarge: [] })
  })
})
