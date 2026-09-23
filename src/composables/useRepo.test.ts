// Task 8 — SPEC.md §2.3: load state machine (idle → loading → done / rate-limited
// / error), resume, the huge-repo and comment-cost confirmations, refresh merge
// and the once-per-session private-repo notice.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS, defaultPreferences } from '../domain/types'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

const BASE = 'https://api.github.com'
const REPO_PATH = '/repos/acme/widgets'
const ISSUES_RE = /^\/repos\/acme\/widgets\/issues\?state=open&sort=updated&direction=desc&per_page=100(?:&page=(\d+))?$/
const ref = { owner: 'acme', repo: 'widgets' }

function issuesPageUrl(page: number): string {
  return page === 1
    ? `${REPO_PATH}/issues?state=open&sort=updated&direction=desc&per_page=100`
    : `${REPO_PATH}/issues?state=open&sort=updated&direction=desc&per_page=100&page=${page}`
}

function rawIssue(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: `Body ${number}`,
    state: 'open',
    state_reason: null,
    labels: [],
    user: { login: 'octo', type: 'User' },
    author_association: 'NONE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    closed_at: null,
    comments: 0,
    reactions: { total_count: 0 },
    html_url: `https://github.com/acme/widgets/issues/${number}`,
    ...overrides,
  }
}

function makePage(page: number, perPage: number, build: (n: number) => Record<string, unknown> = rawIssue) {
  return Array.from({ length: perPage }, (_, i) => build((page - 1) * perPage + i + 1))
}

interface ServerOptions {
  totalPages: number
  perPage?: number
  isPrivate?: boolean
  rateLimit?: { limit: number; remaining: number }
  /** 1-based index among ISSUES-list requests that should fail with a primary rate limit. */
  failIssuesRequestAt?: number
  /** 1-based index among COMMENTS requests that should fail with a primary rate limit. */
  failCommentsRequestAt?: number
  issues?: Record<number, Record<string, unknown>>
  comments?: Record<number, Array<Record<string, unknown>>>
  /** Full override for one page's raw issue array, bypassing auto-numbering. */
  pages?: Record<number, Array<Record<string, unknown>>>
}

function fakeGitHub(opts: ServerOptions) {
  const perPage = opts.perPage ?? 100
  const calls: string[] = []
  let issuesSeen = 0
  let commentsSeen = 0
  const limit = opts.rateLimit?.limit ?? 5000
  let remaining = opts.rateLimit?.remaining ?? 4999

  const rateHeaders = () => ({
    'x-ratelimit-limit': String(limit),
    'x-ratelimit-remaining': String(Math.max(0, remaining)),
    'x-ratelimit-used': String(limit - remaining),
    'x-ratelimit-reset': String(9_999_999_999),
    'x-ratelimit-resource': 'core',
  })
  const rateLimitedResponse = () => {
    remaining = 0
    return new Response('{"message":"rate limit exceeded"}', { status: 403, headers: rateHeaders() })
  }

  const fetchFn = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    const path = url.slice(BASE.length)
    calls.push(path)
    // Only issues/comments requests count against the simulated quota, so this
    // fake server's request count for repo metadata and project-context probes
    // (an implementation detail of loadProjectContext) never affects it.
    const countsAgainstQuota = ISSUES_RE.test(path) || /\/comments\?per_page=100$/.test(path)
    if (countsAgainstQuota) remaining = Math.max(0, remaining - 1)

    if (path === REPO_PATH) {
      return new Response(
        JSON.stringify({
          name: 'widgets',
          full_name: 'acme/widgets',
          owner: { login: 'acme' },
          description: 'Synthetic',
          topics: [],
          default_branch: 'main',
          private: opts.isPrivate ?? false,
          has_issues: true,
          open_issues_count: 1,
          html_url: 'https://github.com/acme/widgets',
        }),
        { status: 200, headers: rateHeaders() },
      )
    }

    const issuesMatch = ISSUES_RE.exec(path)
    if (issuesMatch) {
      issuesSeen += 1
      if (opts.failIssuesRequestAt === issuesSeen) return rateLimitedResponse()
      const page = issuesMatch[1] ? Number(issuesMatch[1]) : 1
      if (page > opts.totalPages) return new Response('[]', { status: 200, headers: rateHeaders() })
      const body = JSON.stringify(
        opts.pages?.[page] ?? makePage(page, perPage, (n) => opts.issues?.[n] ?? rawIssue(n)),
      )
      const links: string[] = [`<${BASE}${issuesPageUrl(opts.totalPages)}>; rel="last"`]
      if (page < opts.totalPages) links.push(`<${BASE}${issuesPageUrl(page + 1)}>; rel="next"`)
      return new Response(body, { status: 200, headers: { ...rateHeaders(), link: links.join(', ') } })
    }

    const commentsMatch = /^\/repos\/acme\/widgets\/issues\/(\d+)\/comments\?per_page=100$/.exec(path)
    if (commentsMatch) {
      commentsSeen += 1
      if (opts.failCommentsRequestAt === commentsSeen) return rateLimitedResponse()
      const n = Number(commentsMatch[1])
      return new Response(JSON.stringify(opts.comments?.[n] ?? []), { status: 200, headers: rateHeaders() })
    }

    return new Response('{"message":"Not Found"}', { status: 404, headers: rateHeaders() })
  })

  return { fetchFn: fetchFn as unknown as typeof fetch, calls, paths: () => calls.map((c) => c.slice(0)) }
}

