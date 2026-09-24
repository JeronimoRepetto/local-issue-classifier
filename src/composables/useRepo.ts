// New analysis / refresh orchestration: drives the GitHub
// loader through a small state machine so the UI can show progress and pause
// for the huge-repo (>20 pages) and comment-cost (80% of remaining quota)
// confirmations. On completion it builds the Analysis (createAnalysis) or
// merges it (mergeRefetch) and hands it to useAnalysis().setCurrent.
//
// Token and preferences are read through injected hooks so this module never
// depends on Task 4's useSecrets / usePreferences (not built yet in this
// lane). configureRepo() lets the integration task wire the real ones later;
// until then, requests are anonymous and preferences are read directly from
// the shared `STORAGE_KEYS.preferences` entry, the same way useAnalysis.ts's
// default `lastOpened` hook does.
import { reactive } from 'vue'
import type { AnalysisSummary, Analysis, Preferences, ProjectContext, Repo, RepoRef, Issue } from '../domain/types'
import { defaultPreferences, STORAGE_KEYS } from '../domain/types'
import { createGitHubHttp } from '../adapters/github/http'
import type { GitHubHttp, RateLimitInfo } from '../adapters/github/http'
import { createGitHubLoader, estimateCommentCost, PER_PAGE } from '../adapters/github/loader'
import type { CommentCost, GitHubLoader, IssueStateFilter, LoadProgress } from '../adapters/github/loader'
import { GitHubHttpError, IssuesDisabledError, NotFoundError, RateLimitedError } from '../adapters/github/errors'
import { createAnalysis, mergeRefetch } from '../domain/analysis'
import type { FetchedData } from '../domain/analysis'
import { getAppStorage } from '../adapters/storage/appStorage'
import { getAnalysisDb } from '../adapters/storage/analysisDb'
import { useAnalysis } from './useAnalysis'
import { useAnalyses } from './useAnalyses'

/** Above this page count, loading pauses for confirmation. */
export const HUGE_REPO_PAGE_THRESHOLD = 20
/** The comment fetch is confirmed when it would use more than this share of the remaining quota. */
export const COMMENT_COST_QUOTA_RATIO = 0.8

export type RepoLoadPhase =
  | 'idle'
  | 'loading'
  | 'confirm-huge-repo'
  | 'confirm-comment-cost'
  | 'rate-limited'
  | 'error'
  | 'done'

export type CommentCostDecision = 'fetch' | 'skip' | 'cancel'

export interface RepoLoadState {
  phase: RepoLoadPhase
  mode: 'new' | 'refresh' | null
  progress: LoadProgress | null
  totalPages: number | null
  pendingCost: CommentCost | null
  error: string | null
  rateLimitResetAt: number | null
  rateLimit: RateLimitInfo | null
  /** True once, right after a private repo is first seen this session. */
  privateRepoNotice: boolean
  analysisId: string | null
}

export interface RepoConfig {
  getToken?: () => string
  onUnauthorized?: () => void
  getPreferences?: () => Preferences
  fetchImpl?: typeof fetch
  now?: () => string
  idFactory?: () => string
}

function freshState(): RepoLoadState {
  return {
    phase: 'idle',
    mode: null,
    progress: null,
    totalPages: null,
    pendingCost: null,
    error: null,
    rateLimitResetAt: null,
    rateLimit: null,
    privateRepoNotice: false,
    analysisId: null,
  }
}

/** Also used by HomeContainer to read the first-run checklist until Task 4's usePreferences lands. */
export function readStoredPreferences(): Preferences {
  try {
    const raw = getAppStorage().getItem(STORAGE_KEYS.preferences)
    if (!raw) return defaultPreferences()
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaultPreferences()
    return { ...defaultPreferences(), ...(parsed as Partial<Preferences>) }
  } catch {
    return defaultPreferences()
  }
}

