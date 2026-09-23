// local-issue-classifier — the classification runner (SPEC.md §2.4, §4.5). Pure of Vue.
//
// One request per issue through a bounded, adaptive pool. The transport makes a
// single attempt; this layer owns retries, backoff with jitter, `retry-after`
// (capped at 60 s), the adaptive throttle and the auth abort. Every finished
// issue is reported through `onResult` at once, so the caller can save results
// incrementally; an aborted issue reports nothing and stays unclassified.
import { buildIssueState } from '../../domain/jevState'
import { toClassification, UNEXPECTED_JEV_RESPONSE } from '../../domain/classification'
import type { ClassificationOutcome } from '../../domain/analysis'
import type { RunProgress, RunSummary } from '../../domain/classifyRun'
import type { Issue, ProjectContext } from '../../domain/types'
import type { JevState } from '../../domain/jevState'
import type { JevClient } from './client'
import type { JevHttpResult, SystemOneResponseBody } from './transport'
import { JevTransportError } from './transport'
import { createThrottle, runPool } from './pool'

export const MAX_RETRIES = 3
export const BACKOFF_START_MS = 500
export const BACKOFF_MAX_MS = 5_000
export const JITTER = 0.25
export const RETRY_AFTER_CAP_MS = 60_000
export const DEFAULT_LOW_CONFIDENCE = 0.5

export const rateLimitedMessage = (retries: number) => `Rate limited — retried ${retries}×`
export const RATE_LIMITED_MESSAGE = rateLimitedMessage(MAX_RETRIES)
export const TIMEOUT_MESSAGE = 'Timeout'
const DETAIL_MAX_CHARS = 200

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

export interface RunnerOptions {
  issues: readonly Issue[]
  projectContext: ProjectContext
  client: Pick<JevClient, 'model' | 'classify'>
  /** Configured pool size (Preferences.concurrency), 1..8. */
  concurrency: number
  questionsVersion: number
  /** Called once per finished issue, as soon as it finishes. */
  onResult: (issueNumber: number, outcome: ClassificationOutcome) => void
  onProgress?: (progress: RunProgress) => void
  /** Cancel: aborts in-flight requests; completed results are kept. */
  signal?: AbortSignal
  maxCommentsPerIssue?: number
  /** Size-guard override, for tests. */
  maxStateTokens?: number
  lowConfidenceThreshold?: number
  maxRetries?: number
  /** Clock for date buckets, classifiedAt and elapsed time. */
  now?: () => Date
  /** Clock for the throttle's 10 s window, in ms. */
  throttleNow?: () => number
  sleep?: Sleep
  /** [0, 1); drives the jitter. */
  random?: () => number
}

