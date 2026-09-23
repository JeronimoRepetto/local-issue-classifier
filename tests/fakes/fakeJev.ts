// Fake Jev client for runner / classifier tests. Never touches the network.
import type { JevClient } from '../../src/adapters/jev/client'
import type { JevHttpResult, SystemOneResponseBody } from '../../src/adapters/jev/transport'
import type { JevState } from '../../src/domain/jevState'

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

export interface ScriptedClient extends JevClient {
  calls: Call[]
}

/** Each call is answered by `handler(issueNumber, attempt)`; attempts start at 1 per issue. */
export function scriptedClient(handler: Handler): ScriptedClient {
  const attempts = new Map<number, number>()
  const calls: Call[] = []
  return {
    model: 'jev-latest',
    calls,
    async classify(state: JevState, signal?: AbortSignal) {
      const issue = state.issue.number
      const attempt = (attempts.get(issue) ?? 0) + 1
      attempts.set(issue, attempt)
      calls.push({ issue, attempt })
      return handler(issue, attempt, signal)
    },
    async listModels() {
      return { status: 200, ok: true, body: { models: [] }, retryAfterMs: null }
    },
  }
}
