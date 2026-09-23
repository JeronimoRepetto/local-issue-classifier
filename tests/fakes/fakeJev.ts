// Fake Jev client for runner / classifier tests. Never touches the network.
import type { JevClient } from '../../src/adapters/jev/client'
import type { JevHttpResult, SystemOneResponseBody } from '../../src/adapters/jev/transport'
import type { JevState } from '../../src/domain/jevState'
import type { JevBatchState } from '../../src/domain/jevBatchState'

type Result = JevHttpResult<SystemOneResponseBody>

const score3 = (score: number, confidence: number) => ({
  type: 'score',
  score,
  probabilities: { '0': 0.1, '1': 0.2, '2': 0.7 },
  confidence,
})

/** A valid five-answer `/v1/systemone` body. */
export function jevBody(confidence = 0.8, inputTokens = 1000): SystemOneResponseBody {
  return {
    model: 'jev-1.13.0',
    answers: {
      complexity: score3(1, confidence),
      criticality: score3(2, confidence),
      effort: score3(0, confidence),
      relevance: {
        type: 'score',
        score: 3,
        probabilities: { '0': 0, '1': 0.1, '2': 0.1, '3': 0.7, '4': 0.1 },
        confidence,
      },
      kind: { type: 'choice', choice: 'bug', confidence },
    },
    usage: { input_tokens: inputTokens },
  }
}

const BATCH_PREFIXES = { complexity: 'c', criticality: 'k', effort: 'e', relevance: 'r', kind: 't' } as const

/** A per-issue body's answers, renamed to that issue's batched ids (`c_123`, …). */
export function namespaced(issueNumber: number, body: SystemOneResponseBody = jevBody()): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body.answers).map(([id, answer]) => [
      `${BATCH_PREFIXES[id as keyof typeof BATCH_PREFIXES] ?? id}_${issueNumber}`,
      answer,
    ]),
  )
}

/** A valid batched body: five namespaced answers per issue, one usage for the request. */
export function batchBody(issueNumbers: readonly number[], confidence = 0.8, inputTokens = 1000): SystemOneResponseBody {
  return {
    model: 'jev-1.13.0',
    answers: Object.assign({}, ...issueNumbers.map((n) => namespaced(n, jevBody(confidence)))),
    usage: { input_tokens: inputTokens },
  }
}

export const ok = (body: unknown = jevBody()): Result => ({
  status: 200,
  ok: true,
  body: body as SystemOneResponseBody,
  retryAfterMs: null,
})

export const http = (
  status: number,
  body: Record<string, unknown> | null = null,
  retryAfterMs: number | null = null,
): Result => ({
  status,
  ok: status >= 200 && status < 300,
  body,
  retryAfterMs,
})

export interface Call {
  issue: number
  attempt: number
}

export type Handler = (issue: number, attempt: number, signal?: AbortSignal) => Result | Promise<Result>

/** Answers a whole batched request; attempts start at 1 per distinct issue set. */
export type BatchHandler = (issues: number[], attempt: number, signal?: AbortSignal) => Result | Promise<Result>

export interface ScriptedClient extends JevClient {
  calls: Call[]
  /** Issue numbers of every batched request, in call order (retries included). */
  batches: number[][]
}

/**
 * Each call is answered by `handler(issueNumber, attempt)`; attempts start at 1
 * per issue. A batched request fans out to `handler` once per issue and merges
 * the answers under the namespaced ids (the first non-2xx result answers the
 * whole request), unless a `batchHandler` answers the request itself.
 */
export function scriptedClient(handler: Handler, batchHandler?: BatchHandler): ScriptedClient {
  const attempts = new Map<number, number>()
  const batchAttempts = new Map<string, number>()
  const calls: Call[] = []
  const batches: number[][] = []
  const next = (issue: number) => {
    const attempt = (attempts.get(issue) ?? 0) + 1
    attempts.set(issue, attempt)
    calls.push({ issue, attempt })
    return attempt
  }
  return {
    model: 'jev-latest',
    calls,
    batches,
    async classify(state: JevState, signal?: AbortSignal) {
      const issue = state.issue.number
      return handler(issue, next(issue), signal)
    },
    async classifyBatch(state: JevBatchState, _questions: unknown, signal?: AbortSignal) {
      const numbers = state.issues.map((entry) => Number(entry.id.replace('#', '')))
      batches.push(numbers)
      if (batchHandler) {
        const key = numbers.join(',')
        const attempt = (batchAttempts.get(key) ?? 0) + 1
        batchAttempts.set(key, attempt)
        return batchHandler(numbers, attempt, signal)
      }
      const results = await Promise.all(numbers.map((n) => handler(n, next(n), signal)))
      const failed = results.find((r) => !r.ok)
      if (failed) return failed
      const bodies = results.map((r) => r.body as SystemOneResponseBody)
      return ok({
        model: 'jev-1.13.0',
        answers: Object.assign(
          {},
          ...bodies.map((body, i) => (body && body.answers ? namespaced(numbers[i], body) : {})),
        ),
        usage: { input_tokens: bodies.reduce((sum, body) => sum + (body?.usage?.input_tokens ?? 0), 0) },
      })
    },
    async listModels() {
      return { status: 200, ok: true, body: { models: [] }, retryAfterMs: null }
    },
  }
}
