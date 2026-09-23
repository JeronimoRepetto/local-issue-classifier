// issue-criticity — bounded-concurrency pool and adaptive throttle (SPEC.md §4.5).
// Generic and framework-free: the limit is read on every start, so a throttle
// can shrink or grow it while the pool runs. The clock is injected.

export interface PoolOptions {
  /** Read before every start; values below 1 count as 1. */
  limit: () => number
  /** Once aborted, no new item starts; in-flight workers are left to settle. */
  signal?: AbortSignal
}

export interface PoolResult<T> {
  /** Items never handed to a worker because the signal aborted first. */
  notStarted: T[]
}

/**
 * Runs `worker` over `items` with at most `limit()` in flight. Resolves when
 * every started worker has settled. A worker must handle its own errors; a
 * rejection is swallowed so one item can never stop the others.
 */
export function runPool<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  options: PoolOptions,
): Promise<PoolResult<T>> {
  const queue = items.slice()
  let inFlight = 0

  return new Promise((resolve) => {
    const finish = () => resolve({ notStarted: queue.splice(0) })

    const pump = () => {
      if (options.signal?.aborted) {
        if (inFlight === 0) finish()
        return
      }
      while (queue.length > 0 && inFlight < Math.max(1, options.limit())) {
        const item = queue.shift() as T
        inFlight++
        worker(item)
          .catch(() => undefined)
          .finally(() => {
            inFlight--
            pump()
          })
      }
      if (queue.length === 0 && inFlight === 0) finish()
    }

    options.signal?.addEventListener('abort', pump, { once: true })
    pump()
  })
}

export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 8
export const RATE_LIMIT_WINDOW_MS = 10_000
export const RATE_LIMITS_TO_HALVE = 2
export const SUCCESSES_TO_RESTORE = 20

export interface ThrottleOptions {
  /** The configured size (Preferences.concurrency), clamped to 1..8. */
  max: number
  now?: () => number
}

export interface Throttle {
  readonly limit: number
  readonly max: number
  /** A 429 or 529: two within 10 s halve the limit (floor 1). */
  rateLimited(): void
  /** Every 20 consecutive successes restore one slot, up to `max`. */
  success(): void
}

export function createThrottle(options: ThrottleOptions): Throttle {
  const now = options.now ?? Date.now
  const max = Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.round(options.max) || MIN_CONCURRENCY))
  let limit = max
  let hits: number[] = []
  let streak = 0

  return {
    get limit() {
      return limit
    },
    max,
    rateLimited() {
      streak = 0
      const t = now()
      hits = hits.filter((at) => t - at <= RATE_LIMIT_WINDOW_MS)
      hits.push(t)
      if (hits.length >= RATE_LIMITS_TO_HALVE) {
        limit = Math.max(MIN_CONCURRENCY, Math.floor(limit / 2))
        hits = []
      }
    },
    success() {
      streak++
      if (streak >= SUCCESSES_TO_RESTORE) {
        streak = 0
        if (limit < max) limit++
      }
    },
  }
}
