// The Classify run: a module singleton that wires
// the runner to the in-memory Jev key, the preferences, the run guard and the
// current analysis. Each result is written through useAnalysis().applyResult
// as it arrives (coalesced saves) and flushed when the run ends. Resuming after
// a reload is simply starting again: only unclassified / stale issues are sent.
import { computed, reactive } from 'vue'
import { markStale } from '../domain/analysis'
import { estimateBatchedRun, estimateRun } from '../domain/estimate'
import { buildIssueState } from '../domain/jevState'
import { planBatches } from '../domain/jevBatchState'
import { estimateBatchedSeconds, estimateSeconds, scopeCounts, selectForClassification } from '../domain/classifyRun'
import { ANSWER_DIMENSIONS } from '../domain/classification'
import type { ClassifyMode, Issue, ProjectContext, TrimmingProfileId } from '../domain/types'
import type { ClassifyScope, RunProgress, RunSummary, ScopeCounts } from '../domain/classifyRun'
import type { JevClient } from '../adapters/jev/client'
import { QUESTIONS_TOKENS, QUESTIONS_VERSION } from '../adapters/jev/questions'
import { BATCH_QUESTION_BUDGET } from '../adapters/jev/batchQuestions'
import { runClassification } from '../adapters/jev/runner'
import type { Sleep } from '../adapters/jev/runner'
import { useAnalysis } from './useAnalysis'
import { usePreferences } from './usePreferences'
import { useProvider } from './useProvider'
import { setRunActive } from './useRunGuard'

export type ClassifierPhase = 'idle' | 'running' | 'finished'

/**
 * Per-provider latency assumption for the pre-run estimate (T-provider-switch,
 * docs/local-providers.md, docs/browser-inference.md): classifyRun's
 * SECONDS_PER_CALL (2 s, measured 2026-09-23) stays the cloud default.
 * - Local: no network round trip, but still a real forward pass on whatever
 *   hardware runs the server; kept as a small, conservative constant rather
 *   than the cloud's 2 s until a server is actually measured end to end
 *   (docs/local-providers.md's single-request smoke checks saw ~0.2-0.5 s).
 * - Browser: one forward pass per question (adapters/browser/browserJevTransport.ts),
 *   five questions per issue (ANSWER_DIMENSIONS) — always per-issue, concurrency 1.
 */
export const LOCAL_SECONDS_PER_CALL = 1
export const BROWSER_SECONDS_PER_QUESTION = 2.5

export interface ClassifyRequest {
  scope?: ClassifyScope
  /** Restrict to these issue numbers (filtered view, retry failed). */
  only?: readonly number[]
}

export interface ClassifyEstimate {
  mode: ClassifyMode
  /** Requests the run will send: batches (usually 1) or issues. */
  requests: number
  /** Trimming profile the batch fitter would use; null in per-issue mode. */
  profile: TrimmingProfileId | null
  inputTokens: number
  costUsd: number
  seconds: number
  /** Selected issues that fail the size guard; they are never sent. */
  tooLarge: number
}

type ClientFactory = (options: {
  getApiKey: () => string
  model: string
}) => Pick<JevClient, 'model' | 'classify' | 'classifyBatch'>

export interface ClassifierConfig {
  createClient?: ClientFactory
  sleep?: Sleep
  random?: () => number
  now?: () => Date
}

// T16: the selected provider (TypeSafe via /jev, or a local server) builds the client.
const defaultClientFactory: ClientFactory = ({ getApiKey, model }) =>
  useProvider().createClient({ getApiKey, model })

let config: Required<Pick<ClassifierConfig, 'createClient' | 'now'>> & ClassifierConfig = {
  createClient: defaultClientFactory,
  now: () => new Date(),
}

/** Dependency injection for tests (fake client, instant sleep, fixed clock). */
export function configureClassifier(next: ClassifierConfig): void {
  config = { ...config, ...next }
}

const state = reactive<{
  phase: ClassifierPhase
  progress: RunProgress | null
  summary: RunSummary | null
  lastFailed: number[]
}>({ phase: 'idle', progress: null, summary: null, lastFailed: [] })

let controller: AbortController | null = null

const analysis = useAnalysis()
const provider = useProvider()
const prefs = usePreferences()

const hasIssues = computed(() => {
  const a = analysis.current.value
  if (!a) return false
  const dismissed = new Set(a.working.dismissed)
  return a.rows.some((r) => !dismissed.has(r.issue.number))
})

/** §2.4: a ready provider (TypeSafe: a Jev key; local: a valid base URL) and at least one non-dismissed issue. */
const canClassify = computed(() => provider.ready.value && hasIssues.value)

function counts(filteredNumbers?: readonly number[]): ScopeCounts | null {
  const a = analysis.current.value
  return a ? scopeCounts(a, QUESTIONS_VERSION, filteredNumbers) : null
}

// Preferences.classifyMode and trimmingFloor are exposed in Settings (ProviderSelector's
// Advanced disclosure, WIRE-2). Showing estimate.profile / progress.profile in the
// Classify bar itself ("1 request, compact profile") is not wired up yet.
// A browser provider always runs per issue, one at a time (docs/browser-inference.md):
// a batched state is too large for the page's attention buffers, and a second
// concurrent forward pass would only compete for the same GPU.
const classifyMode = (): ClassifyMode =>
  provider.isBrowser.value || prefs.state.classifyMode === 'per-issue' ? 'per-issue' : 'batched'
