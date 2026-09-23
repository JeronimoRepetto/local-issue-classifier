// Synthetic fixtures for analysis tests. No real personal data.
import type { Classification, Issue, Repo } from '../../src/domain/types'

export function fakeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    ref: { owner: 'acme', repo: 'widgets' },
    fullName: 'acme/widgets',
    description: 'Synthetic widgets repository',
    topics: ['widgets'],
    defaultBranch: 'main',
    isPrivate: false,
    hasIssues: true,
    openIssuesCount: 3,
    htmlUrl: 'https://github.com/acme/widgets',
    ...overrides,
  }
}

export function fakeIssue(number: number, overrides: Partial<Issue> = {}): Issue {
  return {
    number,
    title: `Issue ${number}`,
    body: `Body of issue ${number}`,
    state: 'open',
    stateReason: null,
    labels: ['bug'],
    author: 'octo',
    authorAssociation: 'NONE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    closedAt: null,
    commentCount: 0,
    comments: [],
    commentsTruncated: false,
    commentsFetched: false,
    reactionsTotal: 0,
    htmlUrl: `https://github.com/acme/widgets/issues/${number}`,
    ...overrides,
  }
}

export function fakeClassification(overrides: Partial<Classification> = {}): Classification {
  const dim = { level: 'medium' as const, score: 1, confidence: 0.8, probabilities: [0.1, 0.8, 0.1] as [number, number, number] }
  return {
    complexity: { ...dim },
    criticality: { ...dim, level: 'high', score: 2 },
    effort: { ...dim, level: 'low', score: 0 },
    relevance: { value: 75, score: 3, confidence: 0.7, probabilities: [0, 0.1, 0.1, 0.7, 0.1] },
    kind: { choice: 'bug', confidence: 0.9 },
    minConfidence: 0.7,
    model: 'jev-1.13.0',
    questionsVersion: 1,
    issueUpdatedAt: '2026-01-02T00:00:00Z',
    classifiedAt: '2026-02-01T00:00:00Z',
    inputTokens: 1200,
    ...overrides,
  }
}

/** Recursively freezes a value so any mutation in the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}
