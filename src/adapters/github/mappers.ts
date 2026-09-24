// GitHub JSON → domain objects. Pure: no fetch, no Vue.
// Issues are produced directly in STORED form: the body and the selected
// comments are already trimmed, so what is stored is exactly what Jev sees.
import { headText, trimMiddle } from '../../domain/text'
import type { Issue, IssueComment, IssueState, Repo } from '../../domain/types'

// ── The subset of GitHub's REST JSON this app reads ──────────────────
export interface GitHubUser {
  login: string
  type?: string
}

export interface GitHubRepo {
  name: string
  full_name: string
  owner: { login: string }
  description: string | null
  topics?: string[]
  default_branch: string
  private: boolean
  has_issues: boolean
  open_issues_count: number
  html_url: string
}

export interface GitHubIssue {
  number: number
  title: string
  body?: string | null
  state: string
  state_reason?: string | null
  labels?: Array<string | { name?: string | null }>
  user: GitHubUser | null
  author_association?: string
  created_at: string
  updated_at: string
  closed_at: string | null
  comments: number
  reactions?: { total_count?: number }
  html_url: string
  /** Present only on pull requests, which are always dropped. */
  pull_request?: unknown
}

export interface GitHubComment {
  id: number
  user: GitHubUser | null
  author_association?: string
  created_at: string
  body?: string | null
}

// ── Stored-form budgets (§4.3, §4.8) ─────────────────────────────────
export const BODY_BUDGET = 8000
export const BODY_HEAD = 6000
export const BODY_TAIL = 1500
export const COMMENT_BUDGET = 1000
export const COMMENT_HEAD_COUNT = 2
export const MIN_COMMENT_CHARS = 10

const GHOST = 'ghost'

export function mapRepo(raw: GitHubRepo): Repo {
  return {
    ref: { owner: raw.owner.login, repo: raw.name },
    fullName: raw.full_name,
    description: raw.description ?? null,
    topics: [...(raw.topics ?? [])],
    defaultBranch: raw.default_branch,
    isPrivate: raw.private,
    hasIssues: raw.has_issues,
    openIssuesCount: raw.open_issues_count,
    htmlUrl: raw.html_url,
  }
}

/** First 6 000 + omission marker + last 1 500 when over the 8 000 char budget. */
export function trimStoredBody(body: string): string {
  return body.length > BODY_BUDGET ? trimMiddle(body, BODY_HEAD, BODY_TAIL) : body
}

function trimComment(body: string): string {
  return body.length > COMMENT_BUDGET ? `${headText(body, COMMENT_BUDGET - 1)}…` : body
}

const labelName = (label: string | { name?: string | null }) => (typeof label === 'string' ? label : label.name ?? '')

export function isPullRequest(raw: GitHubIssue): boolean {
  return raw.pull_request !== undefined && raw.pull_request !== null
}

/** Maps one issue with no comments attached yet (`commentsFetched: false`). */
export function mapIssue(raw: GitHubIssue): Issue {
  return {
    number: raw.number,
    title: raw.title,
    body: trimStoredBody(raw.body ?? ''),
    state: (raw.state === 'closed' ? 'closed' : 'open') satisfies IssueState,
    stateReason: raw.state_reason ?? null,
    labels: (raw.labels ?? []).map(labelName).filter((name) => name !== ''),
    author: raw.user?.login ?? GHOST,
    authorAssociation: raw.author_association ?? 'NONE',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    closedAt: raw.closed_at ?? null,
    commentCount: raw.comments,
    comments: [],
    commentsTruncated: false,
    commentsFetched: false,
    reactionsTotal: raw.reactions?.total_count ?? 0,
    htmlUrl: raw.html_url,
  }
}

const isBot = (user: GitHubUser | null) => !!user && (user.type === 'Bot' || user.login.endsWith('[bot]'))

/**
 * Selects the stored comments (§4.3): drops bots and bodies under 10 chars,
 * then keeps the first 2 and the last `max - 2`, each trimmed to 1 000 chars.
 * `comments` must be in chronological order (oldest first).
 */
export function selectComments(comments: GitHubComment[], max: number): IssueComment[] {
  const kept = comments.filter((c) => !isBot(c.user) && (c.body ?? '').trim().length >= MIN_COMMENT_CHARS)
  const limit = Math.max(0, Math.floor(max))
  let chosen = kept
  if (kept.length > limit) {
    const headCount = Math.min(COMMENT_HEAD_COUNT, limit)
    const tailCount = limit - headCount
    chosen = [...kept.slice(0, headCount), ...(tailCount > 0 ? kept.slice(-tailCount) : [])]
  }
  return chosen.map((c) => ({
    id: c.id,
    author: c.user?.login ?? GHOST,
    authorAssociation: c.author_association ?? 'NONE',
    createdAt: c.created_at,
    body: trimComment(c.body ?? ''),
  }))
}

/** Returns a copy of `issue` carrying the selected comments. */
export function attachComments(issue: Issue, comments: GitHubComment[], max: number): Issue {
  const selected = selectComments(comments, max)
  return {
    ...issue,
    comments: selected,
    commentsFetched: true,
    commentsTruncated: selected.length < issue.commentCount,
  }
}
