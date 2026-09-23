// Synthetic "typical repository" fixtures for batching tests and the
// docs/batching.md table. Deterministic (seeded), no real personal data.
// Sizes follow what a mid-sized GitHub repository usually shows: most bodies
// are a few hundred to a few thousand characters, a few are long logs, and
// comments are fetched (a token is present) with 0..10 per issue.
import type { Issue, IssueComment, ProjectContext } from '../../src/domain/types'
import { defaultProjectContext } from '../../src/domain/types'
import { seededRandom } from './seededRandom'

const WORDS =
  'render widget list crash when empty option ignored platform config build error stack trace version upgrade regression expected actual behavior steps reproduce install docs typo feature request plugin api timeout memory leak'.split(
    ' ',
  )

function prose(random: () => number, chars: number): string {
  let text = ''
  while (text.length < chars) text += `${WORDS[Math.floor(random() * WORDS.length)]} `
  return text.slice(0, chars).trim()
}

/** A project context near the §4.3 budgets: README 6 000 chars, 30 docs entries. */
export function typicalProjectContext(): ProjectContext {
  const random = seededRandom(7)
  return {
    ...defaultProjectContext('acme/widgets'),
    description: 'Fast widget renderer for Vue',
    topics: ['vue', 'rendering', 'widgets'],
    manifest: { source: 'package.json', name: 'acme-widgets', description: 'Widgets for Vue' },
    readmeExcerpt: prose(random, 6_000),
    contributingExcerpt: prose(random, 1_500),
    docsIndex: Array.from({ length: 30 }, (_, i) => `guide/page-${i + 1}.md`),
  }
}

/** Body length distribution (chars): mostly short, some medium, a couple of long logs. */
const BODY_SIZES = [300, 600, 900, 1_200, 1_500, 2_000, 2_500, 3_500, 5_000, 9_000]

/** `count` issues (default 22, the size the user measured) with seeded sizes. */
export function typicalIssues(count = 22, seed = 42): Issue[] {
  const random = seededRandom(seed)
  return Array.from({ length: count }, (_, i) => {
    const number = 100 + i
    const commentCount = Math.floor(random() * 11)
    const comments: IssueComment[] = Array.from({ length: commentCount }, (_, c) => ({
      id: number * 100 + c,
      author: `user${c}`,
      authorAssociation: c === 0 ? 'MEMBER' : 'CONTRIBUTOR',
      createdAt: '2026-09-01T00:00:00Z',
      body: prose(random, 120 + Math.floor(random() * 700)),
    }))
    return {
      number,
      title: `Synthetic issue ${number}: ${prose(random, 50)}`,
      body: prose(random, BODY_SIZES[Math.floor(random() * BODY_SIZES.length)]),
      state: 'open',
      stateReason: null,
      labels: random() < 0.5 ? ['bug'] : ['enhancement', 'help wanted'],
      author: 'octo',
      authorAssociation: 'NONE',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      closedAt: null,
      commentCount,
      comments,
      commentsTruncated: false,
      commentsFetched: true,
      reactionsTotal: Math.floor(random() * 10),
      htmlUrl: `https://github.com/acme/widgets/issues/${number}`,
    }
  })
}
