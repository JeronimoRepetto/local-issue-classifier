// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGitHubHttp } from './http'
import { IssuesDisabledError } from './errors'
import { createGitHubLoader, estimateCommentCost, type LoadProgress } from './loader'
import type { Issue } from '../../domain/types'

const FIXTURES = join(__dirname, '..', '..', '..', 'tests', 'fixtures', 'github')
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

const BASE = 'https://api.github.com'
const REPO = '/repos/acme/widgets'
const ISSUES = `${REPO}/issues?state=open&sort=updated&direction=desc&per_page=100`
const ref = { owner: 'acme', repo: 'widgets' }

type Route = { body: string; link?: string }
type Call = { url: string; accept: string | null }

/** A fake `fetch` serving fixtures by URL (relative to the API base); anything else is a 404. */
function fakeGitHub(routes: Record<string, Route>) {
  const calls: Call[] = []
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, accept: new Headers(init?.headers).get('accept') })
    const route = routes[url.slice(BASE.length)]
    if (!route) return new Response('{"message":"Not Found"}', { status: 404 })
    return new Response(route.body, { status: 200, headers: route.link ? { link: route.link } : {} })
  })
  const http = createGitHubHttp({ fetch: fetchFn as unknown as typeof fetch, getToken: () => 'test-token' })
  const paths = () => calls.map((c) => c.url.slice(BASE.length))
  return { loader: createGitHubLoader(http), calls, paths }
}

const link = (rels: Record<string, string>) =>
  Object.entries(rels)
    .map(([rel, path]) => `<${BASE}${path}>; rel="${rel}"`)
    .join(', ')

const issueRoutes: Record<string, Route> = {
  [ISSUES]: {
    body: fixture('issues-page-1.json'),
    link: link({ next: `${ISSUES}&page=2`, last: `${ISSUES}&page=2` }),
  },
  [`${ISSUES}&page=2`]: { body: fixture('issues-page-2.json') },
}

const commentRoutes: Record<string, Route> = {
  [`${REPO}/issues/7/comments?per_page=100`]: {
    body: fixture('comments-7-page-1.json'),
    link: link({
      next: `${REPO}/issues/7/comments?per_page=100&page=2`,
      last: `${REPO}/issues/7/comments?per_page=100&page=3`,
    }),
  },
  [`${REPO}/issues/7/comments?per_page=100&page=3`]: { body: fixture('comments-7-page-3.json') },
  [`${REPO}/issues/4/comments?per_page=100`]: { body: fixture('comments-4.json') },
}

const contextRoutes: Record<string, Route> = {
  [`${REPO}/readme`]: { body: fixture('readme.md') },
  [`${REPO}/contents/.github/CONTRIBUTING.md`]: { body: fixture('contributing.md') },
  [`${REPO}/contents/docs`]: { body: fixture('docs.json') },
  [`${REPO}/contents/package.json`]: { body: fixture('manifest-package.json') },
}

const repoRoute = { [REPO]: { body: fixture('repo.json') } }

async function loadedIssues(): Promise<Issue[]> {
  const { loader } = fakeGitHub(issueRoutes)
  return (await loader.loadIssues(ref, { state: 'open', maxIssues: 1000 })).issues
}

describe('loadRepo', () => {
  it('maps the repo metadata', async () => {
    const { loader, paths } = fakeGitHub(repoRoute)
    const repo = await loader.loadRepo(ref)
    expect(repo.fullName).toBe('acme/widgets')
    expect(repo.topics).toEqual(['widgets', 'ui'])
    expect(paths()).toEqual([REPO])
  })

  it('throws a typed IssuesDisabledError when has_issues is false', async () => {
    const { loader } = fakeGitHub({ [REPO]: { body: fixture('repo-issues-disabled.json') } })
    await expect(loader.loadRepo(ref)).rejects.toBeInstanceOf(IssuesDisabledError)
    await expect(loader.loadRepo(ref)).rejects.toThrow('This repository has issues disabled.')
  })
})