let repoMod: typeof import('./useRepo')
let analysisMod: typeof import('./useAnalysis')
let analysesMod: typeof import('./useAnalyses')
let storage: MemoryStorage
let ids: string[]

function setup(server: ReturnType<typeof fakeGitHub>, prefs: Partial<ReturnType<typeof defaultPreferences>> = {}) {
  ids = ['a1', 'a2', 'a3', 'a4', 'a5']
  repoMod.configureRepo({
    fetchImpl: server.fetchFn,
    now: () => '2026-06-01T00:00:00Z',
    idFactory: () => ids.shift() ?? 'extra',
    getPreferences: () => ({ ...defaultPreferences(), ...prefs }),
  })
}

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
  analysisMod = await import('./useAnalysis')
  analysesMod = await import('./useAnalyses')
  repoMod = await import('./useRepo')
  analysisMod.configureAnalysis({ clock: () => '2026-06-01T00:00:00Z' })
  repoMod.resetRepoForTests()
})

describe('startNew — happy path', () => {
  it('loads a small repo, fetches comments (none needed) and becomes current', async () => {
    const server = fakeGitHub({ totalPages: 1, perPage: 3 })
    setup(server)
    const repo = repoMod.useRepo()

    await repo.startNew(ref, 'open', 'acme/widgets')

    expect(repo.state.phase).toBe('done')
    expect(repo.state.analysisId).toBe('a1')
    const current = analysisMod.useAnalysis().current.value
    expect(current?.repo.fullName).toBe('acme/widgets')
    expect(current?.rows.map((r) => r.issue.number)).toEqual([1, 2, 3])
    expect(current?.commentsFetched).toBe(true)
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).lastRepo).toBe('acme/widgets')
  })

  it('never fetches comments when the preference is "never"', async () => {
    const server = fakeGitHub({
      totalPages: 1,
      perPage: 2,
      issues: { 1: rawIssue(1, { comments: 3 }) },
      comments: { 1: [{ id: 1, user: { login: 'a' }, created_at: '2026-01-01T00:00:00Z', body: 'a real comment' }] },
    })
    setup(server, { fetchComments: 'never' })
    const repo = repoMod.useRepo()

    await repo.startNew(ref, 'open')

    expect(repo.state.phase).toBe('done')
    expect(analysisMod.useAnalysis().current.value?.commentsFetched).toBe(false)
    expect(server.calls.some((c) => c.includes('/comments'))).toBe(false)
  })
})

describe('huge-repo confirmation (SPEC §2.3, above 20 pages)', () => {
  it('pauses after the first page and, once confirmed, loads the rest up to the cap', async () => {
    const server = fakeGitHub({ totalPages: 25 })
    setup(server, { maxIssuesToLoad: 250, fetchComments: 'never' })
    const repo = repoMod.useRepo()

    const run = repo.startNew(ref, 'open')
    await vi.waitFor(() => expect(repo.state.phase).toBe('confirm-huge-repo'))
    expect(repo.state.totalPages).toBe(25)

    repo.confirmHugeRepo(true)
    await run

    expect(repo.state.phase).toBe('done')
    const current = analysisMod.useAnalysis().current.value!
    expect(current.rows).toHaveLength(250)
  })

  it('declining keeps only what was already loaded, capped', async () => {
    const server = fakeGitHub({ totalPages: 25 })
    setup(server, { fetchComments: 'never' })
    const repo = repoMod.useRepo()

    const run = repo.startNew(ref, 'open')
    await vi.waitFor(() => expect(repo.state.phase).toBe('confirm-huge-repo'))
    repo.confirmHugeRepo(false)
    await run

    expect(repo.state.phase).toBe('done')
    const current = analysisMod.useAnalysis().current.value!
    expect(current.rows).toHaveLength(100)
    // Only the peek request was made for the issues list.
    expect(server.calls.filter((c) => c.includes('/issues?')).length).toBe(1)
  })
})

