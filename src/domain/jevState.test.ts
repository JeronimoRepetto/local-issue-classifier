import { describe, expect, it } from 'vitest'
import {
  buildIssueState,
  selectComments,
  toJevProject,
  MAX_STATE_TOKENS,
  TOO_LARGE_MESSAGE,
  type BuildIssueStateOptions,
  type JevState,
} from './jevState'
import { estimateStateTokens } from './estimate'
import { defaultProjectContext, type Issue, type IssueComment, type ProjectContext } from './types'

const NOW = new Date('2026-09-23T00:00:00Z')
const now = () => NOW
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString()

function comment(
  id: number,
  body = `Comment number ${id} with enough text`,
  author = `user${id}`,
): IssueComment {
  return { id, author, authorAssociation: 'CONTRIBUTOR', createdAt: daysAgo(1), body }
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 812,
    title: 'Crash when rendering empty list',
    body: 'Steps to reproduce: render an empty list.',
    state: 'open',
    stateReason: null,
    labels: ['bug'],
    author: 'alice',
    authorAssociation: 'NONE',
    createdAt: daysAgo(10),
    updatedAt: daysAgo(2),
    closedAt: null,
    commentCount: 1,
    comments: [{ ...comment(1, 'Confirmed on 2.3'), authorAssociation: 'MEMBER' }],
    commentsTruncated: false,
    commentsFetched: true,
    reactionsTotal: 5,
    htmlUrl: 'https://github.com/acme/widgets/issues/812',
    ...overrides,
  }
}

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    ...defaultProjectContext('acme/widgets'),
    description: 'Fast widget renderer for Vue',
    topics: ['vue', 'rendering'],
    manifest: { source: 'package.json', name: 'acme-widgets', description: 'Widgets' },
    readmeExcerpt: 'Acme widgets renders widgets.',
    contributingExcerpt: null,
    docsIndex: ['api.md', 'guide/'],
    ...overrides,
  }
}

const opts: BuildIssueStateOptions = { now }

function okState(issue: Issue, ctx: ProjectContext, o: Partial<BuildIssueStateOptions> = {}) {
  const result = buildIssueState(issue, ctx, { ...opts, ...o })
  if (!result.ok) throw new Error(`expected ok, got ${result.error.message}`)
  return result
}

describe('buildIssueState: shape (SPEC §4.3 / §4.6)', () => {
  it('produces exactly the §4.3 project and issue fields', () => {
    const { state } = okState(makeIssue(), makeContext())
    expect(state).toEqual({
      project: {
        name: 'acme/widgets',
        description: 'Fast widget renderer for Vue',
        topics: ['vue', 'rendering'],
        package: { name: 'acme-widgets', description: 'Widgets' },
        readme_excerpt: 'Acme widgets renders widgets.',
        contributing_excerpt: null,
        docs_index: ['api.md', 'guide/'],
      },
      issue: {
        number: 812,
        title: 'Crash when rendering empty list',
        state: 'open',
        labels: ['bug'],
        author_role: 'none',
        age: '1 to 4 weeks',
        last_activity: 'less than a week',
        comment_count: 1,
        reactions: 5,
        body: 'Steps to reproduce: render an empty list.',
        comments: [{ author_role: 'member', body: 'Confirmed on 2.3' }],
        comments_note: null,
      },
    })
  })

  it('reports the estimated token count of the returned state', () => {
    const result = okState(makeIssue(), makeContext())
    expect(result.estimatedTokens).toBe(estimateStateTokens(result.state))
  })

  it('maps a missing manifest to package: null', () => {
    const project = toJevProject(defaultProjectContext('acme/widgets'))
    expect(project.package).toBeNull()
    expect(project.readme_excerpt).toBeNull()
  })

  it('applies the project budgets: README 6 000, CONTRIBUTING 1 500, docs index 40', () => {
    const project = toJevProject(
      makeContext({
        readmeExcerpt: 'r'.repeat(9_000),
        contributingExcerpt: 'c'.repeat(2_000),
        docsIndex: Array.from({ length: 50 }, (_, i) => `doc${i}.md`),
      }),
    )
    expect(project.readme_excerpt).toBe('r'.repeat(6_000))
    expect(project.contributing_excerpt).toBe('c'.repeat(1_500))
    expect(project.docs_index).toHaveLength(40)
    expect(project.docs_index[39]).toBe('doc39.md')
  })

  it('keeps a body up to 8 000 chars and otherwise keeps first 6 000 + last 1 500', () => {
    const fits = 'a'.repeat(8_000)
    expect(okState(makeIssue({ body: fits }), makeContext()).state.issue.body).toBe(fits)

    const long = 'h'.repeat(6_000) + 'm'.repeat(3_000) + 't'.repeat(1_500)
    const body = okState(makeIssue({ body: long }), makeContext()).state.issue.body
    expect(body).toBe(`${'h'.repeat(6_000)}\n[… 3000 characters omitted …]\n${'t'.repeat(1_500)}`)
  })
})

