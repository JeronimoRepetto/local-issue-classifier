// local-issue-classifier — reference Cloudflare Pages Function for the hosted /jev proxy.
//
// NOT deployed by this repository. It is the hosted counterpart of the Vite
// proxy (server/jevProxy.ts) and runs every request through the same pure
// policy (server/jevProxyPolicy.ts): path and method allowlists, same-origin
// callers only, a body cap, a per-IP rate limit, a request-header allowlist
// and `Cache-Control: no-store` answers. It logs nothing and stores nothing:
// the caller's Authorization header exists only while the request is in flight.
//
// Placement: Pages routes `functions/jev/[[path]].ts` to every path under
// `/jev/`, so the site keeps `VITE_JEV_BASE_URL=/jev` (same origin, no CORS).
//
// Environment (Pages project settings, never committed):
//   ALLOWED_ORIGINS   comma-separated site origins, e.g. "https://issueclassifier.com"
//   JEV_UPSTREAM_URL  upstream origin, default https://api.typesafe.ai
//
// Rate limiting: the default limiter is an in-memory token bucket, which on
// Workers is per isolate (one per data center and instance, recycled at any
// time). It slows a single abuser down but is not a global limit. The
// production upgrade is a shared limiter (a Durable Object keyed by IP, or KV),
// plugged in through `sharedLimiter`; see docs/security.md.
//
// Only standard fetch APIs are used (Request, Response, fetch), so the file
// needs no Workers type package and is unit-tested under Node.
import {
  createTokenBucketLimiter,
  decideJevProxyRequest,
  JEV_MAX_BODY_BYTES,
  JEV_RESPONSE_HEADERS,
  precomputedLimiter,
  type AsyncJevRateLimiter,
  type JevProxyDecision,
  type JevRateLimiter,
  type RateLimitRule,
} from '../../server/jevProxyPolicy'

export const JEV_UPSTREAM_DEFAULT = 'https://api.typesafe.ai'

/** The only upstream response headers passed back, besides the policy's own. */
export const JEV_FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after', 'retry-after-ms'] as const

export interface JevFunctionEnv {
  ALLOWED_ORIGINS?: string
  JEV_UPSTREAM_URL?: string
}

/** The subset of the Pages `EventContext` this handler reads. */
export interface JevPagesContext<Env extends JevFunctionEnv = JevFunctionEnv> {
  request: Request
  env: Env
}

export interface JevPagesHandlerOptions<Env extends JevFunctionEnv = JevFunctionEnv> {
  /** Injected for tests; defaults to the runtime's global fetch. */
  fetch?: typeof fetch
  now?: () => number
  /** Synchronous limiter; default an in-memory (per-isolate) token bucket. */
  limiter?: JevRateLimiter
  /** Rules for the default in-memory bucket; default DEFAULT_RATE_LIMITS. */
  rateLimits?: readonly RateLimitRule[]
  /**
   * Hook for a shared limiter (Durable Object, KV). When it returns one, it
   * replaces the in-memory bucket and is consulted only for requests the rest
   * of the policy would forward.
   */
  sharedLimiter?: (env: Env) => AsyncJevRateLimiter | undefined
  maxBodyBytes?: number
}

const ALLOW_ALL: JevRateLimiter = { take: () => ({ ok: true }) }

function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

function headersOf(request: Request): Record<string, string> {
  const out: Record<string, string> = {}
  request.headers.forEach((value, name) => {
    out[name] = value
  })
  return out
}

function answer(status: number, headers: Record<string, string>, body?: Record<string, string>): Response {
  if (body === undefined || status === 204) return new Response(null, { status, headers })
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } })
}

function refuse(decision: Extract<JevProxyDecision, { allow: false }>): Response {
  return answer(decision.status, { ...decision.responseHeaders, ...decision.headers }, { error: decision.reason })
}

/** Reads the body but stops as soon as it exceeds `cap`: Content-Length is only a claim. */
async function readCapped(request: Request, cap: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > cap) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export function createJevPagesHandler<Env extends JevFunctionEnv = JevFunctionEnv>(
  options: JevPagesHandlerOptions<Env> = {},
): (context: JevPagesContext<Env>) => Promise<Response> {
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const now = options.now ?? Date.now
  const localLimiter = options.limiter ?? createTokenBucketLimiter({ rules: options.rateLimits })
  const maxBodyBytes = options.maxBodyBytes ?? JEV_MAX_BODY_BYTES

  return async ({ request, env }) => {
    const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS)
    if (allowedOrigins.length === 0) {
      // Fail closed: an unset or empty ALLOWED_ORIGINS means this deployment is
      // misconfigured. Sec-Fetch-Site alone is not enough to fall back on here —
      // it is a genuine browser guarantee only for a browser request; a scripted,
      // non-browser caller can set that header to whatever value it likes. Refuse
      // everything instead of silently trusting it.
      return answer(403, { ...JEV_RESPONSE_HEADERS }, { error: 'ALLOWED_ORIGINS not configured' })
    }
    const url = new URL(request.url)
    const policyRequest = {
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers: headersOf(request),
      // Set by Cloudflare's edge; a client-sent X-Forwarded-For is never trusted.
      ip: request.headers.get('cf-connecting-ip') ?? undefined,
    }
    const at = now()
    const context = { allowedOrigins, now: at, maxBodyBytes }
    const shared = options.sharedLimiter?.(env)

    let decision = decideJevProxyRequest(policyRequest, { ...context, limiter: shared ? ALLOW_ALL : localLimiter })
    if (decision.allow && shared) {
      const rate = await shared.take(policyRequest.ip || 'unknown', at)
      decision = decideJevProxyRequest(policyRequest, { ...context, limiter: precomputedLimiter(rate) })
    }
    if (!decision.allow) return refuse(decision)

    let body: Uint8Array | undefined
    if (request.method.toUpperCase() === 'POST') {
      const read = await readCapped(request, maxBodyBytes)
      if (read === null) return answer(413, decision.responseHeaders, { error: 'Request too large' })
      body = read
    }

    const upstreamBase = (env.JEV_UPSTREAM_URL || JEV_UPSTREAM_DEFAULT).replace(/\/+$/, '')
    let upstream: Response
    try {
      upstream = await doFetch(`${upstreamBase}${decision.upstreamPath}`, {
        method: request.method.toUpperCase(),
        headers: decision.forwardHeaders,
        body: body ? (body.buffer as ArrayBuffer) : undefined,
        // A redirect could point anywhere; it is returned, never followed.
        redirect: 'manual',
      })
    } catch {
      // Silent on purpose: the error could echo the request.
      return answer(502, decision.responseHeaders, { error: 'Upstream unreachable' })
    }

    const headers: Record<string, string> = {}
    for (const name of JEV_FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name)
      if (value !== null) headers[name] = value
    }
    return new Response(upstream.body, { status: upstream.status, headers: { ...headers, ...decision.responseHeaders } })
  }
}

/** Pages Functions entry point: every method under /jev/. */
export const onRequest = createJevPagesHandler()
