import { describe, expect, it } from 'vitest'
import {
  toClassification,
  toBatchClassifications,
  isClassificationCurrent,
  levelOf,
  relevanceValue,
  ISSUE_KINDS,
  UnexpectedJevResponseError,
  UNEXPECTED_JEV_RESPONSE,
  type ClassificationMeta,
} from './classification'

const meta: ClassificationMeta = {
  requestedModel: 'jev-latest',
  questionsVersion: 1,
  issueUpdatedAt: '2026-09-01T00:00:00Z',
  classifiedAt: '2026-09-23T00:00:00Z',
}

const score3 = (score: number, confidence: number | null = 0.8) => ({
  type: 'score',
  score,
  legend: { '0': 'a', '1': 'b', '2': 'c' },
  probabilities: { '0': 0.1, '1': 0.2, '2': 0.7 },
  ...(confidence === null ? {} : { confidence }),
})

function response(overrides: Record<string, unknown> = {}, top: Record<string, unknown> = {}) {
  return {
    model: 'jev-1.13.0',
    answers: {
      complexity: score3(1.2, 0.7),
      criticality: score3(1.6, 0.9),
      effort: score3(0.4, 0.6),
      relevance: {
        type: 'score',
        score: 3.1,
        legend: {},
        probabilities: { '0': 0, '1': 0.05, '2': 0.1, '3': 0.5, '4': 0.35 },
        confidence: 0.55,
      },
      kind: { type: 'choice', choice: 'bug', probabilities: { bug: 0.9, other: 0.1 }, confidence: 0.2 },
      ...overrides,
    },
    usage: { input_tokens: 4012, output_tokens: 40 },
    ...top,
  }
}

describe('levelOf / relevanceValue', () => {
  it.each([
    [0, 'low'],
    [0.49, 'low'],
    [0.5, 'medium'],
    [1.49, 'medium'],
    [1.5, 'high'],
    [2, 'high'],
    [-0.3, 'low'],
    [2.7, 'high'],
  ])('round(%f) gives %s', (score, level) => {
    expect(levelOf(score)).toBe(level)
  })

  it.each([
    [0, 0],
    [1, 25],
    [2, 50],
    [3, 75],
    [4, 100],
    [3.1, 78],
    [4.4, 100],
  ])('relevance score %f gives %i', (score, value) => {
    expect(relevanceValue(score)).toBe(value)
  })
})

describe('toClassification', () => {
  it('maps a full response', () => {
    const c = toClassification(response(), meta)
    expect(c.complexity).toEqual({ level: 'medium', score: 1.2, confidence: 0.7, probabilities: [0.1, 0.2, 0.7] })
    expect(c.criticality.level).toBe('high')
    expect(c.effort.level).toBe('low')
    expect(c.relevance).toEqual({
      value: 78,
      score: 3.1,
      confidence: 0.55,
      probabilities: [0, 0.05, 0.1, 0.5, 0.35],
    })
    expect(c.kind).toEqual({ choice: 'bug', confidence: 0.2 })
    expect(c.minConfidence).toBe(0.55) // kind (0.2) is excluded
    expect(c.inputTokens).toBe(4012)
    expect(c.questionsVersion).toBe(1)
    expect(c.issueUpdatedAt).toBe(meta.issueUpdatedAt)
    expect(c.classifiedAt).toBe(meta.classifiedAt)
    expect(c.model).toBe('jev-1.13.0')
  })

  it('treats confidence as optional: absent gives undefined, min over the rest', () => {
    const c = toClassification(
      response({ complexity: score3(1, null), effort: score3(1, null) }),
      meta,
    )
    expect(c.complexity.confidence).toBeUndefined()
    expect(c.minConfidence).toBe(0.55)
  })

  it('leaves minConfidence undefined when no main dimension has a confidence', () => {
    const noConf = (a: Record<string, unknown>) => {
      const { confidence: _c, ...rest } = a
      return rest
    }
    const r = response()
    const answers = r.answers as Record<string, Record<string, unknown>>
    const c = toClassification(
      {
        ...r,
        answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, noConf(v)])),
      },
      meta,
    )
    expect(c.minConfidence).toBeUndefined()
    expect(c.kind.confidence).toBeUndefined()
  })

  it('does not depend on the echoed model: falls back to the requested model', () => {
    const { model: _m, ...withoutModel } = response()
    expect(toClassification(withoutModel, meta).model).toBe('jev-latest')
    expect(toClassification(response({}, { model: 42 }), meta).model).toBe('jev-latest')
  })

  it('defaults inputTokens to 0 when usage is absent', () => {
    const { usage: _u, ...withoutUsage } = response()
    expect(toClassification(withoutUsage, meta).inputTokens).toBe(0)
  })

  it('knows the six issue kinds', () => {
    expect(ISSUE_KINDS).toEqual(['bug', 'feature', 'documentation', 'question', 'maintenance', 'other'])
  })
})

