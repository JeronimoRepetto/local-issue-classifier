// Task 11 — the classification runner, with a fake client.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runClassification, RATE_LIMITED_MESSAGE } from './runner'
import type { RunnerOptions } from './runner'
import { JevTransportError } from './transport'
import { TOO_LARGE_MESSAGE } from '../../domain/jevState'
import { UNEXPECTED_JEV_RESPONSE } from '../../domain/classification'
import type { ClassificationOutcome } from '../../domain/analysis'
import type { RunProgress } from '../../domain/classifyRun'
import { defaultProjectContext } from '../../domain/types'
import { fakeIssue } from '../../../tests/fakes/domainFixtures'
import { batchBody, http, jevBody, ok, scriptedClient } from '../../../tests/fakes/fakeJev'
import type { BatchHandler, Handler } from '../../../tests/fakes/fakeJev'
import { BATCH_QUESTION_BUDGET } from './batchQuestions'
import { planBatches } from '../../domain/jevBatchState'
import type { JevBatchState } from '../../domain/jevBatchState'
import { seededRandom } from '../../../tests/fakes/seededRandom'

const NOW = new Date('2026-09-23T12:00:00Z')
const instant = async () => {}

function setup(handler: Handler, overrides: Partial<RunnerOptions> = {}, count = 3) {
  const client = scriptedClient(handler)
  const results: [number, ClassificationOutcome][] = []
  const progress: RunProgress[] = []
  const options: RunnerOptions = {
    issues: Array.from({ length: count }, (_, i) => fakeIssue(i + 1)),
    projectContext: defaultProjectContext('acme/widgets'),
    client,
    mode: 'per-issue',
    concurrency: 4,
    questionsVersion: 1,
    now: () => NOW,
    sleep: instant,
    random: () => 0.5,
    onResult: (n, outcome) => results.push([n, outcome]),
    onProgress: (p) => progress.push(p),
    ...overrides,
  }
  return { client, results, progress, run: () => runClassification(options) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('runClassification: success path', () => {
  it('maps each response and reports every result as it arrives', async () => {
    const { results, progress, run } = setup(() => ok(jevBody(0.4, 1500)))
    const summary = await run()

    expect(results.map(([n]) => n).sort()).toEqual([1, 2, 3])
    const [, first] = results[0]
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.classification.questionsVersion).toBe(1)
      expect(first.classification.issueUpdatedAt).toBe('2026-01-02T00:00:00Z')
      expect(first.classification.classifiedAt).toBe(NOW.toISOString())
    }
    expect(progress.at(-1)).toMatchObject({ done: 3, total: 3, failed: 0, rateLimited: 0 })
    expect(summary).toMatchObject({
      status: 'completed',
      total: 3,
      classified: 3,
      failed: 0,
      skipped: 0,
      lowConfidence: 3,
      inputTokens: 4500,
      failedNumbers: [],
    })
  })

  it('never has more requests in flight than the concurrency', async () => {
    let inFlight = 0
    let max = 0
    const { run } = setup(
      async () => {
        inFlight++
        max = Math.max(max, inFlight)
        await new Promise((r) => setTimeout(r, 0))
        inFlight--
        return ok()
      },
      { concurrency: 3 },
      10,
    )
    const summary = await run()
    expect(max).toBe(3)
    expect(summary.classified).toBe(10)
  })
})

