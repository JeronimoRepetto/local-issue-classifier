// GitHub loader: repo metadata, project context, issues and comments.
// Built on the HTTP core, which owns headers, the ETag cache, the rate-limit policy
// and the request queue. Framework-free; tests inject a fake `fetch` into the core.
import { MANIFEST_FILES, buildProjectContext, type ProjectSources } from '../../domain/projectContext'
import type { Issue, ProjectContext, Repo, RepoRef } from '../../domain/types'
import { IssuesDisabledError, NotFoundError } from './errors'
import type { GitHubHttp } from './http'
import {
  attachComments,
  isPullRequest,
  mapIssue,
  mapRepo,
  type GitHubComment,
  type GitHubIssue,
  type GitHubRepo,
} from './mappers'

export const GITHUB_RAW_ACCEPT = 'application/vnd.github.raw+json'
export const PER_PAGE = 100

export type IssueStateFilter = 'open' | 'closed' | 'all'

export type LoadProgress =
  | { phase: 'issues'; loaded: number; pagesFetched: number; totalPages: number | null; nextUrl: string | null }
  | { phase: 'comments'; done: number; total: number; issue: Issue }

export interface LoadIssuesOptions {
  state: IssueStateFilter
  /** `maxIssuesToLoad`: at most this many issues (PRs excluded), most recently updated first. */
  maxIssues: number
  signal?: AbortSignal
  onProgress?: (progress: LoadProgress) => void
  /** Absolute page URL to continue from, e.g. `nextUrl` of the last progress event before a rate limit. */
  resumeFrom?: string
  /** Stops after this many pages even below `maxIssues`, so a caller can resume from `nextUrl` without skipping items. */
  maxPages?: number
}

export interface LoadIssuesResult {
  issues: Issue[]
  /** Page count from `rel="last"` on the first page; `null` while unknown. */
  totalPages: number | null
  /** True when `maxIssues` stopped the pagination. */
  capped: boolean
}

export interface LoadCommentsOptions {
  maxCommentsPerIssue: number
  signal?: AbortSignal
  onProgress?: (progress: LoadProgress) => void
}

export interface CommentCost {
  /** Issues with `comments > 0` whose comments are not fetched yet. */
  commentedIssues: number
  /** Requests needed: 1 per commented issue, 2 when the last page is needed too. */
  requests: number
}

export interface LoadOptions extends Omit<LoadIssuesOptions, 'resumeFrom'> {
  maxCommentsPerIssue: number
  /** Decides whether to fetch comments once their cost is known (§2.3 step 4). */
  shouldFetchComments: (cost: CommentCost) => boolean | Promise<boolean>
}

export interface LoadResult {
  repo: Repo
  projectContext: ProjectContext
  issues: Issue[]
  totalPages: number | null
  capped: boolean
  commentsFetched: boolean
}

export interface GitHubLoader {
  loadRepo(ref: RepoRef, signal?: AbortSignal): Promise<Repo>
  loadProjectContext(repo: Repo, signal?: AbortSignal): Promise<ProjectContext>
  loadIssues(ref: RepoRef, options: LoadIssuesOptions): Promise<LoadIssuesResult>
  loadComments(ref: RepoRef, issues: Issue[], options: LoadCommentsOptions): Promise<Issue[]>
  load(ref: RepoRef, options: LoadOptions): Promise<LoadResult>
}

const repoPath = (ref: RepoRef) => `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`

/** A thread needs its last page too when it spans pages and exceeds the kept comments. */
const needsLastPage = (issue: Issue, max: number) => issue.commentCount > PER_PAGE && issue.commentCount > max

const needsComments = (issue: Issue) => !issue.commentsFetched && issue.commentCount > 0

export function estimateCommentCost(issues: Issue[], maxCommentsPerIssue: number): CommentCost {
  const pending = issues.filter(needsComments)
  return {
    commentedIssues: pending.length,
    requests: pending.reduce((sum, issue) => sum + (needsLastPage(issue, maxCommentsPerIssue) ? 2 : 1), 0),
  }
}

function pageNumber(url: string | undefined): number | null {
  if (!url) return null
  const page = Number(new URL(url).searchParams.get('page'))
  return Number.isInteger(page) && page > 0 ? page : null
}

/** Resolves to `null` on a 404; any other error propagates. */
async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
}