/** Marks the "2 Repository" onboarding step done, the same read-modify-write way writeLastRepo does. */
function markRepoOnboardingStep(): void {
  const storage = getAppStorage()
  try {
    const prefs = readStoredPreferences()
    if (prefs.onboarding.repo) return
    storage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({ ...prefs, onboarding: { ...prefs.onboarding, repo: true } }),
    )
  } catch {
    // Losing this checkbox only affects the first-run checklist; never block the load.
  }
}

/** Mirrors useAnalysis.ts's default last-opened hook: patches one field in place. */
function writeLastRepo(text: string): void {
  const storage = getAppStorage()
  try {
    let existing: unknown = null
    try {
      existing = JSON.parse(storage.getItem(STORAGE_KEYS.preferences) ?? 'null')
    } catch {
      existing = null
    }
    const base = existing && typeof existing === 'object' ? existing : defaultPreferences()
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...base, lastRepo: text }))
  } catch {
    // Losing the last-repo prefill is never worth blocking a load over.
  }
}

function describeError(error: unknown): string {
  if (error instanceof NotFoundError) {
    return 'Repository not found. If it is private, enter a token with access to it.'
  }
  if (error instanceof IssuesDisabledError) return error.message
  if (error instanceof GitHubHttpError) return `GitHub request failed (status ${error.status}).`
  if (error instanceof Error) return error.message
  return 'Something went wrong while loading this repository.'
}

type IssuesStep = 'peek' | 'rest' | 'decide-comments' | 'fetch-comments' | 'finalize'

interface PendingRun {
  ref: RepoRef
  stateFilter: IssueStateFilter
  mode: 'new' | 'refresh'
  refreshTarget: Analysis | null
  http: GitHubHttp
  loader: GitHubLoader
  prefs: Preferences
  controller: AbortController
  step: IssuesStep
  issuesAcc: Issue[]
  /** Absolute URL of the page after the first one, captured by the peek fetch. */
  peekNextUrl: string | null
  repo: Repo | null
  projectContext: ProjectContext | null
  hugeRepoConfirmed: boolean
  commentsFetchedFlag: boolean
  cancelled: boolean
}

// ── Module-level singleton state ─────────────────────────────────────
const state = reactive<RepoLoadState>(freshState())

let getToken: () => string = () => ''
let onUnauthorized: () => void = () => {}
let getPreferences: () => Preferences = readStoredPreferences
let fetchImpl: typeof fetch = (...args: Parameters<typeof fetch>) => fetch(...args)
let clock: () => string = () => new Date().toISOString()
let idFactory: () => string = () => crypto.randomUUID()
let hasShownPrivateRepoNotice = false

let pending: PendingRun | null = null
let hugeRepoResolve: ((proceed: boolean) => void) | null = null
let costResolve: ((decision: CommentCostDecision) => void) | null = null

/** Dependency injection for the token, preferences and clock; Task 4 wires the real ones. */
export function configureRepo(config: RepoConfig): void {
  if (config.getToken) getToken = config.getToken
  if (config.onUnauthorized) onUnauthorized = config.onUnauthorized
  if (config.getPreferences) getPreferences = config.getPreferences
  if (config.fetchImpl) fetchImpl = config.fetchImpl
  if (config.now) clock = config.now
  if (config.idFactory) idFactory = config.idFactory
}

/** Test-only: clears module singleton state, including the private-repo-notice-once flag. */
export function resetRepoForTests(): void {
  hasShownPrivateRepoNotice = false
  pending = null
  hugeRepoResolve = null
  costResolve = null
  Object.assign(state, freshState())
}

function waitForHugeRepoDecision(): Promise<boolean> {
  return new Promise((resolve) => {
    hugeRepoResolve = resolve
  })
}

function waitForCostDecision(): Promise<CommentCostDecision> {
  return new Promise((resolve) => {
    costResolve = resolve
  })
}

