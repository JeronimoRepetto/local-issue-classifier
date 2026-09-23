// local-issue-classifier — builds the Jev `state` for one issue (SPEC.md §4.3). Pure.
// The project part comes from a ProjectContext built once per repo load
// (projectContext.ts); the issue part is rebuilt per issue. The clock is injected.
import { dateBucket, type Clock, type DateBucket } from './dates'
import { estimateStateTokens } from './estimate'
import { trimMiddle } from './text'
import type { Issue, IssueComment, IssueState, ProjectContext } from './types'

// ── Shape sent to Jev (§4.3) ─────────────────────────────────────────
export interface JevProject {
  name: string
  description: string | null
  topics: string[]
  package: { name: string | null; description: string | null } | null
  readme_excerpt: string | null
  contributing_excerpt: string | null
  docs_index: string[]
}

export interface JevComment {
  author_role: string
  body: string
}

export interface JevIssue {
  number: number
  title: string
  state: IssueState
  labels: string[]
  author_role: string // authorAssociation, lower-cased
  age: DateBucket // bucketed in code: the model compares raw dates unreliably
  last_activity: DateBucket
  comment_count: number
  reactions: number
  body: string
  comments: JevComment[]
  comments_note: string | null // e.g. "showing 8 of 42 comments (first 2 and last 6)"
}

export interface JevState {
  project: JevProject
  issue: JevIssue
}

// ── Budgets (§4.3) ───────────────────────────────────────────────────
/** Size guard: at most this many estimated tokens of state (models.md allows 32k). */
export const MAX_STATE_TOKENS = 12_000
export const DEFAULT_MAX_COMMENTS = 8
export const TOO_LARGE_MESSAGE = 'Issue too large even after trimming'

const README_CHARS = 6_000
const README_CHARS_REDUCED = 3_000
const CONTRIBUTING_CHARS = 1_500
const DOCS_INDEX_MAX = 40
const BODY_CHARS = 8_000
const BODY_HEAD = 6_000
const BODY_TAIL = 1_500
const BODY_HEAD_REDUCED = 3_000
const BODY_TAIL_REDUCED = 1_000
const COMMENT_CHARS = 1_000
const COMMENT_MIN_CHARS = 10
const COMMENT_HEAD = 2

export interface BuildIssueStateOptions {
  now: Clock
  /** Preferences.maxCommentsPerIssue; default 8 (first 2 + last 6). */
  maxCommentsPerIssue?: number
  /** Override of the 12k-token size guard, for tests. */
  maxStateTokens?: number
}

export interface IssueTooLargeError {
  kind: 'too-large'
  message: typeof TOO_LARGE_MESSAGE
  estimatedTokens: number
}

export type BuildIssueStateResult =
  | { ok: true; state: JevState; estimatedTokens: number }
  | { ok: false; error: IssueTooLargeError }

// ── Project ──────────────────────────────────────────────────────────
function head(text: string | null, chars: number): string | null {
  return text === null ? null : text.slice(0, chars)
}

/** Maps a ProjectContext to the state's `project`, re-applying its budgets defensively. */
export function toJevProject(ctx: ProjectContext): JevProject {
  const { manifest } = ctx
  return {
    name: ctx.name,
    description: ctx.description,
    topics: [...ctx.topics],
    package: manifest.source === null ? null : { name: manifest.name, description: manifest.description },
    readme_excerpt: head(ctx.readmeExcerpt, README_CHARS),
    contributing_excerpt: head(ctx.contributingExcerpt, CONTRIBUTING_CHARS),
    docs_index: ctx.docsIndex.slice(0, DOCS_INDEX_MAX),
  }
}

// ── Comments ─────────────────────────────────────────────────────────
/** Bots and near-empty bodies ("+1", "same") add noise, not signal. */
function isEligible(comment: IssueComment): boolean {
  return !comment.author.endsWith('[bot]') && comment.body.trim().length >= COMMENT_MIN_CHARS
}

/** A selection is a head prefix plus a tail suffix of the eligible comments. */
interface Split {
  head: number
  tail: number
}

function initialSplit(eligible: number, max: number): Split {
  if (eligible <= max) return { head: eligible, tail: 0 }
  const headCount = Math.min(COMMENT_HEAD, max)
  return { head: headCount, tail: max - headCount }
}

/** Removes the comment in the middle of the current selection. */
function dropMiddle({ head: h, tail: t }: Split): Split {
  const middle = Math.floor((h + t) / 2)
  return middle < h ? { head: h - 1, tail: t } : { head: h, tail: t - 1 }
}

