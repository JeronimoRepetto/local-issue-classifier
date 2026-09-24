// local-issue-classifier — the classification runner. Pure of Vue.
//
// Two modes through the same bounded, adaptive pool (docs/batching.md):
// - batched (default): the fitter plans as few requests as the Jev limits allow
//   (usually one), each carrying many issues; a validation error splits the
//   batch in half and retries each half;
// - per-issue: one request per issue, kept for comparison and as a fallback.
// The transport makes a single attempt; this layer owns retries, backoff with
// jitter, `retry-after` (capped at 60 s), the adaptive throttle and the auth
// abort. Every finished issue is reported through `onResult` at once, so the
// caller can save results incrementally; an aborted issue reports nothing and
// stays unclassified. Progress counts issues, not requests.
import { buildIssueState, TOO_LARGE_MESSAGE } from '../../domain/jevState'
import { estimateStateTokens } from '../../domain/estimate'
import { QUESTIONS_TOKENS } from './questions'
import { buildBatchState, planBatches } from '../../domain/jevBatchState'
import { sanitizeJsonStrings } from '../../domain/text'
import type { JevBatchState, RequestLimits } from '../../domain/jevBatchState'
import { toBatchClassifications, toClassification, UNEXPECTED_JEV_RESPONSE } from '../../domain/classification'
import type { ClassificationOutcome } from '../../domain/analysis'
import type { RunProgress, RunSummary } from '../../domain/classifyRun'
import type { ClassifyMode, Issue, ProjectContext, TrimmingProfileId } from '../../domain/types'
import type { JevClient } from './client'
import { BATCH_QUESTION_BUDGET, batchQuestions } from './batchQuestions'
import type { JevHttpResult, SystemOneResponseBody } from './transport'
import { JevTransportError } from './transport'
import { createRatePacer, createThrottle, DEFAULT_RATE_LIMITS, runPool } from './pool'
import type { RateLimits } from './pool'

export const MAX_RETRIES = 3
export const BACKOFF_START_MS = 500
export const BACKOFF_MAX_MS = 5_000
export const JITTER = 0.25
export const RETRY_AFTER_CAP_MS = 60_000
export const DEFAULT_LOW_CONFIDENCE = 0.5
export const DEFAULT_CLASSIFY_MODE: ClassifyMode = 'batched'

export const rateLimitedMessage = (retries: number) => `Rate limited — retried ${retries}×`
export const RATE_LIMITED_MESSAGE = rateLimitedMessage(MAX_RETRIES)
export const TIMEOUT_MESSAGE = 'Timeout'
const DETAIL_MAX_CHARS = 200

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

/**
 * The result of one request after retries; `validation` marks a 422/413, and
 * `invalidText` a 400 rejecting the text itself (see isInvalidUnicode).
 */
type SendOutcome =
  | { ok: true; body: unknown }
  | { ok: false; error: string; validation?: boolean; invalidText?: boolean }

