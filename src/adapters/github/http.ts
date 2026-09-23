// GitHub HTTP core (SPEC §5.6): headers, ETag conditional requests, rate-limit state,
// the retry/error policy and a request queue with at most 2 requests in flight.
// Framework-free: `fetch`, the clock and `sleep` are injected so tests need no network.
// Nothing here logs; tokens and bodies never leave this module except as the returned body.
import { parseLinkHeader, type LinkRels } from './link'
import { AuthError, GitHubHttpError, NotFoundError, RateLimitedError } from './errors'

export const GITHUB_API_BASE = 'https://api.github.com'
export const GITHUB_ACCEPT = 'application/vnd.github+json'
export const GITHUB_API_VERSION = '2022-11-28'

/** Parsed `x-ratelimit-*` headers. `resetAt` is epoch milliseconds. */
export interface RateLimitInfo {
  limit: number
  remaining: number
  used: number
  resetAt: number
  resource: string
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

export interface GitHubHttpOptions {
  fetch: typeof fetch
  /** Returns the in-memory token; an empty or blank value means anonymous mode. */
  getToken: () => string
  /** Called on a 401 so the caller can clear the token from memory. */
  onUnauthorized?: () => void
  /** Called with the rate-limit state parsed from every response that carries it. */
  onRateLimit?: (info: RateLimitInfo) => void
  sleep?: Sleep
  /** Clock in epoch milliseconds. */
  now?: () => number
  baseUrl?: string
  maxInFlight?: number
}

export interface RequestOptions {
  /** Overrides `Accept`, e.g. `application/vnd.github.raw+json` for raw file contents. */
  accept?: string
  /** `json` (default) parses the body; `text` returns it as a string. */
  responseType?: 'json' | 'text'
  signal?: AbortSignal
}

export interface GitHubResponse<T> {
  status: number
  body: T
  link: LinkRels
  /** True when a 304 was answered from the ETag cache. */
  fromCache: boolean
}

/** Return `false` to stop paginating. */
export type OnPage<T> = (body: T, response: GitHubResponse<T>) => boolean | void | Promise<boolean | void>

export interface GitHubHttp {
  request<T = unknown>(pathOrUrl: string, options?: RequestOptions): Promise<GitHubResponse<T>>
  paginate<T = unknown>(pathOrUrl: string, onPage: OnPage<T>, signal?: AbortSignal): Promise<void>
  getRateLimit(): RateLimitInfo | null
  clearCache(): void
}

interface CacheEntry {
  etag: string
  lastModified: string | null
  body: unknown
  link: LinkRels
}

const MAX_BACKOFF_RETRIES = 2
const FORBIDDEN_BASE_DELAY_MS = 60_000
const SERVER_ERROR_BASE_DELAY_MS = 1_000

/** Parses the `x-ratelimit-*` headers; `null` when they are absent or not numeric. */
export function parseRateLimit(headers: Headers): RateLimitInfo | null {
  const num = (name: string) => {
    const raw = headers.get(`x-ratelimit-${name}`)
    if (raw === null || raw.trim() === '') return NaN
    return Number(raw)
  }
  const limit = num('limit')
  const remaining = num('remaining')
  const used = num('used')
  const reset = num('reset')
  if (![limit, remaining, used, reset].every(Number.isFinite)) return null
  return {
    limit,
    remaining,
    used,
    resetAt: reset * 1000,
    resource: headers.get('x-ratelimit-resource') ?? 'core',
  }
}

/** Default sleep on `setTimeout` (works with fake timers); rejects when the signal aborts. */
export const defaultSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/** FIFO semaphore: at most `limit` tasks run at once, started in submission order. */
function createQueue(limit: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve))
    else active += 1
    try {
      return await task()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active -= 1
    }
  }
}

async function readBody(res: Response, type: 'json' | 'text'): Promise<unknown> {
  const text = await res.text()
  if (type === 'text') return text
  if (text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    // The native SyntaxError quotes the body, so it must not escape this module.
    throw new GitHubHttpError(res.status, 'GitHub returned a malformed JSON body')
  }
}