async function fetchIssuesPeek(
  run: PendingRun,
): Promise<{ issues: Issue[]; totalPages: number | null; capped: boolean }> {
  let nextUrl: string | null = null
  // Exactly one page: capping by issue count instead would pull a second page
  // whenever the first holds pull requests, and resuming from its `next` link
  // would then skip the rest of that second page.
  const result = await run.loader.loadIssues(run.ref, {
    state: run.stateFilter,
    maxIssues: Math.max(0, Math.floor(run.prefs.maxIssuesToLoad)),
    maxPages: 1,
    signal: run.controller.signal,
    onProgress: (p) => {
      state.progress = p
      if (p.phase === 'issues') {
        state.totalPages = p.totalPages
        nextUrl = p.nextUrl
      }
    },
  })
  run.peekNextUrl = nextUrl
  return result
}

async function fetchIssuesRest(
  run: PendingRun,
  remainingCap: number,
): Promise<{ issues: Issue[]; totalPages: number | null; capped: boolean }> {
  return run.loader.loadIssues(run.ref, {
    state: run.stateFilter,
    maxIssues: remainingCap,
    resumeFrom: run.peekNextUrl ?? undefined,
    signal: run.controller.signal,
    onProgress: (p) => {
      state.progress = p
      if (p.phase === 'issues') state.totalPages = p.totalPages
    },
  })
}

/** Mutates `run.issuesAcc` in place as progress arrives, so a rate limit mid-run loses nothing. */
async function doFetchComments(run: PendingRun): Promise<void> {
  const indexByNumber = new Map(run.issuesAcc.map((issue, i) => [issue.number, i]))
  await run.loader.loadComments(run.ref, run.issuesAcc, {
    maxCommentsPerIssue: run.prefs.maxCommentsPerIssue,
    signal: run.controller.signal,
    onProgress: (p) => {
      state.progress = p
      if (p.phase === 'comments') {
        const i = indexByNumber.get(p.issue.number)
        if (i !== undefined) run.issuesAcc[i] = p.issue
      }
    },
  })
}

/**
 * Above the threshold by the reported page count or, when GitHub does not report
 * one (cursor pagination), by the pages the user's cap alone could need.
 */
function isHugeRepo(totalPages: number | null, userCap: number): boolean {
  const pages = totalPages ?? Math.ceil(userCap / PER_PAGE)
  return pages > HUGE_REPO_PAGE_THRESHOLD
}

/**
 * Issues phase. Fetches one page first so the total page
 * count is known before spending quota on the rest: above
 * HUGE_REPO_PAGE_THRESHOLD it pauses for confirmation. Declining keeps only
 * what was already loaded (a normal, capped completion, not an error).
 */
async function runIssuesPhase(run: PendingRun): Promise<void> {
  if (run.step === 'peek') {
    const peek = await fetchIssuesPeek(run)
    if (run.cancelled) return
    run.issuesAcc = peek.issues
    // `peek.capped` is expected here: the peek's own cap is one page's worth, so
    // it says nothing about whether more *real* pages exist. Only the user's own
    // maxIssuesToLoad, already reached, or no next page, ends it early. GitHub's
    // issues list uses cursor pagination (`after=` links with `next`/`prev` only,
    // no `rel="last"`), so an unknown total with a next page must keep going.
    const userCap = Math.floor(run.prefs.maxIssuesToLoad)
    const reachedUserCap = run.issuesAcc.length >= userCap
    if (reachedUserCap || run.peekNextUrl === null) {
      run.step = 'decide-comments'
      return
    }
    if (isHugeRepo(peek.totalPages, userCap) && !run.hugeRepoConfirmed) {
      state.phase = 'confirm-huge-repo'
      state.totalPages = peek.totalPages
      const proceed = await waitForHugeRepoDecision()
      if (run.cancelled) return
      if (!proceed) {
        run.step = 'decide-comments'
        return
      }
      run.hugeRepoConfirmed = true
    }
    run.step = 'rest'
    state.phase = 'loading'
  }
  if (run.step === 'rest') {
    const remainingCap = Math.max(0, Math.floor(run.prefs.maxIssuesToLoad) - run.issuesAcc.length)
    if (remainingCap > 0) {
      const rest = await fetchIssuesRest(run, remainingCap)
      if (run.cancelled) return
      run.issuesAcc = run.issuesAcc.concat(rest.issues)
    }
    run.step = 'decide-comments'
  }
}