describe('comment-cost confirmation (SPEC §2.3, 80% of remaining quota)', () => {
  const commentedIssues = () => ({
    totalPages: 1,
    perPage: 2,
    rateLimit: { limit: 10, remaining: 2 },
    issues: { 1: rawIssue(1, { comments: 2 }), 2: rawIssue(2, { comments: 2 }) },
    comments: {
      1: [{ id: 11, user: { login: 'a' }, created_at: '2026-01-01T00:00:00Z', body: 'a real comment body' }],
      2: [{ id: 21, user: { login: 'b' }, created_at: '2026-01-01T00:00:00Z', body: 'another real comment' }],
    },
  })

  it('pauses when the cost exceeds 80% of the remaining quota, and "fetch" proceeds', async () => {
    const server = fakeGitHub(commentedIssues())
    setup(server)
    const repo = repoMod.useRepo()

    const run = repo.startNew(ref, 'open')
    await vi.waitFor(() => expect(repo.state.phase).toBe('confirm-comment-cost'))
    expect(repo.state.pendingCost).toEqual({ commentedIssues: 2, requests: 2 })

    repo.confirmCommentCost('fetch')
    await run

    expect(repo.state.phase).toBe('done')
    const current = analysisMod.useAnalysis().current.value!
    expect(current.commentsFetched).toBe(true)
    expect(current.rows.find((r) => r.issue.number === 1)?.issue.comments).toHaveLength(1)
  })

  it('"skip" keeps the issues but never fetches comments', async () => {
    const server = fakeGitHub(commentedIssues())
    setup(server)
    const repo = repoMod.useRepo()

    const run = repo.startNew(ref, 'open')
    await vi.waitFor(() => expect(repo.state.phase).toBe('confirm-comment-cost'))
    repo.confirmCommentCost('skip')
    await run

    expect(repo.state.phase).toBe('done')
    expect(analysisMod.useAnalysis().current.value?.commentsFetched).toBe(false)
    expect(server.calls.some((c) => c.includes('/comments'))).toBe(false)
  })

  it('"cancel" aborts the whole load: nothing is saved', async () => {
    const server = fakeGitHub(commentedIssues())
    setup(server)
    const repo = repoMod.useRepo()

    const run = repo.startNew(ref, 'open')
    await vi.waitFor(() => expect(repo.state.phase).toBe('confirm-comment-cost'))
    repo.confirmCommentCost('cancel')
    await run

    expect(repo.state.phase).toBe('idle')
    expect(analysisMod.useAnalysis().current.value).toBeNull()
  })
})

describe('rate limiting and resume', () => {
  it('a primary rate limit while paging issues pauses, and resume finishes the load', async () => {
    const server = fakeGitHub({ totalPages: 25, failIssuesRequestAt: 2 })
    setup(server, { maxIssuesToLoad: 300, fetchComments: 'never' })
    const repo = repoMod.useRepo()

    const run = repo.startNew(ref, 'open')
    await vi.waitFor(() => expect(repo.state.phase).toBe('confirm-huge-repo'))
    repo.confirmHugeRepo(true)
    await vi.waitFor(() => expect(repo.state.phase).toBe('rate-limited'))
    expect(repo.state.rateLimitResetAt).toEqual(expect.any(Number))
    // Page 1 (the peek) was not lost.
    expect(analysisMod.useAnalysis().current.value).toBeNull()

    await repo.resume()
    await run

    expect(repo.state.phase).toBe('done')
    const current = analysisMod.useAnalysis().current.value!
    expect(current.rows).toHaveLength(300)
    expect(new Set(current.rows.map((r) => r.issue.number)).size).toBe(300) // no duplicates
  })
})