export interface RunnerOptions {
  issues: readonly Issue[]
  projectContext: ProjectContext
  client: Pick<JevClient, 'model' | 'classify' | 'classifyBatch'>
  /** Default 'batched' (Preferences.classifyMode). */
  mode?: ClassifyMode
  /** Batched: the tightest trimming profile the fitter may use (Preferences.trimmingFloor). */
  trimmingFloor?: TrimmingProfileId
  /** Batched: use exactly this profile (the agreement harness). */
  forceProfile?: TrimmingProfileId
  /** Batched: request limits override, for tests. Default: models.md minus 10%. */
  requestLimits?: RequestLimits
  /** Account rate limits to pace under; default models.md minus 10%. */
  rateLimits?: RateLimits
  /** Configured pool size (Preferences.concurrency), 1..8. */
  concurrency: number
  questionsVersion: number
  /** Called once per finished issue, as soon as it finishes. */
  onResult: (issueNumber: number, outcome: ClassificationOutcome) => void
  onProgress?: (progress: RunProgress) => void
  /** Cancel: aborts in-flight requests; completed results are kept. */
  signal?: AbortSignal
  maxCommentsPerIssue?: number
  /** Per-issue size-guard override, for tests. */
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

/**
 * The live API's 400 `api_usage_error` "Request contains invalid Unicode text.":
 * some text of the state (a lone surrogate, a control character) was refused.
 */
export function isInvalidUnicode(result: JevHttpResult<unknown>): boolean {
  if (result.status !== 400) return false
  const text = JSON.stringify(result.body ?? '')
  return text.includes('api_usage_error') && /unicode/i.test(text)
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
  const mode = options.mode ?? DEFAULT_CLASSIFY_MODE
  const startedAt = now().getTime()

  // The run's own controller: the caller's cancel, or an auth failure, aborts it.
  const controller = new AbortController()
  const onCancel = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  else options.signal?.addEventListener('abort', onCancel, { once: true })
  const signal = controller.signal

  const throttle = createThrottle({ max: options.concurrency, now: options.throttleNow ?? Date.now })
  const pacer = createRatePacer({ ...(options.rateLimits ?? DEFAULT_RATE_LIMITS), now: options.throttleNow ?? Date.now })
  const total = options.issues.length
  const counts = { done: 0, failed: 0, rateLimited: 0, classified: 0, lowConfidence: 0, inputTokens: 0, requests: 0 }
  const failedNumbers: number[] = []
  let authFailed = false
  let profile: TrimmingProfileId | null = null
  /** Requests the run expects to send: the plan's batches plus validation splits (per-issue: issues). */
  let planned = 0

  const report = () =>
    options.onProgress?.({
      done: counts.done,
      total,
      failed: counts.failed,
      rateLimited: counts.rateLimited,
      concurrency: throttle.limit,
      requests: planned,
      profile,
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

  /**
   * One request with retries, backoff, `retry-after`, throttle and auth abort.
   * null: cancelled or auth-aborted, nothing to record.
   */
  async function send(
    call: () => Promise<JevHttpResult<SystemOneResponseBody>>,
    tokens: number,
  ): Promise<SendOutcome | null> {
    counts.requests++
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) return null
      for (let delay = pacer.delayFor(tokens); delay > 0; delay = pacer.delayFor(tokens)) {
        if (!(await wait(delay))) return null
      }
      pacer.commit(tokens)
      let result: JevHttpResult<SystemOneResponseBody>
      try {
        result = await call()
      } catch (error) {
        const kind = error instanceof JevTransportError ? error.kind : 'network'
        if (signal.aborted || kind === 'aborted') return null
        if (attempt >= maxRetries) {
          return { ok: false, error: kind === 'timeout' ? TIMEOUT_MESSAGE : new JevTransportError('network').message }
        }
        if (!(await wait(backoff(attempt)))) return null
        continue
      }

      if (signal.aborted) return null
      if (result.ok) return { ok: true, body: result.body }
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
          return {
            ok: false,
            error: isRateLimit(result.status)
              ? rateLimitedMessage(maxRetries)
              : `Jev request failed (${result.status}) — retried ${maxRetries}×`,
          }
        }
        const delay =
          result.retryAfterMs !== null ? Math.min(result.retryAfterMs, RETRY_AFTER_CAP_MS) : backoff(attempt)
        if (!(await wait(delay))) return null
        continue
      }
      if (isInvalidUnicode(result)) {
        return { ok: false, error: `Invalid request (400): ${validationDetail(result.body)}`, invalidText: true }
      }
      if (result.status === 422) {
        return { ok: false, error: `Invalid request (422): ${validationDetail(result.body)}`, validation: true }
      }
      return { ok: false, error: `Jev request failed (${result.status})`, validation: result.status === 413 }
    }
  }

  // ── Per-issue mode: one request per issue ─────────────────────────
  async function classifyOne(issue: Issue): Promise<void> {
    const built = buildIssueState(issue, options.projectContext, {
      now,
      maxCommentsPerIssue: options.maxCommentsPerIssue,
      maxStateTokens: options.maxStateTokens,
    })
    if (!built.ok) {
      record(issue.number, fail(built.error.message))
      return
    }
    const tokens = built.estimatedTokens + QUESTIONS_TOKENS
    let sent = await send(() => options.client.classify(built.state, signal), tokens)
    // Text refused as invalid Unicode: one retry with strictly sanitized text.
    if (sent && !sent.ok && sent.invalidText) {
      const strict = sanitizeJsonStrings(built.state, { strict: true })
      sent = await send(() => options.client.classify(strict, signal), tokens)
    }
    if (!sent) return
    if (!sent.ok) {
      record(issue.number, fail(sent.error))
      return
    }
    try {
      const classification = toClassification(sent.body, {
        requestedModel: options.client.model,
        questionsVersion: options.questionsVersion,
        issueUpdatedAt: issue.updatedAt,
        classifiedAt: now().toISOString(),
      })
      throttle.success()
      record(issue.number, { ok: true, classification })
    } catch {
      record(issue.number, fail(UNEXPECTED_JEV_RESPONSE))
    }
  }

  // ── Batched mode: every issue of a batch in one request ───────────
  const stateOptions = { now, maxCommentsPerIssue: options.maxCommentsPerIssue }

  /**
   * A validation error (422/413) on a batch splits it in half; depth is bounded by log2(size).
   * Text refused as invalid Unicode is retried once, strictly sanitized; if that
   * still fails, the same split isolates the offending issue as its own failure.
   */
  async function classifyBatch(
    issues: readonly Issue[],
    state: JevBatchState,
    profileId: TrimmingProfileId,
    strict = false,
  ): Promise<void> {
    const questions = batchQuestions(issues.map((i) => i.number))
    const tokens = estimateStateTokens(state) + issues.length * BATCH_QUESTION_BUDGET.perIssueTokens
    const sent = await send(() => options.client.classifyBatch(state, questions, signal), tokens)
    if (!sent) return
    if (!sent.ok) {
      if (sent.invalidText && !strict) {
        planned++ // the sanitized retry
        report()
        await classifyBatch(issues, sanitizeJsonStrings(state, { strict: true }), profileId, true)
        return
      }
      if ((sent.validation || sent.invalidText) && issues.length > 1) {
        const middle = Math.ceil(issues.length / 2)
        planned++ // one request becomes two
        for (const half of [issues.slice(0, middle), issues.slice(middle)]) {
          if (signal.aborted) return
          const halfState = buildBatchState(half, options.projectContext, profileId, stateOptions)
          await classifyBatch(half, strict ? sanitizeJsonStrings(halfState, { strict: true }) : halfState, profileId, strict)
        }
        return
      }
      for (const issue of issues) record(issue.number, fail(sent.error))
      return
    }
    const outcomes = toBatchClassifications(
      sent.body,
      issues.map((i) => ({ issueNumber: i.number, issueUpdatedAt: i.updatedAt })),
      { requestedModel: options.client.model, questionsVersion: options.questionsVersion, classifiedAt: now().toISOString() },
    )
    if ([...outcomes.values()].some((o) => o.ok)) throttle.success()
    for (const [issueNumber, outcome] of outcomes) record(issueNumber, outcome)
  }

  try {
    if (mode === 'per-issue') {
      planned = total
      report()
      await runPool(options.issues, classifyOne, { limit: () => throttle.limit, signal })
    } else {
      const plan = planBatches(options.issues, options.projectContext, {
        ...stateOptions,
        questions: BATCH_QUESTION_BUDGET,
        floor: options.trimmingFloor,
        only: options.forceProfile,
        limits: options.requestLimits,
      })
      profile = plan.profile
      planned = plan.batches.length
      report()
      for (const issue of plan.tooLarge) record(issue.number, fail(TOO_LARGE_MESSAGE))
      await runPool(plan.batches, (batch) => classifyBatch(batch.issues, batch.state, plan.profile), {
        limit: () => throttle.limit,
        signal,
      })
    }
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
    requests: counts.requests,
    profile,
  }
}
