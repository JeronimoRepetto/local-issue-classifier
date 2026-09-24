// local-issue-classifier — the /jev proxy policy, shared by every proxy host.
//
// Framework-free and pure: no Node, Vite or Workers API, no I/O, no clock of
// its own and no logging. The Vite middleware (server/jevProxy.ts) uses it for
// `pnpm dev` and `pnpm preview`; the hosted Cloudflare Pages Function
// (functions/jev/[[path]].ts) uses the same decision table, so both hosts
// answer every request the same way. See docs/security.md for the threat model.
//
// Order of checks (the first failing one decides):
//   1. path allowlist        -> 404 (anything but <prefix>/v1/systemone and <prefix>/v1/models)
//   2. OPTIONS preflight     -> 204, never forwarded, no CORS headers (a cross-origin
//                               caller's preflight therefore fails in its browser)
//   3. method allowlist      -> 405 with Allow (POST systemone, GET models)
//   4. same-origin caller    -> 403 (so the proxy is not a public relay)
//   5. body size             -> 411 without a valid Content-Length on POST, 413 above the cap
//   6. per-IP rate limit     -> 429 with Retry-After
// Only a request that passes all six reaches the limiter, so refused requests
// never spend a client's tokens.

export const JEV_PROXY_PREFIX_DEFAULT = '/jev'

/** Allowlisted upstream paths and the one method each accepts. */
export const JEV_ALLOWED_ROUTES: Readonly<Record<string, 'GET' | 'POST'>> = {
  '/v1/systemone': 'POST',
  '/v1/models': 'GET',
}

/** The only request headers that reach upstream; everything else is stripped. */
export const JEV_FORWARDED_REQUEST_HEADERS = ['authorization', 'content-type', 'accept'] as const

/** Set on every answer, allowed or refused. Same-origin only, so no CORS headers. */
export const JEV_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

/**
 * 2 MB. A cloud request is bounded by Jev's 64 000-token budget
 * (src/domain/jevBatchState.ts), about 256 KB of text, so this leaves a wide margin.
 */
export const JEV_MAX_BODY_BYTES = 2 * 1024 * 1024

export interface RateLimitRule {
  /** Burst size: requests allowed at once from a full bucket. */
  capacity: number
  /** Time for an empty bucket to refill completely (refill is continuous). */
  windowMs: number
}

/**
 * 300 requests per minute and 3 000 per hour, per client IP. One tab classifying
 * at the maximum concurrency of 8 at about 2 s per call sends about 240 requests a
 * minute (src/domain/classifyRun.ts), so a normal run never meets the limit, while
 * a relay abuser is capped far below Jev's own 1 200 requests per minute.
 */
export const DEFAULT_RATE_LIMITS: readonly RateLimitRule[] = [
  { capacity: 300, windowMs: 60_000 },
  { capacity: 3_000, windowMs: 3_600_000 },
]

export type RateDecision = { ok: true } | { ok: false; retryAfterMs: number }

/** Synchronous limiter the policy consults. `now` is epoch milliseconds. */
export interface JevRateLimiter {
  take(key: string, now: number): RateDecision
}

/**
 * Hook for a shared limiter (a Durable Object or KV store) whose answer needs a
 * round trip. A host awaits it first and hands the policy its result through
 * `precomputedLimiter`.
 */
export interface AsyncJevRateLimiter {
  take(key: string, now: number): Promise<RateDecision>
}

/** Wraps an already-known answer so the synchronous policy can use it. */
export function precomputedLimiter(decision: RateDecision): JevRateLimiter {
  return { take: () => decision }
}

export type HeaderValue = string | string[] | undefined

export interface JevProxyRequest {
  method: string
  /** Request path as received, including the prefix and any query string. */
  path: string
  headers: Readonly<Record<string, HeaderValue>>
  /** Each of these falls back to the matching header when omitted. */
  origin?: string
  referer?: string
  secFetchSite?: string
  /** Client IP as the host sees it (socket address, CF-Connecting-IP). */
  ip?: string
}

export interface JevProxyContext {
  /** Exact origins (scheme://host[:port]) accepted from Origin or Referer. */
  allowedOrigins: readonly string[]
  /** Epoch milliseconds, supplied by the host so the policy stays pure. */
  now: number
  limiter: JevRateLimiter
  prefix?: string
  maxBodyBytes?: number
}

export type JevDenyStatus = 204 | 403 | 404 | 405 | 411 | 413 | 429

export type JevProxyDecision =
  | {
      allow: true
      upstreamPath: string
      forwardHeaders: Record<string, string>
      responseHeaders: Record<string, string>
    }
  | {
      allow: false
      status: JevDenyStatus
      /** Short, fixed reason: safe to return to the caller, never contains request data. */
      reason: string
      /** Extra headers for this answer (Allow, Retry-After). */
      headers?: Record<string, string>
      responseHeaders: Record<string, string>
    }

function headerValue(headers: Readonly<Record<string, HeaderValue>>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue
    const joined = Array.isArray(value) ? value.join(', ') : value
    return joined === undefined || joined === '' ? undefined : joined
  }
  return undefined
}

function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    const origin = new URL(value).origin
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