function finalizeAnalysis(run: PendingRun): void {
  if (run.cancelled) return
  const fetched: FetchedData = {
    repo: run.repo!,
    issues: run.issuesAcc,
    projectContext: run.projectContext!,
    commentsFetched: run.commentsFetchedFlag,
  }
  const result: Analysis =
    run.mode === 'new'
      ? createAnalysis({
          id: idFactory(),
          repo: fetched.repo,
          stateFilter: run.stateFilter,
          now: clock(),
          prefs: run.prefs,
          projectContext: fetched.projectContext,
          issues: fetched.issues,
          commentsFetched: fetched.commentsFetched,
        })
      : mergeRefetch(run.refreshTarget!, fetched, clock())
  useAnalysis().setCurrent(result)
  state.analysisId = result.id
  if (run.mode === 'new') markRepoOnboardingStep()
  pending = null
  state.phase = 'done'
}

/** Runs the remaining steps of one load, from wherever `run.step` left off. */
async function advance(run: PendingRun): Promise<void> {
  if (run.step === 'peek' || run.step === 'rest') {
    await runIssuesPhase(run)
    if (run.cancelled) return
  }
  if (run.step === 'decide-comments') {
    const cost = estimateCommentCost(run.issuesAcc, run.prefs.maxCommentsPerIssue)
    if (run.prefs.fetchComments === 'never') {
      run.step = 'finalize'
    } else if (cost.requests === 0) {
      run.step = 'fetch-comments'
    } else {
      const remaining = run.http.getRateLimit()?.remaining ?? null
      const overQuota = remaining !== null && cost.requests > COMMENT_COST_QUOTA_RATIO * remaining
      if (overQuota) {
        state.phase = 'confirm-comment-cost'
        state.pendingCost = cost
        const decision = await waitForCostDecision()
        state.pendingCost = null
        if (run.cancelled) return
        if (decision === 'cancel') {
          pending = null
          state.phase = 'idle'
          return
        }
        run.step = decision === 'fetch' ? 'fetch-comments' : 'finalize'
      } else {
        run.step = 'fetch-comments'
      }
    }
    state.phase = 'loading'
  }
  if (run.step === 'fetch-comments') {
    await doFetchComments(run)
    if (run.cancelled) return
    run.commentsFetchedFlag = true
    run.step = 'finalize'
  }
  if (run.step === 'finalize') {
    finalizeAnalysis(run)
  }
}

/** Shared by startNew/refresh (first attempt) and resume (retry). */
async function runPending(run: PendingRun): Promise<void> {
  try {
    if (!run.repo) {
      run.repo = await run.loader.loadRepo(run.ref, run.controller.signal)
      if (run.cancelled) return
      if (run.repo.isPrivate && !hasShownPrivateRepoNotice) {
        state.privateRepoNotice = true
        hasShownPrivateRepoNotice = true
      }
    }
    if (!run.projectContext) {
      run.projectContext = await run.loader.loadProjectContext(run.repo, run.controller.signal)
      if (run.cancelled) return
    }
    await advance(run)
  } catch (error) {
    if (run.cancelled) return
    if (error instanceof RateLimitedError) {
      state.phase = 'rate-limited'
      state.rateLimitResetAt = error.resetAt
      return
    }
    pending = null
    state.phase = 'error'
    state.error = describeError(error)
  }
}