export function createGitHubHttp(options: GitHubHttpOptions): GitHubHttp {
  const fetchFn = options.fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const baseUrl = (options.baseUrl ?? GITHUB_API_BASE).replace(/\/+$/, '')
  const baseOrigin = new URL(baseUrl).origin
  const enqueue = createQueue(options.maxInFlight ?? 2)
  const cache = new Map<string, CacheEntry>()
  let rateLimit: RateLimitInfo | null = null

  const resolveUrl = (pathOrUrl: string) =>
    /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`

  function buildHeaders(url: string, accept: string, cached: CacheEntry | undefined) {
    const headers: Record<string, string> = {
      Accept: accept,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    }
    const token = options.getToken().trim()
    // The token only ever goes to the configured API origin, never to a foreign link target.
    if (token && new URL(url).origin === baseOrigin) headers.Authorization = `Bearer ${token}`
    if (cached) headers['If-None-Match'] = cached.etag
    return headers
  }

  function recordRateLimit(res: Response) {
    const info = parseRateLimit(res.headers)
    if (!info) return
    rateLimit = info
    options.onRateLimit?.(info)
  }

  async function send<T>(pathOrUrl: string, opts: RequestOptions): Promise<GitHubResponse<T>> {
    const url = resolveUrl(pathOrUrl)
    const accept = opts.accept ?? GITHUB_ACCEPT
    const responseType = opts.responseType ?? 'json'
    const cacheKey = `${accept} ${url}`
    let retryAfterUsed = false
    let backoffRetries = 0

    for (;;) {
      opts.signal?.throwIfAborted()
      const cached = cache.get(cacheKey)
      const res = await fetchFn(url, {
        headers: buildHeaders(url, accept, cached),
        signal: opts.signal,
      })
      recordRateLimit(res)

      if (res.status === 304) {
        if (!cached) throw new GitHubHttpError(304)
        return { status: 304, body: cached.body as T, link: cached.link, fromCache: true }
      }
      if (res.ok) {
        const body = await readBody(res, responseType)
        const link = parseLinkHeader(res.headers.get('link'))
        const etag = res.headers.get('etag')
        if (etag) cache.set(cacheKey, { etag, lastModified: res.headers.get('last-modified'), body, link })
        return { status: res.status, body: body as T, link, fromCache: false }
      }
      if (res.status === 401) {
        options.onUnauthorized?.()
        throw new AuthError()
      }
      if (res.status === 404) throw new NotFoundError()

      const limited = res.status === 403 || res.status === 429
      if (!limited && res.status < 500) throw new GitHubHttpError(res.status)

      const retryAfter = Number(res.headers.get('retry-after'))
      if (res.headers.has('retry-after') && Number.isFinite(retryAfter) && retryAfter >= 0) {
        const waitMs = retryAfter * 1000
        if (retryAfterUsed) throw new RateLimitedError(res.status, now() + waitMs)
        retryAfterUsed = true
        await sleep(waitMs, opts.signal)
        continue
      }
      if (limited && res.headers.get('x-ratelimit-remaining') === '0') {
        const resetSeconds = Number(res.headers.get('x-ratelimit-reset'))
        const resetAt = Number.isFinite(resetSeconds) ? resetSeconds * 1000 : now()
        throw new RateLimitedError(res.status, resetAt)
      }
      if (backoffRetries >= MAX_BACKOFF_RETRIES) throw new GitHubHttpError(res.status)
      const base = limited ? FORBIDDEN_BASE_DELAY_MS : SERVER_ERROR_BASE_DELAY_MS
      await sleep(base * 2 ** backoffRetries, opts.signal)
      backoffRetries += 1
    }
  }

  return {
    request: (pathOrUrl, opts = {}) => enqueue(() => send(pathOrUrl, opts)),

    async paginate<T>(pathOrUrl: string, onPage: OnPage<T>, signal?: AbortSignal) {
      let next: string | undefined = pathOrUrl
      while (next) {
        const res: GitHubResponse<T> = await this.request<T>(next, { signal })
        const keepGoing = await onPage(res.body, res)
        signal?.throwIfAborted()
        if (keepGoing === false) return
        next = res.link.next
      }
    },

    getRateLimit: () => rateLimit,
    clearCache: () => cache.clear(),
  }
}