/** Browsers that send Sec-Fetch-Site tell the truth; otherwise Origin, then Referer, must match. */
function isSameOrigin(req: JevProxyRequest, allowedOrigins: readonly string[]): boolean {
  const site = (req.secFetchSite ?? headerValue(req.headers, 'sec-fetch-site'))?.toLowerCase()
  if (site !== undefined) return site === 'same-origin'
  const allowed = new Set(allowedOrigins.map(originOf).filter((o): o is string => o !== null))
  const origin = req.origin ?? headerValue(req.headers, 'origin')
  if (origin !== undefined) {
    const parsed = originOf(origin)
    return parsed !== null && allowed.has(parsed)
  }
  const referer = originOf(req.referer ?? headerValue(req.headers, 'referer'))
  return referer !== null && allowed.has(referer)
}

function deny(
  status: JevDenyStatus,
  reason: string,
  headers?: Record<string, string>,
): Extract<JevProxyDecision, { allow: false }> {
  return { allow: false, status, reason, ...(headers ? { headers } : {}), responseHeaders: { ...JEV_RESPONSE_HEADERS } }
}

export function decideJevProxyRequest(req: JevProxyRequest, ctx: JevProxyContext): JevProxyDecision {
  const prefix = ctx.prefix ?? JEV_PROXY_PREFIX_DEFAULT
  const upstreamPath = req.path.startsWith(`${prefix}/`) ? req.path.slice(prefix.length) : null
  const allowedMethod = upstreamPath !== null ? JEV_ALLOWED_ROUTES[upstreamPath] : undefined
  if (upstreamPath === null || allowedMethod === undefined || !Object.hasOwn(JEV_ALLOWED_ROUTES, upstreamPath)) {
    return deny(404, 'Not found')
  }

  const method = req.method.toUpperCase()
  if (method === 'OPTIONS') return deny(204, 'Preflight answered without CORS')
  if (method !== allowedMethod) return deny(405, 'Method not allowed', { allow: allowedMethod })

  if (!isSameOrigin(req, ctx.allowedOrigins)) return deny(403, 'Cross-origin request refused')

  if (method === 'POST') {
    const raw = headerValue(req.headers, 'content-length')
    if (raw === undefined || !/^\d+$/.test(raw)) return deny(411, 'Length required')
    if (Number(raw) > (ctx.maxBodyBytes ?? JEV_MAX_BODY_BYTES)) return deny(413, 'Request too large')
  }

  const rate = ctx.limiter.take(req.ip || 'unknown', ctx.now)
  if (!rate.ok) {
    const seconds = Math.max(1, Math.ceil(rate.retryAfterMs / 1000))
    return deny(429, 'Too many requests', { 'retry-after': String(seconds) })
  }

  const forwardHeaders: Record<string, string> = {}
  for (const name of JEV_FORWARDED_REQUEST_HEADERS) {
    const value = headerValue(req.headers, name)
    if (value !== undefined) forwardHeaders[name] = value
  }
  return { allow: true, upstreamPath, forwardHeaders, responseHeaders: { ...JEV_RESPONSE_HEADERS } }
}

// ── In-memory token bucket ──────────────────────────────────────────────────

export interface TokenBucketOptions {
  rules?: readonly RateLimitRule[]
  /** Upper bound on tracked keys; the least recently used key is evicted first. */
  maxKeys?: number
}

export interface TokenBucketLimiter extends JevRateLimiter {
  /** Number of keys currently tracked. */
  size(): number
}

interface Bucket {
  /** Per rule, in integer units: one token is `windowMs` units, refilled at `capacity` units per ms. */
  units: number[]
  at: number
}

/**
 * One bucket per key and rule. A request passes only when every rule has a
 * whole token, and then spends one from each, so a refused request costs nothing.
 * Per process (per isolate on Workers): see docs/security.md for the shared upgrade.
 */
export function createTokenBucketLimiter(options: TokenBucketOptions = {}): TokenBucketLimiter {
  const rules = options.rules ?? DEFAULT_RATE_LIMITS
  const maxKeys = options.maxKeys ?? 10_000
  if (rules.length === 0) throw new Error('createTokenBucketLimiter: at least one rule is required')
  for (const rule of rules) {
    if (!(rule.capacity >= 1) || !(rule.windowMs > 0)) {
      throw new Error('createTokenBucketLimiter: capacity must be >= 1 and windowMs > 0')
    }
  }
  const buckets = new Map<string, Bucket>()

  return {
    size: () => buckets.size,
    take(key, now) {
      let bucket = buckets.get(key)
      if (bucket) {
        buckets.delete(key)
        const elapsed = Math.max(0, now - bucket.at)
        bucket.units = bucket.units.map((u, i) => Math.min(rules[i].capacity * rules[i].windowMs, u + elapsed * rules[i].capacity))
        bucket.at = Math.max(bucket.at, now)
      } else {
        bucket = { units: rules.map((r) => r.capacity * r.windowMs), at: now }
      }
      buckets.set(key, bucket)
      while (buckets.size > maxKeys) {
        const oldest = buckets.keys().next().value
        if (oldest === undefined) break
        buckets.delete(oldest)
      }

      let retryAfterMs = 0
      bucket.units.forEach((u, i) => {
        const missing = rules[i].windowMs - u
        if (missing > 0) retryAfterMs = Math.max(retryAfterMs, Math.ceil(missing / rules[i].capacity))
      })
      if (retryAfterMs > 0) return { ok: false, retryAfterMs }
      bucket.units = bucket.units.map((u, i) => u - rules[i].windowMs)
      return { ok: true }
    },
  }
}