function newRun(ref: RepoRef, stateFilter: IssueStateFilter, mode: 'new' | 'refresh', refreshTarget: Analysis | null) {
  const http = createGitHubHttp({
    fetch: fetchImpl,
    getToken,
    onUnauthorized,
    onRateLimit: (info) => {
      state.rateLimit = info
    },
  })
  const run: PendingRun = {
    ref,
    stateFilter,
    mode,
    refreshTarget,
    http,
    loader: createGitHubLoader(http),
    prefs: getPreferences(),
    controller: new AbortController(),
    step: 'peek',
    issuesAcc: [],
    peekNextUrl: null,
    repo: null,
    projectContext: null,
    hugeRepoConfirmed: false,
    commentsFetchedFlag: false,
    cancelled: false,
  }
  pending = run
  Object.assign(state, freshState(), { phase: 'loading' as const, mode })
  return run
}

/** A saved analysis for the same repository (case-insensitive) and state filter, if any. */
function findExisting(ref: RepoRef, stateFilter: IssueStateFilter): AnalysisSummary | null {
  const fullName = `${ref.owner}/${ref.repo}`.toLowerCase()
  for (const entry of useAnalyses().state.entries) {
    if (entry.status === 'ok' && entry.summary.repoFullName.toLowerCase() === fullName && entry.summary.stateFilter === stateFilter) {
      return entry.summary
    }
  }
  return null
}

async function getAnalysisForRefresh(id: string): Promise<Analysis | null> {
  const current = useAnalysis().current.value
  if (current && current.id === id) return current
  // Saved analyses live in IndexedDB (analysisDb.ts), not localStorage.
  const result = await getAnalysisDb().loadAnalysis(id)
  return result.ok ? result.analysis : null
}

/** Starts loading a brand-new analysis. `rawText`, when given, is saved as the last-repo preference. */
function startNew(ref: RepoRef, stateFilter: IssueStateFilter, rawText?: string): Promise<void> {
  if (rawText !== undefined) writeLastRepo(rawText)
  return runPending(newRun(ref, stateFilter, 'new', null))
}

/** Re-fetches an existing analysis (current or saved) and merges the result. */
async function refresh(analysisId: string): Promise<void> {
  const target = await getAnalysisForRefresh(analysisId)
  if (!target) {
    Object.assign(state, freshState(), { phase: 'error' as const, error: 'This analysis could not be loaded.' })
    return
  }
  return runPending(newRun(target.repo.ref, target.stateFilter, 'refresh', target))
}

/** Continues after a rate limit, from the next unfetched page or comment request. */
function resume(): Promise<void> {
  if (!pending || state.phase !== 'rate-limited') return Promise.resolve()
  state.phase = 'loading'
  state.error = null
  state.rateLimitResetAt = null
  return runPending(pending)
}

/** Aborts the in-flight load (if any) and returns to idle. Nothing is saved. */
function cancel(): void {
  const run = pending
  if (!run) return
  run.cancelled = true
  run.controller.abort()
  if (hugeRepoResolve) {
    const resolve = hugeRepoResolve
    hugeRepoResolve = null
    resolve(false)
  }
  if (costResolve) {
    const resolve = costResolve
    costResolve = null
    resolve('cancel')
  }
  pending = null
  Object.assign(state, freshState())
}

/** Resolves the huge-repo pause. Declining keeps only what was already loaded. */
function confirmHugeRepo(proceed: boolean): void {
  if (!hugeRepoResolve) return
  const resolve = hugeRepoResolve
  hugeRepoResolve = null
  resolve(proceed)
}

/** Resolves the comment-cost pause. 'cancel' aborts the whole load, like cancel(). */
function confirmCommentCost(decision: CommentCostDecision): void {
  if (decision === 'cancel') {
    cancel()
    return
  }
  if (!costResolve) return
  const resolve = costResolve
  costResolve = null
  resolve(decision)
}

/** Clears a finished ('done' or 'error') state back to idle, e.g. to dismiss a notice. */
function dismiss(): void {
  pending = null
  Object.assign(state, freshState())
}

export function useRepo() {
  return {
    state,
    findExisting,
    startNew,
    refresh,
    resume,
    cancel,
    confirmHugeRepo,
    confirmCommentCost,
    dismiss,
  }
}
