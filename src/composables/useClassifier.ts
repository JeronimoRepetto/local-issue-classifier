// The Classify run (SPEC.md §2.4, §4.5, §4.8): a module singleton that wires
// the runner to the in-memory Jev key, the preferences, the run guard and the
// current analysis. Each result is written through useAnalysis().applyResult
// as it arrives (coalesced saves) and flushed when the run ends. Resuming after
// a reload is simply starting again: only unclassified / stale issues are sent.
import { computed, reactive } from 'vue'
import { markStale } from '../domain/analysis'
import { estimateRun } from '../domain/estimate'
import { buildIssueState } from '../domain/jevState'
import { estimateSeconds, scopeCounts, selectForClassification } from '../domain/classifyRun'
import type { ClassifyScope, RunProgress, RunSummary, ScopeCounts } from '../domain/classifyRun'
import { createJevClient } from '../adapters/jev/client'
import type { JevClient } from '../adapters/jev/client'
import { createHttpJevTransport, resolveJevBaseUrl } from '../adapters/jev/transport'
import { QUESTIONS_TOKENS, QUESTIONS_VERSION } from '../adapters/jev/questions'
import { runClassification } from '../adapters/jev/runner'
import type { Sleep } from '../adapters/jev/runner'
import { useAnalysis } from './useAnalysis'
import { usePreferences } from './usePreferences'
import { useSecrets } from './useSecrets'
import { setRunActive } from './useRunGuard'

export type ClassifierPhase = 'idle' | 'running' | 'finished'

export interface ClassifyRequest {
  scope?: ClassifyScope
  /** Restrict to these issue numbers (filtered view, retry failed). */
  only?: readonly number[]
}

export interface ClassifyEstimate {
  requests: number
  inputTokens: number
  costUsd: number
  seconds: number
  /** Selected issues that fail the size guard; they are never sent. */
  tooLarge: number
}

type ClientFactory = (options: { getApiKey: () => string; model: string }) => Pick<JevClient, 'model' | 'classify'>

export interface ClassifierConfig {
  createClient?: ClientFactory
  sleep?: Sleep
  random?: () => number
  now?: () => Date
}

const defaultClientFactory: ClientFactory = ({ getApiKey, model }) =>
  createJevClient({
    transport: createHttpJevTransport({
      baseUrl: resolveJevBaseUrl(import.meta.env.VITE_JEV_BASE_URL),
      getApiKey,
      fetch: (input, init) => globalThis.fetch(input, init),
    }),
    model,
  })

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
const secrets = useSecrets()
const prefs = usePreferences()

const hasIssues = computed(() => {
  const a = analysis.current.value
  if (!a) return false
  const dismissed = new Set(a.working.dismissed)
  return a.rows.some((r) => !dismissed.has(r.issue.number))
})

/** §2.4: a Jev key in memory and at least one non-dismissed issue. */
const canClassify = computed(() => secrets.hasJevKey.value && hasIssues.value)

function counts(filteredNumbers?: readonly number[]): ScopeCounts | null {
  const a = analysis.current.value
  return a ? scopeCounts(a, QUESTIONS_VERSION, filteredNumbers) : null
}

/** §4.7: sum of each state's tokens plus the question tokens. */
function estimate(request: ClassifyRequest = {}): ClassifyEstimate | null {
  const a = analysis.current.value
  if (!a) return null
  const issues = selectForClassification(a, {
    scope: request.scope ?? 'unclassified',
    only: request.only,
    questionsVersion: QUESTIONS_VERSION,
  })
  const tokens: number[] = []
  let tooLarge = 0
  for (const issue of issues) {
    const built = buildIssueState(issue, a.projectContext, {
      now: config.now,
      maxCommentsPerIssue: prefs.state.maxCommentsPerIssue,
    })
    if (built.ok) tokens.push(built.estimatedTokens)
    else tooLarge++
  }
  const run = estimateRun(tokens, QUESTIONS_TOKENS)
  return { ...run, seconds: estimateSeconds(run.requests, prefs.state.concurrency), tooLarge }
}

async function start(request: ClassifyRequest = {}): Promise<RunSummary | null> {
  if (state.phase === 'running' || !secrets.hasJevKey.value) return null
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
  state.progress = { done: 0, total: issues.length, failed: 0, rateLimited: 0, concurrency: prefs.state.concurrency }
  setRunActive(true)

  let summary: RunSummary
  try {
    summary = await runClassification({
      issues,
      projectContext: current.projectContext,
      client: config.createClient({ getApiKey: () => secrets.state.jevApiKey, model: prefs.state.jevModel }),
      concurrency: prefs.state.concurrency,
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

  // §2.4: the key was rejected, so it is dropped from memory. The GitHub token stays.
  if (summary.status === 'auth-failed') secrets.setJevKey('')
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
