// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { QUESTIONS, QUESTIONS_TOKENS, QUESTIONS_VERSION, QUESTION_IDS } from './questions'
import { estimateTokens } from '../../domain/text'
import { ISSUE_KINDS } from '../../domain/classification'
import { batchQuestionsFor } from './batchQuestions'

/**
 * Version guard. Each QUESTIONS_VERSION maps to the SHA-256 of the serialized
 * QUESTIONS it shipped with. Editing any question text without bumping the
 * version fails here. After a bump, add the new version's hash below and never
 * edit an old entry. A bump marks stored classifications stale.
 */
const QUESTIONS_HASHES: Record<number, string> = {
  1: '16bd2149f518fb3218c03dfd085e0dee49c491df8e3fb9520c9c12c753397a69',
  // v2: batched classification adds the namespaced per-issue questions (docs/batching.md).
  2: '2bf992e6619f6efff34ea29c855d2abd7880671a61be5da5878278143fa7fd48',
}

/** From v2 on, the guard covers the per-issue questions AND the batched template. */
const versioned = () => ({ questions: QUESTIONS, batched: batchQuestionsFor(0, 123) })

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

describe('QUESTIONS', () => {
  it('is pinned to its version: a text change needs a QUESTIONS_VERSION bump', () => {
    expect(QUESTIONS_VERSION).toBe(2)
    expect(hash(versioned()), 'questions changed: bump QUESTIONS_VERSION').toBe(
      QUESTIONS_HASHES[QUESTIONS_VERSION],
    )
  })

  it('matches the snapshot', () => {
    expect(QUESTIONS).toMatchSnapshot()
  })

  it('asks the five questions in a stable order', () => {
    expect(QUESTION_IDS).toEqual(['complexity', 'criticality', 'effort', 'relevance', 'kind'])
    expect(Object.keys(QUESTIONS)).toEqual(QUESTION_IDS)
  })

  it('uses 3-level Scores with descriptive what/examples levels for the three spectra', () => {
    for (const id of ['complexity', 'criticality', 'effort'] as const) {
      const q = QUESTIONS[id]
      expect(q.type).toBe('score')
      expect(q.criteria).toHaveLength(3)
      for (const level of q.criteria) {
        expect(Object.keys(level)).toEqual(['what', 'examples'])
        expect(level.examples.length).toBeGreaterThan(0)
      }
    }
  })

  it('uses a 5-level Score for relevance and a Choice for kind', () => {
    expect(QUESTIONS.relevance.type).toBe('score')
    expect(QUESTIONS.relevance.criteria).toHaveLength(5)
    expect(QUESTIONS.kind.type).toBe('choice')
    expect(Object.keys(QUESTIONS.kind.criteria)).toEqual([
      'bug',
      'feature',
      'documentation',
      'question',
      'maintenance',
      'other',
    ])
  })

  it('keeps the kind options in sync with the mapping in domain/classification.ts', () => {
    expect(Object.keys(QUESTIONS.kind.criteria)).toEqual(ISSUE_KINDS)
  })

  it('points every question at `issue` in the state', () => {
    for (const q of Object.values(QUESTIONS)) {
      expect(JSON.stringify(q.instructions)).toContain('`issue`')
    }
  })

  it('exposes the token estimate of the serialized questions (about 900, §4.7)', () => {
    expect(QUESTIONS_TOKENS).toBe(estimateTokens(JSON.stringify(QUESTIONS)))
    expect(QUESTIONS_TOKENS).toBeGreaterThan(600)
    expect(QUESTIONS_TOKENS).toBeLessThan(1_200)
  })
})
