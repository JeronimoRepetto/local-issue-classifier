// Task 11 — SPEC.md §4.5: bounded-concurrency pool and adaptive throttle.
import { describe, expect, it } from 'vitest'
import { createRatePacer, createThrottle, DEFAULT_RATE_LIMITS, runPool } from './pool'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('runPool', () => {
  it('never runs more workers than the limit and processes every item', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const seen: number[] = []
    await runPool(
      Array.from({ length: 20 }, (_, i) => i),
      async (item) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await tick()
        seen.push(item)
        inFlight--
      },
      { limit: () => 4 },
    )
    expect(maxInFlight).toBe(4)
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it('reads the limit dynamically: a lower limit stops new starts until in-flight drains', async () => {
    let limit = 4
    let inFlight = 0
    const peaks: number[] = []
    await runPool(
      Array.from({ length: 12 }, (_, i) => i),
      async (item) => {
        inFlight++
        peaks.push(inFlight)
        if (item === 0) limit = 1
        await tick()
        inFlight--
      },
      { limit: () => limit },
    )
    // The first wave started 4; after the drop, never more than 1 at a time.
    expect(Math.max(...peaks.slice(4))).toBe(1)
  })

  it('stops starting new items once the signal aborts and returns the not-started ones', async () => {
    const controller = new AbortController()
    const gates = Array.from({ length: 6 }, () => deferred())
    const started: number[] = []
    const run = runPool(
      [0, 1, 2, 3, 4, 5],
      async (item) => {
        started.push(item)
        await gates[item].promise
      },
      { limit: () => 2, signal: controller.signal },
    )
    await tick()
    controller.abort()
    gates[0].resolve()
    gates[1].resolve()
    const result = await run
    expect(started).toEqual([0, 1])
    expect(result.notStarted).toEqual([2, 3, 4, 5])
  })

  it('treats a limit below 1 as 1', async () => {
    let inFlight = 0
    let max = 0
    await runPool([1, 2, 3], async () => {
      inFlight++
      max = Math.max(max, inFlight)
      await tick()
      inFlight--
    }, { limit: () => 0 })
    expect(max).toBe(1)
  })
})

describe('createThrottle', () => {
  it('two rate limits within 10 s halve the limit, down to 1', () => {
    let now = 0
    const throttle = createThrottle({ max: 8, now: () => now })
    throttle.rateLimited()
    expect(throttle.limit).toBe(8)
    now = 5_000
    throttle.rateLimited()
    expect(throttle.limit).toBe(4)
    throttle.rateLimited()
    throttle.rateLimited()
    expect(throttle.limit).toBe(2)
    throttle.rateLimited()
    throttle.rateLimited()
    throttle.rateLimited()
    throttle.rateLimited()
    expect(throttle.limit).toBe(1)
  })

  it('rate limits more than 10 s apart do not halve', () => {
    let now = 0
    const throttle = createThrottle({ max: 4, now: () => now })
    throttle.rateLimited()
    now = 10_001
    throttle.rateLimited()
    expect(throttle.limit).toBe(4)
  })

  it('restores one slot after every 20 consecutive successes, up to the configured size', () => {
    let now = 0
    const throttle = createThrottle({ max: 4, now: () => now })
    throttle.rateLimited()
    throttle.rateLimited()
    expect(throttle.limit).toBe(2)
    for (let i = 0; i < 19; i++) throttle.success()
    expect(throttle.limit).toBe(2)
    throttle.success()
    expect(throttle.limit).toBe(3)
    for (let i = 0; i < 20; i++) throttle.success()
    expect(throttle.limit).toBe(4)
    for (let i = 0; i < 40; i++) throttle.success()
    expect(throttle.limit).toBe(4)
  })

  it('a rate limit resets the consecutive-success count', () => {
    let now = 0
    const throttle = createThrottle({ max: 4, now: () => now })
    throttle.rateLimited()
    throttle.rateLimited()
    for (let i = 0; i < 19; i++) throttle.success()
    now = 60_000
    throttle.rateLimited()
    throttle.success()
    expect(throttle.limit).toBe(2)
  })

  it('clamps the configured size to 1..8', () => {
    expect(createThrottle({ max: 20 }).limit).toBe(8)
    expect(createThrottle({ max: 0 }).limit).toBe(1)
  })
})

describe('createRatePacer (models.md rate limits)', () => {
  it('defaults to the jev-1.13.0 account limits minus 10%', () => {
    expect(DEFAULT_RATE_LIMITS).toEqual({ tokensPerSecond: 225_000, requestsPerMinute: 1_080 })
  })

  it('lets requests through while the rolling second has room', () => {
    const pacer = createRatePacer({ tokensPerSecond: 100, requestsPerMinute: 100, now: () => 0 })
    expect(pacer.delayFor(60)).toBe(0)
    pacer.commit(60)
    expect(pacer.delayFor(40)).toBe(0)
  })

  it('delays a request that would exceed the tokens per second until the window frees up', () => {
    let t = 0
    const pacer = createRatePacer({ tokensPerSecond: 100, requestsPerMinute: 100, now: () => t })
    pacer.commit(80)
    t = 300
    expect(pacer.delayFor(40)).toBe(700)
    t = 1_000
    expect(pacer.delayFor(40)).toBe(0)
  })

  it('delays a request over the requests per minute', () => {
    let t = 0
    const pacer = createRatePacer({ tokensPerSecond: 1_000_000, requestsPerMinute: 2, now: () => t })
    pacer.commit(1)
    t = 10_000
    pacer.commit(1)
    expect(pacer.delayFor(1)).toBe(50_000)
  })

  it('never blocks forever: a request larger than the budget goes alone', () => {
    const pacer = createRatePacer({ tokensPerSecond: 100, requestsPerMinute: 100, now: () => 0 })
    expect(pacer.delayFor(500)).toBe(0)
  })
})