function renderComments(
  eligible: readonly IssueComment[],
  split: Split,
  total: number,
  commentChars: number = COMMENT_CHARS,
): { comments: JevComment[]; note: string | null } {
  const picked = [
    ...eligible.slice(0, split.head),
    ...eligible.slice(eligible.length - split.tail),
  ]
  const comments = picked.map((c) => ({
    author_role: c.authorAssociation.toLowerCase(),
    body: c.body.slice(0, commentChars),
  }))
  const shown = comments.length
  const outOf = Math.max(total, eligible.length)
  if (shown >= outOf) return { comments, note: null }
  const gap = split.tail > 0 && split.head + split.tail < eligible.length
  const detail = gap ? ` (first ${split.head} and last ${split.tail})` : ''
  return { comments, note: `showing ${shown} of ${outOf} comments${detail}` }
}

/**
 * Drops bot and near-empty comments, then keeps the first 2 and the last
 * (max − 2), each trimmed to `commentChars` (1 000 by default). `total` is
 * GitHub's comment count.
 */
export function selectComments(
  comments: readonly IssueComment[],
  total: number,
  max: number = DEFAULT_MAX_COMMENTS,
  commentChars: number = COMMENT_CHARS,
): { comments: JevComment[]; note: string | null } {
  const eligible = comments.filter(isEligible)
  return renderComments(eligible, initialSplit(eligible.length, max), total, commentChars)
}

/** The note shown instead of comments that were never fetched. */
export function commentsNotLoaded(issue: Issue): { comments: JevComment[]; note: string } | null {
  return !issue.commentsFetched && issue.commentCount > 0
    ? { comments: [], note: `comments not loaded (${issue.commentCount} on GitHub)` }
    : null
}

/** The state's `issue` for an already trimmed body and comment selection. */
export function toJevIssue(
  issue: Issue,
  now: Clock,
  body: string,
  selection: { comments: JevComment[]; note: string | null },
): JevIssue {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: [...issue.labels],
    author_role: issue.authorAssociation.toLowerCase(),
    age: dateBucket(issue.createdAt, now),
    last_activity: dateBucket(issue.updatedAt, now),
    comment_count: issue.commentCount,
    reactions: issue.reactionsTotal,
    body,
    comments: selection.comments,
    comments_note: selection.note,
  }
}

// ── Issue state + size guard ─────────────────────────────────────────
/** Standard body trimming: over 8 000 chars keeps the first 6 000 and the last 1 500. */
export function trimBody(body: string): string {
  return body.length <= BODY_CHARS ? body : trimMiddle(body, BODY_HEAD, BODY_TAIL)
}

function trimBodyReduced(body: string): string {
  const budget = BODY_HEAD_REDUCED + BODY_TAIL_REDUCED
  return body.length <= budget ? body : trimMiddle(body, BODY_HEAD_REDUCED, BODY_TAIL_REDUCED)
}

/**
 * Builds the §4.3 state. When it exceeds the size guard, trims in a fixed
 * order: (1) comments from the middle, (2) body to 4 000 chars, (3) README to
 * 3 000 chars; if still too large, returns a typed error and nothing is sent.
 */
export function buildIssueState(
  issue: Issue,
  ctx: ProjectContext,
  opts: BuildIssueStateOptions,
): BuildIssueStateResult {
  const maxTokens = opts.maxStateTokens ?? MAX_STATE_TOKENS
  const maxComments = opts.maxCommentsPerIssue ?? DEFAULT_MAX_COMMENTS
  const baseProject = toJevProject(ctx)
  const eligible = issue.comments.filter(isEligible)
  const notLoaded = commentsNotLoaded(issue)

  let split = initialSplit(eligible.length, maxComments)
  let body = trimBody(issue.body)
  let readme = baseProject.readme_excerpt

  const compose = (): JevState => {
    const selection = notLoaded ?? renderComments(eligible, split, issue.commentCount)
    return {
      project: { ...baseProject, readme_excerpt: readme },
      issue: toJevIssue(issue, opts.now, body, selection),
    }
  }

  let state = compose()
  let tokens = estimateStateTokens(state)
  const refresh = () => {
    state = compose()
    tokens = estimateStateTokens(state)
  }

  // 1. Remove comments, starting from the middle.
  while (tokens > maxTokens && split.head + split.tail > 0) {
    split = dropMiddle(split)
    refresh()
  }
  // 2. Cut the body to 4 000 chars (first 3 000 + last 1 000).
  if (tokens > maxTokens) {
    body = trimBodyReduced(issue.body)
    refresh()
  }
  // 3. Cut the README to 3 000 chars (head).
  if (tokens > maxTokens) {
    readme = head(readme, README_CHARS_REDUCED)
    refresh()
  }
  // 4. Still too large: do not send it.
  if (tokens > maxTokens) {
    return { ok: false, error: { kind: 'too-large', message: TOO_LARGE_MESSAGE, estimatedTokens: tokens } }
  }
  return { ok: true, state, estimatedTokens: tokens }
}