describe('toClassification: malformed responses fail as a whole', () => {
  const cases: [string, unknown][] = [
    ['not an object', 'oops'],
    ['null', null],
    ['no answers', { model: 'x' }],
    ['missing answer id', response({ effort: undefined })],
    ['wrong answer type', response({ criticality: { ...score3(1), type: 'choice' } })],
    ['score not a number', response({ complexity: { ...score3(1), score: '1' } })],
    ['score NaN', response({ complexity: { ...score3(1), score: Number.NaN } })],
    ['probabilities wrong length', response({ effort: { ...score3(1), probabilities: { '0': 0.5, '1': 0.5 } } })],
    ['probabilities wrong keys', response({ effort: { ...score3(1), probabilities: { a: 0.2, b: 0.3, c: 0.5 } } })],
    ['probability not a number', response({ effort: { ...score3(1), probabilities: { '0': 0.2, '1': 'x', '2': 0.5 } } })],
    ['relevance with 3 levels', response({ relevance: score3(1) })],
    ['unknown kind', response({ kind: { type: 'choice', choice: 'rant', probabilities: {}, confidence: 1 } })],
    ['confidence not a number', response({ complexity: { ...score3(1), confidence: 'high' } })],
  ]

  it.each(cases)('%s gives UnexpectedJevResponseError', (_name, input) => {
    expect(() => toClassification(input, meta)).toThrow(UnexpectedJevResponseError)
    try {
      toClassification(input, meta)
    } catch (error) {
      expect((error as Error).message).toBe(UNEXPECTED_JEV_RESPONSE)
      expect(UNEXPECTED_JEV_RESPONSE).toBe('Unexpected Jev response')
    }
  })
})

describe('isClassificationCurrent — validity', () => {
  const c = toClassification(response(), meta)
  it('is current only for the same issue update and questions version', () => {
    expect(isClassificationCurrent(c, meta.issueUpdatedAt, 1)).toBe(true)
    expect(isClassificationCurrent(c, '2026-09-10T00:00:00Z', 1)).toBe(false)
    expect(isClassificationCurrent(c, meta.issueUpdatedAt, 2)).toBe(false)
  })
})

// ── Batched responses (docs/batching.md) ─────────────────────────────
describe('toBatchClassifications', () => {
  const entries = [
    { issueNumber: 7, issueUpdatedAt: '2026-09-01T00:00:00Z' },
    { issueNumber: 123, issueUpdatedAt: '2026-09-02T00:00:00Z' },
    { issueNumber: 9, issueUpdatedAt: '2026-09-03T00:00:00Z' },
  ]
  const batchMeta = { requestedModel: 'jev-latest', questionsVersion: 2, classifiedAt: '2026-09-23T00:00:00Z' }
  const ids = (n: number) => ({
    [`c_${n}`]: score3(0.2),
    [`k_${n}`]: score3(n === 123 ? 2 : 1),
    [`e_${n}`]: score3(1),
    [`r_${n}`]: { type: 'score', score: 4, probabilities: { '0': 0, '1': 0, '2': 0, '3': 0.2, '4': 0.8 }, confidence: 0.9 },
    [`t_${n}`]: { type: 'choice', choice: n === 9 ? 'feature' : 'bug', confidence: 0.7 },
  })
  const body = (answers: Record<string, unknown>, inputTokens = 1_000) => ({
    model: 'jev-1.13.0',
    answers,
    usage: { input_tokens: inputTokens },
  })

  it('splits the answers back per issue by id suffix', () => {
    const result = toBatchClassifications(body({ ...ids(7), ...ids(123), ...ids(9) }), entries, batchMeta)
    expect([...result.keys()]).toEqual([7, 123, 9])
    const c123 = result.get(123)
    expect(c123?.ok).toBe(true)
    if (c123?.ok) {
      expect(c123.classification.criticality.level).toBe('high')
      expect(c123.classification.issueUpdatedAt).toBe('2026-09-02T00:00:00Z')
      expect(c123.classification.questionsVersion).toBe(2)
      expect(c123.classification.model).toBe('jev-1.13.0')
    }
    const c9 = result.get(9)
    expect(c9?.ok && c9.classification.kind.choice).toBe('feature')
  })

  it('splits the request usage across issues so the total is preserved', () => {
    const result = toBatchClassifications(body({ ...ids(7), ...ids(123), ...ids(9) }, 1_000), entries, batchMeta)
    const tokens = [...result.values()].map((o) => (o.ok ? o.classification.inputTokens : 0))
    expect(tokens.reduce((a, b) => a + b, 0)).toBe(1_000)
    expect(Math.max(...tokens) - Math.min(...tokens)).toBeLessThanOrEqual(1)
  })

  it('a missing subset fails only that issue', () => {
    const answers: Record<string, unknown> = { ...ids(7), ...ids(123), ...ids(9) }
    delete answers.r_123
    const result = toBatchClassifications(body(answers), entries, batchMeta)
    expect(result.get(123)).toEqual({ ok: false, error: UNEXPECTED_JEV_RESPONSE })
    expect(result.get(7)?.ok).toBe(true)
    expect(result.get(9)?.ok).toBe(true)
  })

  it('a malformed subset fails only that issue', () => {
    const answers = { ...ids(7), ...ids(123), ...ids(9), t_7: { type: 'choice', choice: 'nonsense' } }
    const result = toBatchClassifications(body(answers), entries, batchMeta)
    expect(result.get(7)).toEqual({ ok: false, error: UNEXPECTED_JEV_RESPONSE })
    expect([result.get(123)?.ok, result.get(9)?.ok]).toEqual([true, true])
  })

  it('a body without answers fails each issue individually, never throws', () => {
    const result = toBatchClassifications({ nope: true }, entries, batchMeta)
    expect([...result.values()]).toEqual(entries.map(() => ({ ok: false, error: UNEXPECTED_JEV_RESPONSE })))
  })

  it('ignores answers for issues outside the batch', () => {
    const result = toBatchClassifications(body({ ...ids(7), ...ids(555) }), entries.slice(0, 1), batchMeta)
    expect([...result.keys()]).toEqual([7])
  })
})