/** setTimeout that rejects with JevTransportError('aborted') when the signal fires. */
export const abortableSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new JevTransportError('aborted'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new JevTransportError('aborted'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

const isRateLimit = (status: number) => status === 429 || status === 529
const isRetryable = (status: number) => status === 408 || status === 429 || (status >= 500 && status <= 599)

/** 401, or the live API's 403 with `authentication_error` (docs say 401). */
export function isAuthFailure(result: JevHttpResult<unknown>): boolean {
  if (result.status === 401) return true
  return result.status === 403 && JSON.stringify(result.body ?? '').includes('authentication_error')
}

/** The field detail of a 422 body; never the request. */
export function validationDetail(body: unknown): string {
  const obj = (body ?? {}) as Record<string, unknown>
  let detail: string | null = null
  if (typeof obj.detail === 'string') detail = obj.detail
  else if (Array.isArray(obj.detail)) {
    detail = obj.detail
      .map((d) => {
        const item = (d ?? {}) as { loc?: unknown; msg?: unknown }
        const loc = Array.isArray(item.loc) ? item.loc.join('.') : ''
        const msg = typeof item.msg === 'string' ? item.msg : ''
        return loc && msg ? `${loc}: ${msg}` : loc || msg
      })
      .filter(Boolean)
      .join('; ')
  } else if (typeof obj.message === 'string') detail = obj.message
  detail = detail?.trim() || 'the request was rejected'
  return detail.length > DETAIL_MAX_CHARS ? `${detail.slice(0, DETAIL_MAX_CHARS - 1)}…` : detail
}

export async function runClassification(options: RunnerOptions): Promise<RunSummary> {
  const now = options.now ?? (() => new Date())
  const sleep = options.sleep ?? abortableSleep
  const random = options.random ?? Math.random
  const maxRetries = options.maxRetries ?? MAX_RETRIES
  const lowConfidence = options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE
  const startedAt = now().getTime()

  // The run's own controller: the caller's cancel, or an auth failure, aborts it.
  const controller = new AbortController()
  const onCancel = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  else options.signal?.addEventListener('abort', onCancel, { once: true })
  const signal = controller.signal

  const throttle = createThrottle({ max: options.concurrency, now: options.throttleNow ?? Date.now })
  const total = options.issues.length
  const counts = { done: 0, failed: 0, rateLimited: 0, classified: 0, lowConfidence: 0, inputTokens: 0 }
  const failedNumbers: number[] = []
  let authFailed = false

  const report = () =>
    options.onProgress?.({
      done: counts.done,
      total,
      failed: counts.failed,
      rateLimited: counts.rateLimited,
      concurrency: throttle.limit,
    })

  const record = (issueNumber: number, outcome: ClassificationOutcome) => {
    counts.done++
    if (outcome.ok) {
      counts.classified++
      counts.inputTokens += outcome.classification.inputTokens
      const min = outcome.classification.minConfidence
      if (min !== undefined && min < lowConfidence) counts.lowConfidence++
    } else {
      counts.failed++
      failedNumbers.push(issueNumber)
    }
    options.onResult(issueNumber, outcome)
    report()
  }

  const backoff = (attempt: number) => {
    const base = Math.min(BACKOFF_START_MS * 2 ** attempt, BACKOFF_MAX_MS)
    return Math.round(base * (1 + (random() * 2 - 1) * JITTER))
  }

  /** false when the wait was cancelled. */
  const wait = async (ms: number) => {
    try {
      await sleep(ms, signal)
      return !signal.aborted
    } catch {
      return false
    }
  }

  const fail = (error: string): ClassificationOutcome => ({ ok: false, error })

  /** null: cancelled or auth-aborted, nothing to record. */
  async function classify(state: JevState, issue: Issue): Promise<ClassificationOutcome | null> {
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) return null
      let result: JevHttpResult<SystemOneResponseBody>
      try {
        result = await options.client.classify(state, signal)
      } catch (error) {
        const kind = error instanceof JevTransportError ? error.kind : 'network'
        if (signal.aborted || kind === 'aborted') return null
        if (attempt >= maxRetries) {
          return fail(kind === 'timeout' ? TIMEOUT_MESSAGE : new JevTransportError('network').message)
        }
        if (!(await wait(backoff(attempt)))) return null
        continue
      }

      if (signal.aborted) return null
      if (result.ok) {
        try {
          const classification = toClassification(result.body, {
            requestedModel: options.client.model,
            questionsVersion: options.questionsVersion,
            issueUpdatedAt: issue.updatedAt,
            classifiedAt: now().toISOString(),
          })
          throttle.success()
          return { ok: true, classification }
        } catch {
          return fail(UNEXPECTED_JEV_RESPONSE)
        }
      }
      if (isAuthFailure(result)) {
        authFailed = true
        controller.abort()
        return null
      }
      if (isRateLimit(result.status)) {
        counts.rateLimited++
        throttle.rateLimited()
        report()
      }
      if (isRetryable(result.status)) {
        if (attempt >= maxRetries) {
          return fail(
            isRateLimit(result.status)
              ? rateLimitedMessage(maxRetries)
              : `Jev request failed (${result.status}) — retried ${maxRetries}×`,
          )
        }
        const delay =
          result.retryAfterMs !== null ? Math.min(result.retryAfterMs, RETRY_AFTER_CAP_MS) : backoff(attempt)
        if (!(await wait(delay))) return null
        continue
      }
      if (result.status === 422) return fail(`Invalid request (422): ${validationDetail(result.body)}`)
      return fail(`Jev request failed (${result.status})`)
    }
  }

  report()
  try {
    await runPool(
      options.issues,
      async (issue) => {
        const built = buildIssueState(issue, options.projectContext, {
          now,
          maxCommentsPerIssue: options.maxCommentsPerIssue,
          maxStateTokens: options.maxStateTokens,
        })
        if (!built.ok) {
          record(issue.number, fail(built.error.message))
          return
        }
        const outcome = await classify(built.state, issue)
        if (outcome) record(issue.number, outcome)
      },
      { limit: () => throttle.limit, signal },
    )
  } finally {
    options.signal?.removeEventListener('abort', onCancel)
  }

  return {
    status: authFailed ? 'auth-failed' : signal.aborted ? 'cancelled' : 'completed',
    total,
    classified: counts.classified,
    failed: counts.failed,
    skipped: total - counts.done,
    lowConfidence: counts.lowConfidence,
    inputTokens: counts.inputTokens,
    failedNumbers,
    elapsedMs: Math.max(0, now().getTime() - startedAt),
  }
}
