// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BODY_BUDGET,
  COMMENT_BUDGET,
  attachComments,
  mapIssue,
  mapRepo,
  selectComments,
  trimStoredBody,
  type GitHubComment,
  type GitHubIssue,
} from './mappers'

const rawIssue = (over: Partial<GitHubIssue> = {}): GitHubIssue => ({
  number: 7,
  title: 'Widget breaks',
  body: 'It breaks.',
  state: 'open',
  state_reason: null,
  labels: [{ name: 'bug' }, 'regression'],
  user: { login: 'alice-example', type: 'User' },
  author_association: 'CONTRIBUTOR',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  closed_at: null,
  comments: 0,
  reactions: { total_count: 3 },
  html_url: 'https://github.com/acme/widgets/issues/7',
  ...over,
})

const rawComment = (id: number, body = `comment number ${id}`, login = 'bob-example'): GitHubComment => ({
  id,
  user: { login, type: login.endsWith('[bot]') ? 'Bot' : 'User' },
  author_association: 'NONE',
  created_at: '2026-01-02T00:00:00Z',
  body,
})

describe('mapRepo', () => {
  it('maps GitHub repo JSON to the domain Repo', () => {
    const repo = mapRepo({
      name: 'widgets',
      full_name: 'acme/widgets',
      owner: { login: 'acme' },
      description: null,
      topics: ['a'],
      default_branch: 'main',
      private: false,
      has_issues: true,
      open_issues_count: 4,
      html_url: 'https://github.com/acme/widgets',
    })
    expect(repo).toEqual({
      ref: { owner: 'acme', repo: 'widgets' },
      fullName: 'acme/widgets',
      description: null,
      topics: ['a'],
      defaultBranch: 'main',
      isPrivate: false,
      hasIssues: true,
      openIssuesCount: 4,
      htmlUrl: 'https://github.com/acme/widgets',
    })
  })
})

describe('mapIssue', () => {
  it('maps to the stored-form Issue with comments not yet fetched', () => {
    expect(mapIssue(rawIssue())).toEqual({
      number: 7,
      title: 'Widget breaks',
      body: 'It breaks.',
      state: 'open',
      stateReason: null,
      labels: ['bug', 'regression'],
      author: 'alice-example',
      authorAssociation: 'CONTRIBUTOR',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
      closedAt: null,
      commentCount: 0,
      comments: [],
      commentsTruncated: false,
      commentsFetched: false,
      reactionsTotal: 3,
      htmlUrl: 'https://github.com/acme/widgets/issues/7',
    })
  })

  it('uses "" for a null body and "ghost" for a deleted user', () => {
    const issue = mapIssue(rawIssue({ body: null, user: null, reactions: undefined }))
    expect(issue.body).toBe('')
    expect(issue.author).toBe('ghost')
    expect(issue.reactionsTotal).toBe(0)
  })

  it('trims the body to the 8 000 char stored budget', () => {
    const body = 'h'.repeat(7000) + 't'.repeat(3000)
    const issue = mapIssue(rawIssue({ body }))
    expect(issue.body.startsWith('h'.repeat(6000) + '\n[… 2500 characters omitted …]\n')).toBe(true)
    expect(issue.body.endsWith('t'.repeat(1500))).toBe(true)
    expect(issue.body.length).toBeLessThanOrEqual(BODY_BUDGET)
  })
})

describe('trimStoredBody', () => {
  it('leaves a body at or under 8 000 chars untouched', () => {
    const body = 'x'.repeat(BODY_BUDGET)
    expect(trimStoredBody(body)).toBe(body)
  })
})

describe('selectComments', () => {
  it('drops bot comments and bodies under 10 chars', () => {
    const selected = selectComments(
      [rawComment(1, '+1'), rawComment(2, 'looks like a real bug', 'ci-helper[bot]'), rawComment(3)],
      8,
    )
    expect(selected.map((c) => c.id)).toEqual([3])
  })

  it('keeps the first 2 and the last (max - 2) comments', () => {
    const comments = Array.from({ length: 20 }, (_, i) => rawComment(i + 1))
    expect(selectComments(comments, 8).map((c) => c.id)).toEqual([1, 2, 15, 16, 17, 18, 19, 20])
  })

  it('trims each comment to 1 000 chars', () => {
    const [comment] = selectComments([rawComment(1, 'c'.repeat(2500))], 8)
    expect(comment.body).toHaveLength(COMMENT_BUDGET)
    expect(comment.body.endsWith('…')).toBe(true)
  })

  it('maps the comment author and association', () => {
    const [comment] = selectComments([{ ...rawComment(4), user: null }], 8)
    expect(comment).toEqual({
      id: 4,
      author: 'ghost',
      authorAssociation: 'NONE',
      createdAt: '2026-01-02T00:00:00Z',
      body: 'comment number 4',
    })
  })
})

describe('attachComments', () => {
  it('marks comments fetched and truncated when a subset is kept', () => {
    const issue = mapIssue(rawIssue({ comments: 20 }))
    const comments = Array.from({ length: 20 }, (_, i) => rawComment(i + 1))
    const withComments = attachComments(issue, comments, 8)
    expect(withComments.comments).toHaveLength(8)
    expect(withComments.commentsFetched).toBe(true)
    expect(withComments.commentsTruncated).toBe(true)
    expect(issue.commentsFetched).toBe(false)
  })

  it('is not truncated when every comment is kept', () => {
    const issue = mapIssue(rawIssue({ comments: 2 }))
    const withComments = attachComments(issue, [rawComment(1), rawComment(2)], 8)
    expect(withComments.commentsTruncated).toBe(false)
  })
})
