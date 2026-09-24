// Jev rejects a request whose JSON holds a lone surrogate or other invalid text
// with 400 api_usage_error "Request contains invalid Unicode text.". Every cut of
// user text (body, comments, README, CONTRIBUTING) must therefore stay on a code
// point boundary, and the built states must be sanitized before they are sent.
import { describe, expect, it } from 'vitest'
import { buildBatchState, planBatches, TRIMMING_PROFILE_IDS } from './jevBatchState'
import { buildIssueState } from './jevState'
import { buildProjectContext } from './projectContext'
import { attachComments, trimStoredBody } from '../adapters/github/mappers'
import { defaultProjectContext, type Issue, type IssueComment, type ProjectContext } from './types'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'

const NOW = new Date('2026-09-23T00:00:00Z')
const now = () => NOW

// Code points built numerically so no editor or tool ever rewrites the escapes.
const EMOJI = String.fromCodePoint(0x1f600)
const HIGH = String.fromCharCode(0xd83d)
const BELL = String.fromCharCode(0x07)

/** Emoji-only text of about `units` UTF-16 code units, shifted by one unit when `odd`. */
const emojiText = (units: number, odd: boolean) => (odd ? 'x' : '') + EMOJI.repeat(Math.ceil(units / 2))

function comment(id: number, body: string): IssueComment {
  return { id, author: `user${id}`, authorAssociation: 'CONTRIBUTOR', createdAt: '2026-01-01T00:00:00Z', body }
}

function emojiIssue(number: number, odd: boolean): Issue {
  return fakeIssue(number, {
    body: emojiText(20_000, odd),
    comments: Array.from({ length: 10 }, (_, i) => comment(i + 1, emojiText(3_000, odd))),
    commentCount: 10,
    commentsFetched: true,
  })
}

function emojiContext(odd: boolean): ProjectContext {
  return {
    ...defaultProjectContext('acme/widgets'),
    readmeExcerpt: emojiText(7_000, odd),
    contributingExcerpt: emojiText(2_000, odd),
  }
}

/**
 * Every string inside `value` is well-formed. Checking `JSON.stringify(value)` is
 * not enough: it escapes a lone surrogate as a `\uD83D`-style sequence, which is
 * valid JSON text, but the server decodes it back into the invalid code unit.
 */
function wellFormed(value: unknown): boolean {
  if (typeof value === 'string') return value.isWellFormed()
  if (Array.isArray(value)) return value.every(wellFormed)
  if (value && typeof value === 'object') return Object.values(value).every(wellFormed)
  return true
}

describe('state builders never split a surrogate pair', () => {
  for (const odd of [false, true]) {
    it(`buildBatchState is well-formed at every trimming profile (${odd ? 'odd' : 'even'} offset)`, () => {
      for (const profile of TRIMMING_PROFILE_IDS) {
        const state = buildBatchState([emojiIssue(1, odd)], emojiContext(odd), profile, { now })
        expect(wellFormed(state), profile).toBe(true)
      }
    })

    it(`buildIssueState is well-formed, including its reduced trims (${odd ? 'odd' : 'even'} offset)`, () => {
      for (const maxStateTokens of [12_000, 3_000]) {
        const result = buildIssueState(emojiIssue(1, odd), emojiContext(odd), { now, maxStateTokens })
        if (result.ok) expect(wellFormed(result.state)).toBe(true)
      }
    })

    it(`stored bodies, stored comments and project excerpts are well-formed (${odd ? 'odd' : 'even'} offset)`, () => {
      expect(trimStoredBody(emojiText(20_000, odd)).isWellFormed()).toBe(true)
      const raw = { id: 1, user: { login: 'a' }, created_at: '2026-01-01T00:00:00Z', body: emojiText(3_000, odd) }
      const stored = attachComments(fakeIssue(1, { commentCount: 1 }), [raw], 8)
      expect(stored.comments[0].body.isWellFormed()).toBe(true)
      const ctx = buildProjectContext(fakeRepo(), {
        readme: emojiText(20_000, odd),
        contributing: emojiText(5_000, odd),
        docs: null,
        manifest: null,
      })
      expect(wellFormed(ctx)).toBe(true)
    })
  }
})

describe('state builders sanitize text that is already invalid', () => {
  const dirty = (number: number) =>
    fakeIssue(number, {
      title: `Title ${HIGH} ${BELL}`,
      body: `Body ${HIGH} with a bell ${BELL} and ${EMOJI}`,
      labels: [`label${BELL}`],
      comments: [comment(1, `A long enough comment ${HIGH}${BELL}`)],
      commentCount: 1,
      commentsFetched: true,
    })
  const ctx = { ...defaultProjectContext('acme/widgets'), readmeExcerpt: `Readme ${HIGH}${BELL}` }

  it('buildIssueState replaces lone surrogates and drops control characters', () => {
    const result = buildIssueState(dirty(1), ctx, { now })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const json = JSON.stringify(result.state)
    expect(wellFormed(result.state)).toBe(true)
    expect(json).not.toContain('\\u0007')
    expect(result.state.issue.body).toContain(EMOJI)
  })

  it('buildBatchState and the planned batches do the same', () => {
    for (const profile of TRIMMING_PROFILE_IDS) {
      const state = buildBatchState([dirty(1), dirty(2)], ctx, profile, { now })
      const json = JSON.stringify(state)
      expect(wellFormed(state), profile).toBe(true)
      expect(json, profile).not.toContain('\\u0007')
    }
    const plan = planBatches([dirty(1), dirty(2)], ctx, {
      now,
      questions: { perIssueTokens: 950, longestQuestionTokens: 300 },
    })
    expect(plan.batches.every((b) => wellFormed(b.state))).toBe(true)
  })
})