describe('buildIssueState: dates are bucketed, never raw', () => {
  it.each([
    [3, 'less than a week'],
    [20, '1 to 4 weeks'],
    [60, '1 to 3 months'],
    [200, '3 to 12 months'],
    [500, '1 to 3 years'],
    [2_000, 'more than 3 years'],
  ])('created %i days ago gives %s', (days, bucket) => {
    const { state } = okState(
      makeIssue({ createdAt: daysAgo(days), updatedAt: daysAgo(days) }),
      makeContext(),
    )
    expect(state.issue.age).toBe(bucket)
    expect(state.issue.last_activity).toBe(bucket)
  })

  it('contains no ISO date anywhere in the state', () => {
    const { state } = okState(makeIssue(), makeContext())
    expect(JSON.stringify(state)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

describe('selectComments: first 2 + last 6, bots and "+1" dropped', () => {
  it('keeps every comment when they fit', () => {
    const list = [comment(1), comment(2), comment(3)]
    const sel = selectComments(list, 3, 8)
    expect(sel.comments.map((c) => c.body)).toEqual(list.map((c) => c.body))
    expect(sel.note).toBeNull()
  })

  it('keeps the first 2 and last 6 of 42 and explains it in the note', () => {
    const list = Array.from({ length: 42 }, (_, i) => comment(i + 1))
    const sel = selectComments(list, 42, 8)
    expect(sel.comments.map((c) => c.body)).toEqual(
      [1, 2, 37, 38, 39, 40, 41, 42].map((i) => `Comment number ${i} with enough text`),
    )
    expect(sel.note).toBe('showing 8 of 42 comments (first 2 and last 6)')
  })

  it('drops [bot] authors and bodies under 10 characters', () => {
    const list = [
      comment(1, 'Real comment about the crash'),
      comment(2, 'Automated triage message here', 'github-actions[bot]'),
      comment(3, '+1'),
      comment(4, '   same    '),
      comment(5, 'Another real comment here'),
    ]
    const sel = selectComments(list, 5, 8)
    expect(sel.comments.map((c) => c.body)).toEqual([
      'Real comment about the crash',
      'Another real comment here',
    ])
    expect(sel.note).toBe('showing 2 of 5 comments')
  })

  it('trims each selected comment to 1 000 characters', () => {
    const sel = selectComments([comment(1, 'x'.repeat(1_500))], 1, 8)
    expect(sel.comments[0].body).toHaveLength(1_000)
  })

  it('lower-cases the author role', () => {
    const sel = selectComments([{ ...comment(1), authorAssociation: 'OWNER' }], 1, 8)
    expect(sel.comments[0].author_role).toBe('owner')
  })

  it('says when comments were not fetched', () => {
    const { state } = okState(
      makeIssue({ comments: [], commentCount: 4, commentsFetched: false }),
      makeContext(),
    )
    expect(state.issue.comments).toEqual([])
    expect(state.issue.comments_note).toBe('comments not loaded (4 on GitHub)')
  })
})

describe('buildIssueState: size guard and trimming order', () => {
  // A small maxStateTokens makes every trimming stage observable without huge fixtures.
  const tenComments = Array.from({ length: 10 }, (_, i) =>
    comment(i + 1, `${i + 1}:`.padEnd(900, 'c')),
  )
  const bigIssue = makeIssue({ body: 'b'.repeat(7_000), comments: tenComments, commentCount: 10 })
  const bigCtx = makeContext({ readmeExcerpt: 'r'.repeat(6_000) })

  function tokensWith(mutate: (s: JevState) => void): number {
    const { state } = okState(bigIssue, bigCtx, { maxStateTokens: Number.MAX_SAFE_INTEGER })
    mutate(state)
    return estimateStateTokens(state)
  }

  it('the guard defaults to 12 000 estimated tokens', () => {
    expect(MAX_STATE_TOKENS).toBe(12_000)
  })

  it('1. removes comments from the middle first, leaving body and README alone', () => {
    const full = tokensWith(() => {})
    const { state } = okState(bigIssue, bigCtx, { maxStateTokens: full - 300 })
    const kept = state.issue.comments.map((c) => c.body.split(':')[0])
    expect(kept.length).toBeLessThan(8)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept[0]).toBe('1')
    expect(kept[kept.length - 1]).toBe('10')
    expect(state.issue.body).toHaveLength(7_000)
    expect(state.project.readme_excerpt).toHaveLength(6_000)
    expect(state.issue.comments_note).toMatch(
      /^showing \d of 10 comments \(first \d and last \d\)$/,
    )
  })

  it('2. then cuts the body to 4 000 kept chars, leaving the README alone', () => {
    const noComments = tokensWith((s) => {
      s.issue.comments = []
    })
    const { state } = okState(bigIssue, bigCtx, { maxStateTokens: noComments - 500 })
    expect(state.issue.comments).toEqual([])
    expect(state.issue.body.replace(/\n\[… \d+ characters omitted …\]\n/, '')).toHaveLength(4_000)
    expect(state.project.readme_excerpt).toHaveLength(6_000)
  })

  it('3. then cuts the README to 3 000 chars', () => {
    const cutBody = tokensWith((s) => {
      s.issue.comments = []
      s.issue.body = 'b'.repeat(4_040)
    })
    const { state } = okState(bigIssue, bigCtx, { maxStateTokens: cutBody - 500 })
    expect(state.project.readme_excerpt).toHaveLength(3_000)
  })

  it('4. returns the typed too-large error when trimming is not enough', () => {
    const result = buildIssueState(bigIssue, bigCtx, { now, maxStateTokens: 500 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('too-large')
    expect(result.error.message).toBe(TOO_LARGE_MESSAGE)
    expect(TOO_LARGE_MESSAGE).toBe('Issue too large even after trimming')
    expect(result.error.estimatedTokens).toBeGreaterThan(500)
  })

  it('enforces the default 12k budget on a pathological issue (huge title)', () => {
    const result = buildIssueState(makeIssue({ title: 't'.repeat(50_000) }), makeContext(), opts)
    expect(result.ok).toBe(false)
  })

  it('never returns a state above the budget', () => {
    for (const budget of [2_000, 3_000, 4_000, 6_000, 12_000]) {
      const result = buildIssueState(bigIssue, bigCtx, { now, maxStateTokens: budget })
      if (result.ok) expect(result.estimatedTokens).toBeLessThanOrEqual(budget)
    }
  })

  it('does not mutate its inputs', () => {
    const issue = structuredClone(bigIssue)
    const ctx = structuredClone(bigCtx)
    buildIssueState(Object.freeze(issue), Object.freeze(ctx), { now, maxStateTokens: 2_000 })
    expect(issue).toEqual(bigIssue)
    expect(ctx).toEqual(bigCtx)
  })
})