describe('loadProjectContext', () => {
  it('builds the context from README, CONTRIBUTING fallback, docs and the first manifest', async () => {
    const { loader, calls } = fakeGitHub({ ...repoRoute, ...contextRoutes })
    const repo = await loader.loadRepo(ref)
    const ctx = await loader.loadProjectContext(repo)
    expect(ctx).toEqual({
      name: 'acme/widgets',
      description: 'Synthetic widget toolkit used only by tests',
      topics: ['widgets', 'ui'],
      manifest: { source: 'package.json', name: 'widgets', description: 'Synthetic widget toolkit' },
      readmeExcerpt:
        '# Widgets\n\nWidgets is a synthetic toolkit used only in tests.\n\n## Install\n\n```sh\npnpm add widgets\n```',
      contributingExcerpt: '# Contributing\n\nOpen an issue first, then send a small pull request with tests.',
      docsIndex: ['getting-started.md', 'guides', 'api.md'],
    })
    const readmeCall = calls.find((c) => c.url.endsWith('/readme'))
    expect(readmeCall?.accept).toBe('application/vnd.github.raw+json')
    // package.json exists, so later manifests are never probed.
    expect(calls.some((c) => c.url.endsWith('pyproject.toml'))).toBe(false)
  })

  it.each([
    ['pyproject.toml', 'manifest-pyproject.toml', 'widgets-py', 'Synthetic widgets for Python'],
    ['Cargo.toml', 'manifest-Cargo.toml', 'widgets-rs', 'Synthetic widgets for Rust'],
    ['go.mod', 'manifest-go.mod', 'example.test/acme/widgets', null],
  ] as const)('probes manifests in order and parses %s', async (file, fixtureName, name, description) => {
    const { loader, paths } = fakeGitHub({ ...repoRoute, [`${REPO}/contents/${file}`]: { body: fixture(fixtureName) } })
    const ctx = await loader.loadProjectContext(await loader.loadRepo(ref))
    expect(ctx.manifest).toEqual({ source: file, name, description })
    const probed = paths().filter((p) => /package\.json|pyproject|Cargo|go\.mod/.test(p))
    const order = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']
    expect(probed).toEqual(order.slice(0, order.indexOf(file) + 1).map((f) => `${REPO}/contents/${f}`))
  })

  it('turns every 404 into a null field', async () => {
    const { loader } = fakeGitHub(repoRoute)
    const ctx = await loader.loadProjectContext(await loader.loadRepo(ref))
    expect(ctx).toEqual({
      name: 'acme/widgets',
      description: 'Synthetic widget toolkit used only by tests',
      topics: ['widgets', 'ui'],
      manifest: { source: null, name: null, description: null },
      readmeExcerpt: null,
      contributingExcerpt: null,
      docsIndex: [],
    })
  })
})

describe('loadIssues', () => {
  it('paginates at 100 per page, most recently updated first, and always drops PRs', async () => {
    const progress: LoadProgress[] = []
    const { loader, paths } = fakeGitHub(issueRoutes)
    const result = await loader.loadIssues(ref, {
      state: 'open',
      maxIssues: 1000,
      onProgress: (p) => progress.push(p),
    })
    expect(result.issues.map((i) => i.number)).toEqual([7, 6, 4, 2])
    expect(result.totalPages).toBe(2)
    expect(result.capped).toBe(false)
    expect(paths()).toEqual([ISSUES, `${ISSUES}&page=2`])
    expect(progress).toEqual([
      { phase: 'issues', loaded: 3, pagesFetched: 1, totalPages: 2, nextUrl: `${BASE}${ISSUES}&page=2` },
      { phase: 'issues', loaded: 4, pagesFetched: 2, totalPages: 2, nextUrl: null },
    ])
  })

  it('maps issues to stored form without comments', async () => {
    const [issue] = await loadedIssues()
    expect(issue).toMatchObject({ number: 7, labels: ['bug'], commentCount: 250, comments: [], commentsFetched: false })
  })

  it('stops at maxIssuesToLoad without fetching further pages', async () => {
    const { loader, paths } = fakeGitHub(issueRoutes)
    const result = await loader.loadIssues(ref, { state: 'open', maxIssues: 2 })
    expect(result.issues.map((i) => i.number)).toEqual([7, 6])
    expect(result.capped).toBe(true)
    expect(paths()).toEqual([ISSUES])
  })

  it('counts only real issues toward the cap', async () => {
    const { loader, paths } = fakeGitHub(issueRoutes)
    const result = await loader.loadIssues(ref, { state: 'open', maxIssues: 4 })
    expect(result.issues.map((i) => i.number)).toEqual([7, 6, 4, 2])
    expect(paths()).toHaveLength(2)
  })

  it('resumes from a given page URL', async () => {
    const { loader, paths } = fakeGitHub(issueRoutes)
    const result = await loader.loadIssues(ref, { state: 'open', maxIssues: 1000, resumeFrom: `${BASE}${ISSUES}&page=2` })
    expect(result.issues.map((i) => i.number)).toEqual([2])
    expect(paths()).toEqual([`${ISSUES}&page=2`])
  })

  it('cancellation stops further page requests', async () => {
    const controller = new AbortController()
    const { loader, paths } = fakeGitHub(issueRoutes)
    const run = loader.loadIssues(ref, {
      state: 'open',
      maxIssues: 1000,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })
    await expect(run).rejects.toThrow()
    expect(paths()).toEqual([ISSUES])
  })
})