describe('runClassification: retries', () => {
  it('retries 5xx with exponential backoff and 25% jitter (fake timers, seeded random)', async () => {
    vi.useFakeTimers()
    const random = seededRandom(42)
    const expected = seededRandom(42)
    const d1 = 500 * (1 + (expected() * 2 - 1) * 0.25)
    const d2 = 1000 * (1 + (expected() * 2 - 1) * 0.25)
    expect(Math.round(d1)).not.toBe(500)

    const { client, results, run } = setup(
      (_, attempt) => (attempt < 3 ? http(503) : ok()),
      { sleep: undefined, random },
      1,
    )
    const done = run()
    await vi.advanceTimersByTimeAsync(0)
    expect(client.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(Math.round(d1) - 1)
    expect(client.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(client.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(Math.round(d2) - 1)
    expect(client.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(client.calls).toHaveLength(3)
    await done
    expect(results[0][1].ok).toBe(true)
  })

  it('doubles the backoff up to 5 000 ms', async () => {
    const delays: number[] = []
    const { run } = setup(
      () => http(500),
      {
        sleep: async (ms) => {
          delays.push(ms)
        },
        random: () => 0.5, // no jitter
        maxRetries: 5,
      },
      1,
    )
    await run()
    expect(delays).toEqual([500, 1000, 2000, 4000, 5000])
  })

  it('gives up after 3 retries on a rate limit with "Rate limited — retried 3×"', async () => {
    const { client, results, progress, run } = setup(() => http(429), {}, 1)
    const summary = await run()
    expect(client.calls).toHaveLength(4)
    expect(RATE_LIMITED_MESSAGE).toBe('Rate limited — retried 3×')
    expect(results).toEqual([[1, { ok: false, error: RATE_LIMITED_MESSAGE }]])
    expect(progress.at(-1)).toMatchObject({ done: 1, failed: 1, rateLimited: 4 })
    expect(summary).toMatchObject({ failed: 1, failedNumbers: [1] })
  })

  it('honours retry-after', async () => {
    const delays: number[] = []
    const { run } = setup((_, attempt) => (attempt === 1 ? http(429, null, 3000) : ok()), {
      sleep: async (ms) => {
        delays.push(ms)
      },
    }, 1)
    await run()
    expect(delays).toEqual([3000])
  })

  it('caps retry-after at 60 s (fake timers)', async () => {
    vi.useFakeTimers()
    const { client, run } = setup(
      (_, attempt) => (attempt === 1 ? http(529, null, 120_000) : ok()),
      { sleep: undefined },
      1,
    )
    const done = run()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(client.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(client.calls).toHaveLength(2)
    await done
  })

  it('retries network errors and timeouts; an exhausted timeout reads "Timeout"', async () => {
    const { client, results, run } = setup(
      (issue) => {
        throw new JevTransportError(issue === 1 ? 'network' : 'timeout')
      },
      {},
      2,
    )
    await run()
    expect(client.calls.filter((c) => c.issue === 1)).toHaveLength(4)
    expect(client.calls.filter((c) => c.issue === 2)).toHaveLength(4)
    const byIssue = new Map(results)
    expect(byIssue.get(2)).toEqual({ ok: false, error: 'Timeout' })
    expect(byIssue.get(1)).toEqual({ ok: false, error: 'Could not reach the Jev proxy' })
  })

  it('does not retry 422 and shows the field detail', async () => {
    const { client, results, run } = setup(() => http(422, { detail: 'state.issue.body: too long' }), {}, 1)
    await run()
    expect(client.calls).toHaveLength(1)
    expect(results[0][1]).toEqual({ ok: false, error: 'Invalid request (422): state.issue.body: too long' })
  })

  it('does not retry other 4xx or a malformed 200', async () => {
    const { client, results, run } = setup((issue) => (issue === 1 ? http(404) : ok({ answers: {} })), {}, 2)
    await run()
    expect(client.calls).toHaveLength(2)
    const byIssue = new Map(results)
    expect(byIssue.get(1)).toEqual({ ok: false, error: 'Jev request failed (404)' })
    expect(byIssue.get(2)).toEqual({ ok: false, error: UNEXPECTED_JEV_RESPONSE })
  })
})

describe('runClassification: adaptive throttle', () => {
  it('halves the concurrency after two rate limits within 10 s and restores it after successes', async () => {
    const { progress, run } = setup(
      (issue, attempt) => (issue <= 2 && attempt === 1 ? http(429) : ok()),
      { concurrency: 4, throttleNow: () => 0 },
      45,
    )
    await run()
    const concurrencies = progress.map((p) => p.concurrency)
    expect(concurrencies).toContain(2)
    expect(progress.at(-1)?.concurrency).toBe(4)
  })
})

describe('runClassification: aborts and failures', () => {
  it.each([
    ['401', http(401, { error: 'unauthorized' })],
    ['403 authentication_error', http(403, { error_type: 'authentication_error', message: 'Invalid API key' })],
  ])('%s aborts the whole run without recording results', async (_, response) => {
    const { client, results, run } = setup(() => response, { concurrency: 1 }, 3)
    const summary = await run()
    expect(client.calls).toHaveLength(1)
    expect(results).toEqual([])
    expect(summary).toMatchObject({ status: 'auth-failed', classified: 0, failed: 0, skipped: 3 })
  })

  it('a 403 without authentication_error is an ordinary per-issue failure', async () => {
    const { results, run } = setup(() => http(403, { error_type: 'permission_error' }), {}, 1)
    const summary = await run()
    expect(summary.status).toBe('completed')
    expect(results[0][1]).toEqual({ ok: false, error: 'Jev request failed (403)' })
  })

  it('an issue too large even after trimming fails alone and is never sent', async () => {
    const big = fakeIssue(2, { body: 'x'.repeat(20_000) })
    const { client, results, run } = setup(() => ok(), {
      issues: [fakeIssue(1), big, fakeIssue(3)],
      maxStateTokens: 1000,
    })
    const summary = await run()
    expect(client.calls.map((c) => c.issue)).not.toContain(2)
    expect(new Map(results).get(2)).toEqual({ ok: false, error: TOO_LARGE_MESSAGE })
    expect(summary).toMatchObject({ status: 'completed', classified: 2, failed: 1, failedNumbers: [2] })
  })

  it('cancel aborts in-flight requests and keeps the completed results', async () => {
    const controller = new AbortController()
    const second = deferred<void>()
    const { results, client, run } = setup(
      async (issue, _attempt, signal) => {
        if (issue === 1) return ok()
        await new Promise<void>((_, reject) => {
          signal?.addEventListener('abort', () => reject(new JevTransportError('aborted')))
          second.resolve()
        })
        return ok()
      },
      { concurrency: 2, signal: controller.signal },
      5,
    )
    const done = run()
    await second.promise
    await new Promise((r) => setTimeout(r, 0))
    controller.abort()
    const summary = await done
    expect(results.map(([n]) => n)).toEqual([1])
    expect(client.calls.map((c) => c.issue)).not.toContain(5)
    expect(summary).toMatchObject({ status: 'cancelled', classified: 1, failed: 0, skipped: 4 })
  })

  it('cancel during a backoff wait stops retrying', async () => {
    const controller = new AbortController()
    const { client, results, run } = setup(
      () => http(500),
      {
        signal: controller.signal,
        sleep: async () => {
          controller.abort()
          throw new JevTransportError('aborted')
        },
      },
      1,
    )
    const summary = await run()
    expect(client.calls).toHaveLength(1)
    expect(results).toEqual([])
    expect(summary.status).toBe('cancelled')
  })
})

// ── Batched mode (docs/batching.md) ──────────────────────────────────
/** At most two fake issues fit one request under these limits. */
const TWO_PER_REQUEST = { stateTokens: 5_000, totalTokens: 2 * BATCH_QUESTION_BUDGET.perIssueTokens + 400 }

function batched(
  handler: Handler,
  overrides: Partial<RunnerOptions> = {},
  count = 3,
  batchHandler?: BatchHandler,
) {
  const client = scriptedClient(handler, batchHandler)
  const env = setup(handler, { client, mode: 'batched', ...overrides }, count)
  return { ...env, client }
}

describe('runClassification: batched mode', () => {
  it('is the default mode and sends every issue in ONE request when it fits', async () => {
    const { client, results, progress, run } = batched(() => ok(), { mode: undefined }, 5)
    const summary = await run()
    expect(client.batches).toEqual([[1, 2, 3, 4, 5]])
    expect(results.map(([n]) => n)).toEqual([1, 2, 3, 4, 5])
    expect(results.every(([, o]) => o.ok)).toBe(true)
    expect(summary).toMatchObject({ status: 'completed', classified: 5, failed: 0, requests: 1, profile: 'standard' })
    expect(progress.at(-1)).toMatchObject({ done: 5, total: 5, requests: 1, profile: 'standard' })
  })

  it('makes one call per planned batch and counts progress by issue, not by call', async () => {
    const { client, progress, run } = batched(() => ok(), { requestLimits: TWO_PER_REQUEST }, 5)
    const summary = await run()
    const plan = planBatches(
      Array.from({ length: 5 }, (_, i) => fakeIssue(i + 1)),
      defaultProjectContext('acme/widgets'),
      { now: () => NOW, questions: BATCH_QUESTION_BUDGET, limits: TWO_PER_REQUEST },
    )
    expect(client.batches).toHaveLength(plan.batches.length)
    expect(client.batches).toEqual([[1, 2], [3, 4], [5]])
    expect(summary.requests).toBe(3)
    expect(progress.map((p) => p.done)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('maps a partial response: a malformed subset fails only its issues', async () => {
    const { results, run } = batched(() => ok(), {}, 3, (issues) => {
      const body = batchBody(issues)
      for (const id of Object.keys(body.answers)) if (id.endsWith('_2')) delete body.answers[id]
      return ok(body)
    })
    const summary = await run()
    const byIssue = new Map(results)
    expect(byIssue.get(2)).toEqual({ ok: false, error: UNEXPECTED_JEV_RESPONSE })
    expect([byIssue.get(1)?.ok, byIssue.get(3)?.ok]).toEqual([true, true])
    expect(summary).toMatchObject({ classified: 2, failed: 1, failedNumbers: [2] })
  })

  it('retries a failed request through the same retry logic', async () => {
    const { client, results, run } = batched(() => ok(), {}, 3, (issues, attempt) =>
      attempt < 3 ? http(503) : ok(batchBody(issues)),
    )
    await run()
    expect(client.batches).toEqual([[1, 2, 3], [1, 2, 3], [1, 2, 3]])
    expect(results.every(([, o]) => o.ok)).toBe(true)
  })

  it('on a validation error, splits the batch in half and retries each half', async () => {
    const { client, results, run } = batched(() => ok(), {}, 5, (issues) =>
      issues.length > 2 ? http(422, { detail: 'state too long' }) : ok(batchBody(issues)),
    )
    const summary = await run()
    expect(client.batches).toEqual([[1, 2, 3, 4, 5], [1, 2, 3], [1, 2], [3], [4, 5]])
    expect(results.every(([, o]) => o.ok)).toBe(true)
    expect(summary).toMatchObject({ classified: 5, failed: 0, requests: 5 })
  })

  it('splitting is bounded: a single issue that still fails validation fails alone', async () => {
    const { client, results, run } = batched(() => ok(), {}, 4, () => http(422, { detail: 'nope' }))
    const summary = await run()
    expect(client.batches).toHaveLength(7) // 4, then 2 + 2, then 1 + 1 + 1 + 1
    expect(new Map(results).get(3)).toEqual({ ok: false, error: 'Invalid request (422): nope' })
    expect(summary).toMatchObject({ classified: 0, failed: 4 })
  })

  it('an authentication failure aborts the run without recording results', async () => {
    const { client, results, run } = batched(
      () => ok(),
      { requestLimits: TWO_PER_REQUEST, concurrency: 1 },
      5,
      () => http(401),
    )
    const summary = await run()
    expect(client.batches).toHaveLength(1)
    expect(results).toEqual([])
    expect(summary).toMatchObject({ status: 'auth-failed', classified: 0, skipped: 5 })
  })

  it('cancel keeps the completed batches and leaves the rest unclassified', async () => {
    const controller = new AbortController()
    const { results, run } = batched(
      () => ok(),
      { requestLimits: TWO_PER_REQUEST, concurrency: 1, signal: controller.signal },
      5,
      async (issues, _attempt, signal) => {
        if (issues[0] === 1) return ok(batchBody(issues))
        controller.abort()
        return new Promise((_, reject) => {
          if (signal?.aborted) reject(new JevTransportError('aborted'))
          signal?.addEventListener('abort', () => reject(new JevTransportError('aborted')))
        })
      },
    )
    const summary = await run()
    expect(results.map(([n]) => n)).toEqual([1, 2])
    expect(summary).toMatchObject({ status: 'cancelled', classified: 2, skipped: 3 })
  })

  it('an issue too large to fit a request alone fails by itself and is never sent', async () => {
    const { client, results, run } = batched(() => ok(), {
      issues: [fakeIssue(1), fakeIssue(2, { title: 'x'.repeat(120_000) }), fakeIssue(3)],
    })
    const summary = await run()
    expect(client.batches).toEqual([[1, 3]])
    expect(new Map(results).get(2)).toEqual({ ok: false, error: TOO_LARGE_MESSAGE })
    expect(summary).toMatchObject({ classified: 2, failed: 1 })
  })

  it('honours the trimming floor and a forced profile', async () => {
    const floored = batched(() => ok(), { requestLimits: TWO_PER_REQUEST, trimmingFloor: 'standard' }, 3)
    expect(await floored.run()).toMatchObject({ profile: 'standard' })
    const forced = batched(() => ok(), { forceProfile: 'tight' }, 3)
    expect(await forced.run()).toMatchObject({ profile: 'tight', requests: 1 })
  })

  it('shares the request usage across the issues of the batch', async () => {
    const { run } = batched(() => ok(), {}, 4, (issues) => ok(batchBody(issues, 0.9, 4_000)))
    expect((await run()).inputTokens).toBe(4_000)
  })

  it('per-issue mode still sends one request per issue', async () => {
    const { client, run } = batched(() => ok(), { mode: 'per-issue' }, 3)
    const summary = await run()
    expect(client.batches).toEqual([])
    expect(client.calls).toHaveLength(3)
    expect(summary).toMatchObject({ requests: 3, profile: null })
  })
})

describe('runClassification: rate limits (models.md)', () => {
  it('paces batched requests, including validation splits, under the token rate', async () => {
    let t = 0
    const waits: number[] = []
    const { client, results, run } = batched(
      () => ok(),
      {
        concurrency: 4,
        rateLimits: { tokensPerSecond: 2 * BATCH_QUESTION_BUDGET.perIssueTokens + 400, requestsPerMinute: 1_000 },
        throttleNow: () => t,
        sleep: async (ms) => {
          waits.push(ms)
          t += ms
        },
      },
      4,
      (issues) => (issues.length > 2 ? http(422, { detail: 'too long' }) : ok(batchBody(issues))),
    )
    await run()
    expect(client.batches).toEqual([[1, 2, 3, 4], [1, 2], [3, 4]])
    expect(waits.length).toBeGreaterThanOrEqual(1)
    expect(results.every(([, o]) => o.ok)).toBe(true)
  })

  it('does not wait while under the limits', async () => {
    const waits: number[] = []
    const { run } = batched(() => ok(), { sleep: async (ms) => void waits.push(ms) }, 5)
    await run()
    expect(waits).toEqual([])
  })
})

describe('runClassification: 400 "invalid Unicode text" (api_usage_error)', () => {
  const unicode400 = () =>
    http(400, { error_type: 'api_usage_error', message: 'Request contains invalid Unicode text.' })
  // Built numerically so no editor or tool rewrites the escape.
  const NEL = String.fromCharCode(0x85)

  function recordStates(client: ReturnType<typeof scriptedClient>) {
    const states: JevBatchState[] = []
    const inner = client.classifyBatch.bind(client)
    client.classifyBatch = (state, questions, signal) => {
      states.push(state)
      return inner(state, questions, signal)
    }
    return states
  }

  it('retries a batch once with strictly sanitized text, then succeeds', async () => {
    const issues = [1, 2, 3].map((n) => fakeIssue(n, { body: `Body ${n} with a C1 control ${NEL}` }))
    const { client, results, run } = batched(() => ok(), { issues }, 3, (numbers, attempt) =>
      attempt === 1 ? unicode400() : ok(batchBody(numbers)),
    )
    const states = recordStates(client)
    const summary = await run()
    expect(client.batches).toEqual([[1, 2, 3], [1, 2, 3]])
    expect(states[0].issues[0].body).toContain(NEL)
    expect(states[1].issues.every((i) => !i.body.includes(NEL))).toBe(true)
    expect(results.every(([, o]) => o.ok)).toBe(true)
    expect(summary).toMatchObject({ classified: 3, failed: 0, requests: 2 })
  })

  it('when it persists, bisects the batch and fails only the offending issue', async () => {
    const { client, results, run } = batched(() => ok(), {}, 4, (numbers) =>
      numbers.includes(3) ? unicode400() : ok(batchBody(numbers)),
    )
    const summary = await run()
    // 4, the sanitized retry of 4, then 2 + 2, then 1 + 1 inside the failing half.
    expect(client.batches).toEqual([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2], [3, 4], [3], [4]])
    const byIssue = new Map(results)
    expect(byIssue.get(3)).toEqual({ ok: false, error: 'Invalid request (400): Request contains invalid Unicode text.' })
    expect([1, 2, 4].every((n) => byIssue.get(n)?.ok)).toBe(true)
    expect(summary).toMatchObject({ classified: 3, failed: 1 })
  })

  it('per-issue mode retries once sanitized, then fails that issue alone', async () => {
    const { client, results, run } = setup((issue, attempt) => (issue === 1 || attempt > 1 ? unicode400() : ok()), {}, 2)
    await run()
    expect(client.calls.filter((c) => c.issue === 1)).toHaveLength(2)
    expect(client.calls.filter((c) => c.issue === 2)).toHaveLength(1)
    const byIssue = new Map(results)
    expect(byIssue.get(1)).toEqual({ ok: false, error: 'Invalid request (400): Request contains invalid Unicode text.' })
    expect(byIssue.get(2)?.ok).toBe(true)
  })

  it('any other 400 still fails the batch at once, without a retry or a split', async () => {
    const { client, results, run } = batched(() => ok(), {}, 3, () =>
      http(400, { error_type: 'api_usage_error', message: 'Unknown question type.' }),
    )
    await run()
    expect(client.batches).toEqual([[1, 2, 3]])
    expect(results.every(([, o]) => !o.ok)).toBe(true)
  })
})