describe('findExisting (SPEC §2.3 step 5)', () => {
  it('finds a saved analysis for the same repo and state filter, case-insensitively', async () => {
    const server = fakeGitHub({ totalPages: 1, perPage: 1 })
    setup(server, { fetchComments: 'never' })
    const repo = repoMod.useRepo()
    await repo.startNew(ref, 'open')

    expect(repo.findExisting({ owner: 'Acme', repo: 'Widgets' }, 'open')).toMatchObject({ id: 'a1' })
    expect(repo.findExisting({ owner: 'acme', repo: 'widgets' }, 'closed')).toBeNull()
    expect(repo.findExisting({ owner: 'other', repo: 'thing' }, 'open')).toBeNull()
  })
})

describe('refresh (SPEC §2.3 step 7)', () => {
  it('merges new data and preserves working state (dismissed issues)', async () => {
    const first = fakeGitHub({ totalPages: 1, perPage: 3 }) // issues 1, 2, 3
    setup(first, { fetchComments: 'never' })
    const repo = repoMod.useRepo()
    await repo.startNew(ref, 'open')
    const id = repo.state.analysisId!
    analysisMod.useAnalysis().dismiss([1])

    // Issue 2 changed, issue 3 is missing from the refresh, issue 4 is new.
    const second = fakeGitHub({
      totalPages: 1,
      pages: {
        1: [
          rawIssue(2, { updated_at: '2026-02-01T00:00:00Z', title: 'Renamed' }),
          rawIssue(4, { title: 'New issue' }),
        ],
      },
    })
    setup(second, { fetchComments: 'never' })
    await repo.refresh(id)

    expect(repo.state.phase).toBe('done')
    const merged = analysisMod.useAnalysis().current.value!
    expect(merged.working.dismissed).toEqual([1])
    const byNumber = new Map(merged.rows.map((r) => [r.issue.number, r]))
    expect(byNumber.get(2)?.issue.title).toBe('Renamed')
    // Missing issues are kept, flagged, never deleted silently (SPEC §2.3 step 7).
    expect(byNumber.get(3)?.sourceStatus).toBe('missing')
    expect(byNumber.get(4)?.issue.title).toBe('New issue')
  })
})

describe('cancel', () => {
  it('aborts an in-flight load and returns to idle', async () => {
    const server = fakeGitHub({ totalPages: 25 })
    setup(server)
    const repo = repoMod.useRepo()

    const run = repo.startNew(ref, 'open')
    await vi.waitFor(() => expect(repo.state.phase).toBe('confirm-huge-repo'))
    repo.cancel()
    await run

    expect(repo.state.phase).toBe('idle')
    expect(analysisMod.useAnalysis().current.value).toBeNull()
  })
})

describe('private-repo notice (SPEC §8, shown once per session)', () => {
  it('is set on the first private repo load and not repeated afterwards', async () => {
    const serverA = fakeGitHub({ totalPages: 1, perPage: 1, isPrivate: true })
    setup(serverA, { fetchComments: 'never' })
    const repo = repoMod.useRepo()
    await repo.startNew(ref, 'open')
    expect(repo.state.privateRepoNotice).toBe(true)

    const serverB = fakeGitHub({ totalPages: 1, perPage: 1, isPrivate: true })
    setup(serverB, { fetchComments: 'never' })
    await repo.startNew({ owner: 'acme', repo: 'other' }, 'open')
    expect(repo.state.privateRepoNotice).toBe(false)
  })
})

describe('onboarding checklist progression (SPEC §10.1, "2 Repository" step)', () => {
  it('marks the repo step done in preferences once a new analysis is created', async () => {
    const server = fakeGitHub({ totalPages: 1, perPage: 1 })
    setup(server, { fetchComments: 'never' })
    const repo = repoMod.useRepo()
    expect(repoMod.readStoredPreferences().onboarding.repo).toBe(false)

    await repo.startNew(ref, 'open')

    expect(repoMod.readStoredPreferences().onboarding).toMatchObject({ repo: true })
  })

  it('does not mark the step for a refresh, only for a new analysis', async () => {
    const first = fakeGitHub({ totalPages: 1, perPage: 1 })
    setup(first, { fetchComments: 'never' })
    const repo = repoMod.useRepo()
    await repo.startNew(ref, 'open')
    const id = repo.state.analysisId!

    // Simulate a later session where the checklist preference was reset.
    storage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({ ...defaultPreferences(), onboarding: { keys: false, repo: false, classify: false } }),
    )
    const second = fakeGitHub({ totalPages: 1, perPage: 1 })
    setup(second, { fetchComments: 'never' })
    await repo.refresh(id)

    expect(repoMod.readStoredPreferences().onboarding.repo).toBe(false)
  })
})
