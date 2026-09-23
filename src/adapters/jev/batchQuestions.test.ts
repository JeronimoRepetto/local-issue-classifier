// @vitest-environment node
// Batched classification (docs/batching.md): the five questions per issue,
// namespaced by issue number and pointed at that issue inside `issues`.
import { describe, expect, it } from 'vitest'
import { BATCH_QUESTION_BUDGET, batchQuestions, batchQuestionsFor } from './batchQuestions'
import { QUESTIONS, QUESTIONS_TOKENS } from './questions'
import { batchAnswerId } from '../../domain/classification'
import { estimateTokens } from '../../domain/text'

describe('batchQuestionsFor', () => {
  const qs = batchQuestionsFor(3, 123)

  it('emits the five questions under c_/k_/e_/r_/t_ + issue number', () => {
    expect(Object.keys(qs)).toEqual(['c_123', 'k_123', 'e_123', 'r_123', 't_123'])
    expect(batchAnswerId('complexity', 123)).toBe('c_123')
    expect(batchAnswerId('kind', 9)).toBe('t_9')
  })

  it('points every instruction at the issue by index and id, never at a bare `issue`', () => {
    for (const q of Object.values(qs)) {
      const text = JSON.stringify(q.instructions)
      expect(text).toContain('`issues[3]`')
      expect(text).toContain('#123')
      expect(text).not.toContain('`issue`')
    }
  })

  it('keeps the criteria of the per-issue questions unchanged', () => {
    expect(qs.c_123.criteria).toEqual(QUESTIONS.complexity.criteria)
    expect(qs.k_123.criteria).toEqual(QUESTIONS.criticality.criteria)
    expect(qs.e_123.criteria).toEqual(QUESTIONS.effort.criteria)
    expect(qs.r_123.criteria).toEqual(QUESTIONS.relevance.criteria)
    expect(qs.t_123.criteria).toEqual(QUESTIONS.kind.criteria)
  })

  it('never embeds issue text in the questions', () => {
    expect(JSON.stringify(qs)).not.toMatch(/title|body/i)
  })

  it('matches the snapshot', () => {
    expect(qs).toMatchSnapshot()
  })
})

describe('batchQuestions', () => {
  it('holds five questions per issue, indexed in batch order', () => {
    const qs = batchQuestions([7, 123])
    expect(Object.keys(qs)).toHaveLength(10)
    expect(JSON.stringify(qs.c_7.instructions)).toContain('`issues[0]`')
    expect(JSON.stringify(qs.c_123.instructions)).toContain('`issues[1]`')
  })
})

describe('BATCH_QUESTION_BUDGET', () => {
  it('bounds the per-issue question tokens from above', () => {
    const real = estimateTokens(JSON.stringify(batchQuestions(Array.from({ length: 50 }, (_, i) => 100_000 + i))))
    expect(BATCH_QUESTION_BUDGET.perIssueTokens * 50).toBeGreaterThanOrEqual(real)
    expect(BATCH_QUESTION_BUDGET.perIssueTokens).toBeGreaterThan(QUESTIONS_TOKENS)
    expect(BATCH_QUESTION_BUDGET.perIssueTokens).toBeLessThan(QUESTIONS_TOKENS + 150)
  })

  it('knows the longest single question', () => {
    const longest = Math.max(...Object.values(batchQuestionsFor(9_999, 9_999_999)).map((q) => estimateTokens(JSON.stringify(q))))
    expect(BATCH_QUESTION_BUDGET.longestQuestionTokens).toBe(longest)
  })
})