describe('loadComments', () => {
  it('fetches comments only for issues with comments > 0, first and last page only', async () => {
    const issues = await loadedIssues()
    const { loader, paths } = fakeGitHub(commentRoutes)
    const result = await loader.loadComments(ref, issues, { maxCommentsPerIssue: 8 })
    expect(paths()).toEqual([
      `${REPO}/issues/7/comments?per_page=100`,
      `${REPO}/issues/7/comments?per_page=100&page=3`,
      `${REPO}/issues/4/comments?per_page=100`,
    ])
    const byNumber = new Map(result.map((i) => [i.number, i]))
    expect(byNumber.get(7)!.comments.map((c) => c.id)).toEqual([7001, 7002, 7245, 7246, 7247, 7248, 7249, 7250])
    expect(byNumber.get(7)!.commentsTruncated).toBe(true)
    expect(byNumber.get(4)!.comments.map((c) => c.id)).toEqual([401])
    expect(byNumber.get(6)).toMatchObject({ commentsFetched: true, comments: [], commentsTruncated: false })
    expect(result.every((i) => i.commentsFetched)).toBe(true)
  })

  it('skips the last page when the thread fits within maxCommentsPerIssue', async () => {
    const issues = (await loadedIssues()).filter((i) => i.number === 7)
    const { loader, paths } = fakeGitHub(commentRoutes)
    await loader.loadComments(ref, issues, { maxCommentsPerIssue: 300 })
    expect(paths()).toEqual([`${REPO}/issues/7/comments?per_page=100`])
  })

  it('reports progress per commented issue and skips issues already fetched (resume)', async () => {
    const issues = await loadedIssues()
    const { loader } = fakeGitHub(commentRoutes)
    const first = await loader.loadComments(ref, issues, { maxCommentsPerIssue: 8 })
    const progress: LoadProgress[] = []
    const again = fakeGitHub(commentRoutes)
    await again.loader.loadComments(ref, first, { maxCommentsPerIssue: 8, onProgress: (p) => progress.push(p) })
    expect(again.paths()).toEqual([])
    expect(progress).toEqual([])
  })

  it('cancellation stops further comment requests', async () => {
    const issues = await loadedIssues()
    const controller = new AbortController()
    const { loader, paths } = fakeGitHub(commentRoutes)
    const run = loader.loadComments(ref, issues, {
      maxCommentsPerIssue: 8,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })
    await expect(run).rejects.toThrow()
    expect(paths()).toHaveLength(2)
  })
})

describe('estimateCommentCost', () => {
  it('counts commented issues and 2 requests for long threads', async () => {
    const issues = await loadedIssues()
    expect(estimateCommentCost(issues, 8)).toEqual({ commentedIssues: 2, requests: 3 })
    expect(estimateCommentCost(issues, 300)).toEqual({ commentedIssues: 2, requests: 2 })
  })

  it('ignores issues whose comments were already fetched', async () => {
    const issues = (await loadedIssues()).map((i) => ({ ...i, commentsFetched: true }))
    expect(estimateCommentCost(issues, 8)).toEqual({ commentedIssues: 0, requests: 0 })
  })
})

describe('load (full §5.5 sequence)', () => {
  const allRoutes = { ...repoRoute, ...contextRoutes, ...issueRoutes, ...commentRoutes }

  it('yields Repo, stored-form issues and ProjectContext', async () => {
    const { loader } = fakeGitHub(allRoutes)
    const decide = vi.fn(async () => true)
    const result = await loader.load(ref, {
      state: 'open',
      maxIssues: 1000,
      maxCommentsPerIssue: 8,
      shouldFetchComments: decide,
    })
    expect(result.repo.fullName).toBe('acme/widgets')
    expect(result.projectContext.manifest.source).toBe('package.json')
    expect(result.issues.map((i) => i.number)).toEqual([7, 6, 4, 2])
    expect(result.commentsFetched).toBe(true)
    expect(result.issues.every((i) => i.commentsFetched)).toBe(true)
    expect(decide).toHaveBeenCalledWith({ commentedIssues: 2, requests: 3 })
  })

  it('skips every comment request when comments are declined', async () => {
    const { loader, paths } = fakeGitHub(allRoutes)
    const result = await loader.load(ref, {
      state: 'open',
      maxIssues: 1000,
      maxCommentsPerIssue: 8,
      shouldFetchComments: () => false,
    })
    expect(result.commentsFetched).toBe(false)
    expect(result.issues.every((i) => !i.commentsFetched)).toBe(true)
    expect(paths().some((p) => p.includes('/comments'))).toBe(false)
  })

  it('stops before issues when the repo has issues disabled', async () => {
    const { loader, paths } = fakeGitHub({ [REPO]: { body: fixture('repo-issues-disabled.json') } })
    await expect(
      loader.load(ref, { state: 'open', maxIssues: 1000, maxCommentsPerIssue: 8, shouldFetchComments: () => true }),
    ).rejects.toBeInstanceOf(IssuesDisabledError)
    expect(paths()).toEqual([REPO])
  })
})
