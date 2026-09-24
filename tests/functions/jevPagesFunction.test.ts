// @vitest-environment node
// The reference Cloudflare Pages Function for the hosted /jev proxy
// (functions/jev/[[path]].ts), exercised with standard Request/Response objects
// and a fake upstream fetch. Nothing here touches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJevPagesHandler, onRequest, type JevFunctionEnv } from '../../functions/jev/[[path]]'
import type { AsyncJevRateLimiter, JevRateLimiter } from '../../server/jevProxyPolicy'

const SITE = 'https://issueclassifier.com'
const ENV: JevFunctionEnv = { ALLOWED_ORIGINS: `${SITE}, https://www.issueclassifier.com`, JEV_UPSTREAM_URL: 'https://jev.test' }

interface Seen {
  url: string
  init: RequestInit
}

function fakeUpstream(response: () => Response = () => json(200, { ok: true })) {
  const seen: Seen[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init: init ?? {} })
    return response()
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, seen }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

function post(body: string, headers: Record<string, string> = {}, path = '/jev/v1/systemone'): Request {
  return new Request(`${SITE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(body).length),
      'sec-fetch-site': 'same-origin',
      authorization: 'Bearer test-key',
      'cf-connecting-ip': '203.0.113.9',
      ...headers,
    },
    body,
  })
}

const unlimited: JevRateLimiter = { take: () => ({ ok: true }) }

let consoleSpies: ReturnType<typeof vi.spyOn>[] = []
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
})
afterEach(() => {
  for (const spy of consoleSpies) {
    expect(spy, 'the function must never log').not.toHaveBeenCalled()
    spy.mockRestore()
  }
})

describe('Jev Pages Function: forwarding', () => {
  it('forwards a same-origin POST to JEV_UPSTREAM_URL with only the allowlisted headers', async () => {
    const upstream = fakeUpstream(() => json(200, { answers: [] }, { 'set-cookie': 'a=1', 'retry-after': '1', 'x-internal': 'z' }))
    const handler = createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited })
    const res = await handler({
      request: post('{"model":"jev-latest"}', { cookie: 's=1', 'x-forwarded-for': '1.1.1.1', 'user-agent': 'x' }),
      env: ENV,
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ answers: [] })
    expect(upstream.seen).toHaveLength(1)
    const [{ url, init }] = upstream.seen
    expect(url).toBe('https://jev.test/v1/systemone')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"model":"jev-latest"}')
    expect(init.headers).toEqual({ authorization: 'Bearer test-key', 'content-type': 'application/json' })

    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('retry-after')).toBe('1')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-internal')).toBeNull()
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('forwards GET /jev/v1/models without a body, accepted by an allowlisted Referer', async () => {
    const upstream = fakeUpstream()
    const handler = createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited })
    const res = await handler({
      request: new Request(`${SITE}/jev/v1/models`, { headers: { referer: 'https://www.issueclassifier.com/a' } }),
      env: ENV,
    })
    expect(res.status).toBe(200)
    expect(upstream.seen[0].url).toBe('https://jev.test/v1/models')
    expect(upstream.seen[0].init.body).toBeUndefined()
  })

  it('defaults the upstream to https://api.typesafe.ai and strips a trailing slash from JEV_UPSTREAM_URL', async () => {
    const upstream = fakeUpstream()
    const handler = createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited })
    await handler({ request: post('{}'), env: { ALLOWED_ORIGINS: SITE } })
    await handler({ request: post('{}'), env: { ALLOWED_ORIGINS: SITE, JEV_UPSTREAM_URL: 'https://jev.test/' } })
    expect(upstream.seen.map((s) => s.url)).toEqual(['https://api.typesafe.ai/v1/systemone', 'https://jev.test/v1/systemone'])
  })

  it('answers 502 without detail when the upstream cannot be reached', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('connect ECONNREFUSED')
    }) as unknown as typeof fetch
    const handler = createJevPagesHandler({ fetch: failing, limiter: unlimited })
    const res = await handler({ request: post('{}'), env: ENV })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Upstream unreachable' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('Jev Pages Function: refusals', () => {
  it.each([
    ['a cross-site caller', post('{}', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }), 403],
    ['a caller with no origin information', post('{}', { 'sec-fetch-site': '' }), 403],
    ['an unknown path', post('{}', {}, '/jev/v1/admin'), 404],
    ['a query string', post('{}', {}, '/jev/v1/systemone?debug=1'), 404],
    ['the wrong method', new Request(`${SITE}/jev/v1/systemone`, { headers: { 'sec-fetch-site': 'same-origin' } }), 405],
  ])('refuses %s and never calls upstream', async (_label, request, status) => {
    const upstream = fakeUpstream()
    const res = await createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited })({ request, env: ENV })
    expect(res.status).toBe(status)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(upstream.seen).toHaveLength(0)
  })

  it('answers a preflight with 204 and no CORS headers', async () => {
    const upstream = fakeUpstream()
    const request = new Request(`${SITE}/jev/v1/systemone`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    })
    const res = await createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited })({ request, env: ENV })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(upstream.seen).toHaveLength(0)
  })

  it('refuses a body larger than the cap even when Content-Length understates it', async () => {
    const upstream = fakeUpstream()
    const handler = createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited, maxBodyBytes: 8 })
    const res = await handler({ request: post('0123456789', { 'content-length': '2' }), env: ENV })
    expect(res.status).toBe(413)
    expect(upstream.seen).toHaveLength(0)
  })
})

describe('Jev Pages Function: rate limit', () => {
  it('keys the limiter by CF-Connecting-IP, never by X-Forwarded-For', async () => {
    const take = vi.fn(() => ({ ok: true as const }))
    const handler = createJevPagesHandler({ fetch: fakeUpstream().fetch, limiter: { take }, now: () => 1234 })
    await handler({ request: post('{}', { 'x-forwarded-for': '6.6.6.6' }), env: ENV })
    expect(take).toHaveBeenCalledWith('203.0.113.9', 1234)
  })

  it('answers 429 with Retry-After from the default in-memory bucket once exhausted', async () => {
    const upstream = fakeUpstream()
    const handler = createJevPagesHandler({ fetch: upstream.fetch, now: () => 0, rateLimits: [{ capacity: 2, windowMs: 60_000 }] })
    const statuses = []
    for (let i = 0; i < 3; i++) statuses.push((await handler({ request: post('{}'), env: ENV })).status)
    expect(statuses).toEqual([200, 200, 429])
    const limited = await handler({ request: post('{}'), env: ENV })
    expect(limited.headers.get('retry-after')).toBe('30')
    expect(upstream.seen).toHaveLength(2)
  })

  it('uses a shared (Durable Object / KV) limiter when the hook provides one', async () => {
    const shared: AsyncJevRateLimiter = { take: vi.fn(async () => ({ ok: false as const, retryAfterMs: 5_000 })) }
    const upstream = fakeUpstream()
    const handler = createJevPagesHandler({ fetch: upstream.fetch, sharedLimiter: () => shared })
    const res = await handler({ request: post('{}'), env: ENV })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('5')
    expect(shared.take).toHaveBeenCalledWith('203.0.113.9', expect.any(Number))
    expect(upstream.seen).toHaveLength(0)
  })
})

describe('Jev Pages Function: environment', () => {
  it('refuses every request when ALLOWED_ORIGINS is missing, even with Sec-Fetch-Site: same-origin (fail closed)', async () => {
    const upstream = fakeUpstream()
    const handler = createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited })
    const res = await handler({ request: post('{}'), env: {} })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'ALLOWED_ORIGINS not configured' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(upstream.seen).toHaveLength(0)
  })

  it('refuses every request when ALLOWED_ORIGINS is set but empty (fail closed)', async () => {
    const upstream = fakeUpstream()
    const handler = createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited })
    const res = await handler({ request: post('{}'), env: { ALLOWED_ORIGINS: '  ,  ' } })
    expect(res.status).toBe(403)
    expect(upstream.seen).toHaveLength(0)
  })

  it('still serves a configured deployment normally', async () => {
    const upstream = fakeUpstream()
    const handler = createJevPagesHandler({ fetch: upstream.fetch, limiter: unlimited })
    const res = await handler({ request: post('{}'), env: ENV })
    expect(res.status).toBe(200)
    expect(upstream.seen).toHaveLength(1)
  })
})

describe('Jev Pages Function: module export', () => {
  it('exports onRequest for the Pages router', () => {
    expect(typeof onRequest).toBe('function')
  })
})