export function createGitHubLoader(http: GitHubHttp): GitHubLoader {
  const rawText = async (path: string, signal?: AbortSignal) =>
    (await http.request<string>(path, { accept: GITHUB_RAW_ACCEPT, responseType: 'text', signal })).body

  async function firstFound<T>(candidates: readonly T[], fetchOne: (c: T) => Promise<string>) {
    for (const candidate of candidates) {
      const text = await orNull(fetchOne(candidate))
      if (text !== null) return { candidate, text }
    }
    return null
  }

  const loader: GitHubLoader = {
    async loadRepo(ref, signal) {
      const { body } = await http.request<GitHubRepo>(repoPath(ref), { signal })
      const repo = mapRepo(body)
      if (!repo.hasIssues) throw new IssuesDisabledError()
      return repo
    },

    async loadProjectContext(repo, signal) {
      const base = repoPath(repo.ref)
      const [readme, contributing, docs, manifest] = await Promise.all([
        orNull(rawText(`${base}/readme`, signal)),
        firstFound(['CONTRIBUTING.md', '.github/CONTRIBUTING.md'], (p) => rawText(`${base}/contents/${p}`, signal)),
        orNull(http.request<unknown>(`${base}/contents/docs`, { signal })),
        firstFound(MANIFEST_FILES, (file) => rawText(`${base}/contents/${file}`, signal)),
      ])
      const docsBody = docs?.body
      const sources: ProjectSources = {
        readme,
        contributing: contributing?.text ?? null,
        docs: Array.isArray(docsBody)
          ? docsBody.map((entry: { name?: unknown }) => entry?.name).filter((n): n is string => typeof n === 'string')
          : null,
        manifest: manifest ? { source: manifest.candidate, text: manifest.text } : null,
      }
      return buildProjectContext(repo, sources)
    },

    async loadIssues(ref, { state, maxIssues, signal, onProgress, resumeFrom, maxPages }) {
      const cap = Math.max(0, Math.floor(maxIssues))
      const start =
        resumeFrom ?? `${repoPath(ref)}/issues?state=${state}&sort=updated&direction=desc&per_page=${PER_PAGE}`
      const issues: Issue[] = []
      let totalPages: number | null = null
      let pagesFetched = 0
      let capped = false
      if (cap === 0) return { issues, totalPages, capped: true }

      await http.paginate<GitHubIssue[]>(
        start,
        (page, response) => {
          pagesFetched += 1
          totalPages ??= pageNumber(response.link.last) ?? (response.link.next ? null : pagesFetched)
          for (const raw of page) {
            if (isPullRequest(raw)) continue
            if (issues.length >= cap) {
              capped = true
              break
            }
            issues.push(mapIssue(raw))
          }
          if (issues.length >= cap && response.link.next) capped = true
          onProgress?.({
            phase: 'issues',
            loaded: issues.length,
            pagesFetched,
            totalPages,
            nextUrl: response.link.next ?? null,
          })
          return !capped && (maxPages === undefined || pagesFetched < maxPages)
        },
        signal,
      )
      return { issues, totalPages, capped }
    },

    async loadComments(ref, issues, { maxCommentsPerIssue, signal, onProgress }) {
      const total = issues.filter(needsComments).length
      let done = 0
      const result: Issue[] = []
      for (const issue of issues) {
        signal?.throwIfAborted()
        if (issue.commentsFetched) {
          result.push(issue)
          continue
        }
        if (issue.commentCount === 0) {
          result.push(attachComments(issue, [], maxCommentsPerIssue))
          continue
        }
        const path = `${repoPath(ref)}/issues/${issue.number}/comments?per_page=${PER_PAGE}`
        const first = await http.request<GitHubComment[]>(path, { signal })
        const comments = [...first.body]
        if (first.link.last && needsLastPage(issue, maxCommentsPerIssue)) {
          const last = await http.request<GitHubComment[]>(first.link.last, { signal })
          const seen = new Set(comments.map((c) => c.id))
          comments.push(...last.body.filter((c) => !seen.has(c.id)))
        }
        const updated = attachComments(issue, comments, maxCommentsPerIssue)
        result.push(updated)
        done += 1
        onProgress?.({ phase: 'comments', done, total, issue: updated })
      }
      return result
    },

    async load(ref, options) {
      const { signal, onProgress, maxCommentsPerIssue } = options
      const repo = await loader.loadRepo(ref, signal)
      const [projectContext, loaded] = await Promise.all([
        loader.loadProjectContext(repo, signal),
        loader.loadIssues(repo.ref, options),
      ])
      signal?.throwIfAborted()
      const cost = estimateCommentCost(loaded.issues, maxCommentsPerIssue)
      const fetchComments = await options.shouldFetchComments(cost)
      signal?.throwIfAborted()
      const issues = fetchComments
        ? await loader.loadComments(repo.ref, loaded.issues, { maxCommentsPerIssue, signal, onProgress })
        : loaded.issues
      return {
        repo,
        projectContext,
        issues,
        totalPages: loaded.totalPages,
        capped: loaded.capped,
        commentsFetched: fetchComments,
      }
    },
  }
  return loader
}