const concurrency = (): number => (provider.isBrowser.value ? 1 : prefs.state.concurrency)

/**
 * §4.7. Batched: the fitter's plan, each request's tokens counted once.
 * Per-issue: each state's tokens plus the question tokens.
 */
function estimate(request: ClassifyRequest = {}): ClassifyEstimate | null {
  const a = analysis.current.value
  if (!a) return null
  const issues = selectForClassification(a, {
    scope: request.scope ?? 'unclassified',
    only: request.only,
    questionsVersion: QUESTIONS_VERSION,
  })
  const run =
    classifyMode() === 'batched' ? estimateBatched(issues, a.projectContext) : estimatePerIssue(issues, a.projectContext)
  // A local server or the browser costs nothing per token; requests and latency still apply (T16).
  return provider.isLocal.value || provider.isBrowser.value ? { ...run, costUsd: 0 } : run
}

/** Overrides classifyRun's cloud default only for a local or browser provider. */
function perCallSecondsOverride(): number | undefined {
  if (provider.isBrowser.value) return BROWSER_SECONDS_PER_QUESTION * ANSWER_DIMENSIONS.length
  if (provider.isLocal.value) return LOCAL_SECONDS_PER_CALL
  return undefined
}

function estimateBatched(issues: readonly Issue[], ctx: ProjectContext): ClassifyEstimate {
  const plan = planBatches(issues, ctx, {
    now: config.now,
    maxCommentsPerIssue: prefs.state.maxCommentsPerIssue,
    floor: prefs.state.trimmingFloor,
    questions: BATCH_QUESTION_BUDGET,
  })
  const run = estimateBatchedRun(plan.batches)
  return {
    ...run,
    mode: 'batched',
    profile: plan.batches.length > 0 ? plan.profile : null,
    seconds: estimateBatchedSeconds(run.requests, concurrency(), perCallSecondsOverride()),
    tooLarge: plan.tooLarge.length,
  }
}

function estimatePerIssue(issues: readonly Issue[], ctx: ProjectContext): ClassifyEstimate {
  const tokens: number[] = []
  let tooLarge = 0
  for (const issue of issues) {
    const built = buildIssueState(issue, ctx, {
      now: config.now,
      maxCommentsPerIssue: prefs.state.maxCommentsPerIssue,
    })
    if (built.ok) tokens.push(built.estimatedTokens)
    else tooLarge++
  }
  const run = estimateRun(tokens, QUESTIONS_TOKENS)
  return {
    ...run,
    mode: 'per-issue',
    profile: null,
    seconds: estimateSeconds(run.requests, concurrency(), perCallSecondsOverride()),
    tooLarge,
  }
}

async function start(request: ClassifyRequest = {}): Promise<RunSummary | null> {
  if (state.phase === 'running' || !provider.ready.value) return null
  // Classifications from an older questions version become stale (§4.8).
  analysis.update((a) => markStale(a, QUESTIONS_VERSION), 'classification')
  const current = analysis.current.value
  if (!current) return null

  const issues = selectForClassification(current, {
    scope: request.scope ?? 'unclassified',
    only: request.only,
    questionsVersion: QUESTIONS_VERSION,
  })
  const runId = current.id
  const run = new AbortController()
  controller = run
  state.phase = 'running'
  state.summary = null
  state.progress = { done: 0, total: issues.length, failed: 0, rateLimited: 0, concurrency: concurrency() }
  setRunActive(true)

  let summary: RunSummary
  try {
    summary = await runClassification({
      issues,
      projectContext: current.projectContext,
      client: config.createClient({ getApiKey: provider.getApiKey, model: provider.model() }),
      concurrency: concurrency(),
      mode: classifyMode(),
      trimmingFloor: prefs.state.trimmingFloor,
      questionsVersion: QUESTIONS_VERSION,
      maxCommentsPerIssue: prefs.state.maxCommentsPerIssue,
      lowConfidenceThreshold: prefs.state.lowConfidenceThreshold,
      signal: run.signal,
      now: config.now,
      sleep: config.sleep,
      random: config.random,
      onResult: (issueNumber, outcome) => {
        // Another analysis was opened mid-run: never write into it.
        if (analysis.current.value?.id !== runId) {
          run.abort()
          return
        }
        analysis.applyResult(issueNumber, outcome)
      },
      onProgress: (progress) => {
        state.progress = progress
      },
    })
  } finally {
    setRunActive(false)
    analysis.flush()
    controller = null
    state.phase = 'finished'
  }

  // §2.4: the key was rejected, so the provider's key is dropped from memory. The GitHub token stays.
  if (summary.status === 'auth-failed') provider.dropKey()
  state.summary = summary
  state.lastFailed = summary.failedNumbers
  return summary
}

function cancel(): void {
  controller?.abort()
}

/** Re-runs only the failures of the last run (§2.4 step 5). */
function retryFailed(): Promise<RunSummary | null> {
  return start({ scope: 'unclassified', only: [...state.lastFailed] })
}

/** Back to idle, e.g. when the summary is dismissed. No-op while running. */
function reset(): void {
  if (state.phase === 'running') return
  state.phase = 'idle'
  state.progress = null
  state.summary = null
}

export function useClassifier() {
  return { state, canClassify, counts, estimate, start, cancel, retryFailed, reset }
}
