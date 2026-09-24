// @vitest-environment node
// The shared /jev proxy policy (server/jevProxyPolicy.ts): one pure decision
// table used by the Vite middleware and by the hosted Pages Function.
import { describe, expect, it, vi } from 'vitest'
import {
  createTokenBucketLimiter,
  decideJevProxyRequest,
  DEFAULT_RATE_LIMITS,
  JEV_FORWARDED_REQUEST_HEADERS,
  JEV_MAX_BODY_BYTES,
  JEV_RESPONSE_HEADERS,
  type JevProxyContext,
  type JevProxyRequest,
  type JevRateLimiter,
} from '../../server/jevProxyPolicy'

const SITE = 'https://issueclassifier.com'
const unlimited: JevRateLimiter = { take: () => ({ ok: true }) }

function ctx(overrides: Partial<JevProxyContext> = {}): JevProxyContext {
  return { allowedOrigins: [SITE], now: 0, limiter: unlimited, ...overrides }
}

function req(overrides: Partial<JevProxyRequest> = {}): JevProxyRequest {
  return {
    method: 'POST',
    path: '/jev/v1/systemone',
    headers: { 'content-type': 'application/json', 'content-length': '42', authorization: 'Bearer k' },
    secFetchSite: 'same-origin',
    ip: '203.0.113.7',
    ...overrides,
  }
}

describe('decideJevProxyRequest: paths', () => {
  it.each([
    ['POST', '/jev/v1/systemone', '/v1/systemone'],
    ['GET', '/jev/v1/models', '/v1/models'],
  ])('allows %s %s and maps it to %s upstream', (method, path, upstreamPath) => {
    const decision = decideJevProxyRequest(req({ method, path }), ctx())
    expect(decision).toMatchObject({ allow: true, upstreamPath })
  })

  it.each([
    '/jev',
    '/jev/',
    '/jev/v1/other',
    '/jev/v1/systemone/extra',
    '/jev/v1/models?x=1',
    '/jev/v2/systemone',
    '/jev/v1/../admin',
    '/jev/v1/%73ystemone',
    '/jevx/v1/models',
    '/v1/systemone',
  ])('answers 404 for %s', (path) => {
    expect(decideJevProxyRequest(req({ path }), ctx())).toMatchObject({ allow: false, status: 404 })
  })

  it('honours a custom prefix', () => {
    const decision = decideJevProxyRequest(req({ path: '/ai/v1/systemone' }), ctx({ prefix: '/ai' }))
    expect(decision).toMatchObject({ allow: true, upstreamPath: '/v1/systemone' })
  })
})

describe('decideJevProxyRequest: methods', () => {
  it.each([
    ['GET', '/jev/v1/systemone', 'POST'],
    ['PUT', '/jev/v1/systemone', 'POST'],
    ['POST', '/jev/v1/models', 'GET'],
    ['DELETE', '/jev/v1/models', 'GET'],
  ])('answers 405 for %s %s with Allow: %s', (method, path, allowed) => {
    const decision = decideJevProxyRequest(req({ method, path }), ctx())
    expect(decision).toMatchObject({ allow: false, status: 405, headers: { allow: allowed } })
  })

  it('answers an OPTIONS preflight itself with 204 and no CORS headers, never forwarding it', () => {
    const decision = decideJevProxyRequest(req({ method: 'OPTIONS', secFetchSite: 'cross-site' }), ctx())
    expect(decision.allow).toBe(false)
    if (decision.allow) return
    expect(decision.status).toBe(204)
    const names = Object.keys(decision.headers ?? {})
    expect(names.some((n) => n.startsWith('access-control-'))).toBe(false)
  })
})

describe('decideJevProxyRequest: same-origin requirement', () => {
  it('accepts Sec-Fetch-Site: same-origin without Origin or Referer', () => {
    expect(decideJevProxyRequest(req(), ctx()).allow).toBe(true)
  })

  it('reads Sec-Fetch-Site, Origin and Referer from the headers when not given explicitly', () => {
    const headers = { 'content-length': '2', 'sec-fetch-site': 'same-origin' }
    expect(decideJevProxyRequest(req({ secFetchSite: undefined, headers }), ctx()).allow).toBe(true)
    const withOrigin = { 'content-length': '2', origin: SITE }
    expect(decideJevProxyRequest(req({ secFetchSite: undefined, headers: withOrigin }), ctx()).allow).toBe(true)
  })

  it('accepts an allowlisted Origin when Sec-Fetch-Site is absent', () => {
    const decision = decideJevProxyRequest(req({ secFetchSite: undefined, origin: SITE }), ctx())
    expect(decision.allow).toBe(true)
  })

  it('accepts an allowlisted Referer when Origin and Sec-Fetch-Site are absent (same-origin GET)', () => {
    const decision = decideJevProxyRequest(
      req({ method: 'GET', path: '/jev/v1/models', secFetchSite: undefined, referer: `${SITE}/analysis/42` }),
      ctx(),
    )
    expect(decision.allow).toBe(true)
  })

  it('compares whole origins: scheme and port matter, trailing slashes in the allowlist do not', () => {
    const allow = (origin: string) =>
      decideJevProxyRequest(req({ secFetchSite: undefined, origin }), ctx({ allowedOrigins: [`${SITE}/`] })).allow
    expect(allow(SITE)).toBe(true)
    expect(allow('http://issueclassifier.com')).toBe(false)
    expect(allow('https://issueclassifier.com:8443')).toBe(false)
    expect(allow('https://issueclassifier.com.evil.example')).toBe(false)
  })

  it.each([
    ['cross-site with a foreign Origin', { secFetchSite: 'cross-site', origin: 'https://evil.example' }],
    ['cross-site even with a spoofed allowlisted Origin', { secFetchSite: 'cross-site', origin: SITE }],
    ['same-site (a sibling subdomain)', { secFetchSite: 'same-site', origin: 'https://x.issueclassifier.com' }],
    ['none (typed in the address bar)', { secFetchSite: 'none' }],
    ['a foreign Origin without Sec-Fetch-Site', { secFetchSite: undefined, origin: 'https://evil.example' }],
    ['a foreign Referer without Origin', { secFetchSite: undefined, referer: 'https://evil.example/page' }],
    ['a malformed Origin', { secFetchSite: undefined, origin: 'not a url' }],
    ['the literal Origin "null"', { secFetchSite: undefined, origin: 'null' }],
    ['no Sec-Fetch-Site, Origin or Referer (curl)', { secFetchSite: undefined }],
  ])('refuses %s with 403', (_label, overrides) => {
    expect(decideJevProxyRequest(req(overrides as Partial<JevProxyRequest>), ctx())).toMatchObject({
      allow: false,
      status: 403,
    })
  })

  it('refuses everything but Sec-Fetch-Site: same-origin when the allowlist is empty', () => {
    const empty = ctx({ allowedOrigins: [] })
    expect(decideJevProxyRequest(req(), empty).allow).toBe(true)
    expect(decideJevProxyRequest(req({ secFetchSite: undefined, origin: SITE }), empty).allow).toBe(false)
  })
})

describe('decideJevProxyRequest: body cap', () => {
  it(`defaults the cap to 2 MB`, () => {
    expect(JEV_MAX_BODY_BYTES).toBe(2 * 1024 * 1024)
  })

  it('accepts a body exactly at the cap and refuses one byte over with 413', () => {
    const at = req({ headers: { 'content-length': String(JEV_MAX_BODY_BYTES) } })
    const over = req({ headers: { 'content-length': String(JEV_MAX_BODY_BYTES + 1) } })
    expect(decideJevProxyRequest(at, ctx()).allow).toBe(true)
    expect(decideJevProxyRequest(over, ctx())).toMatchObject({ allow: false, status: 413 })
  })

  it('takes a configured cap', () => {
    const decision = decideJevProxyRequest(req({ headers: { 'content-length': '11' } }), ctx({ maxBodyBytes: 10 }))
    expect(decision).toMatchObject({ allow: false, status: 413 })
  })

  it.each([undefined, 'abc', '-1', '1.5'])('refuses a POST whose Content-Length is %s with 411', (value) => {
    const headers = value === undefined ? {} : { 'content-length': value }
    expect(decideJevProxyRequest(req({ headers }), ctx())).toMatchObject({ allow: false, status: 411 })
  })

  it('does not require a Content-Length on GET /v1/models', () => {
    const decision = decideJevProxyRequest(req({ method: 'GET', path: '/jev/v1/models', headers: {} }), ctx())
    expect(decision.allow).toBe(true)
  })
})

describe('decideJevProxyRequest: forwarded headers', () => {
  it('forwards only authorization, content-type and accept', () => {
    expect([...JEV_FORWARDED_REQUEST_HEADERS]).toEqual(['authorization', 'content-type', 'accept'])
    const decision = decideJevProxyRequest(
      req({
        headers: {
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
          accept: 'application/json',
          'content-length': '10',
          cookie: 'session=1',
          origin: SITE,
          referer: `${SITE}/`,
          'x-forwarded-for': '1.2.3.4',
          'cf-connecting-ip': '1.2.3.4',
          'x-local-target': 'http://127.0.0.1:8000',
          'user-agent': 'test',
          host: 'issueclassifier.com',
        },
      }),
      ctx(),
    )
    expect(decision.allow).toBe(true)
    if (!decision.allow) return
    expect(decision.forwardHeaders).toEqual({
      authorization: 'Bearer secret',
      'content-type': 'application/json',
      accept: 'application/json',
    })
  })

  it('joins a repeated header and drops an empty one', () => {
    const decision = decideJevProxyRequest(
      req({ headers: { 'content-length': '1', accept: ['application/json', 'text/plain'], authorization: '' } }),
      ctx(),
    )
    if (!decision.allow) throw new Error('expected allow')
    expect(decision.forwardHeaders).toEqual({ accept: 'application/json, text/plain' })
  })

  it('sets Cache-Control: no-store and nosniff on every answer, allowed or not, and no CORS headers', () => {
    expect(JEV_RESPONSE_HEADERS).toEqual({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    const allowed = decideJevProxyRequest(req(), ctx())
    const denied = decideJevProxyRequest(req({ path: '/jev/x' }), ctx())
    for (const decision of [allowed, denied]) {
      expect(decision.responseHeaders).toEqual(JEV_RESPONSE_HEADERS)
    }
  })
})

describe('decideJevProxyRequest: rate limit', () => {
  it('asks the limiter keyed by client IP, only for requests that would be forwarded', () => {
    const take = vi.fn(() => ({ ok: true as const }))
    const limiter = { take }
    decideJevProxyRequest(req({ path: '/jev/nope' }), ctx({ limiter, now: 5 }))
    decideJevProxyRequest(req({ secFetchSite: 'cross-site' }), ctx({ limiter, now: 5 }))
    expect(take).not.toHaveBeenCalled()
    decideJevProxyRequest(req(), ctx({ limiter, now: 5 }))
    expect(take).toHaveBeenCalledWith('203.0.113.7', 5)
  })

  it('keys a request without an IP as "unknown"', () => {
    const take = vi.fn(() => ({ ok: true as const }))
    decideJevProxyRequest(req({ ip: undefined }), ctx({ limiter: { take } }))
    expect(take).toHaveBeenCalledWith('unknown', 0)
  })

  it('answers 429 with Retry-After in whole seconds, rounded up', () => {
    const limiter: JevRateLimiter = { take: () => ({ ok: false, retryAfterMs: 1_200 }) }
    expect(decideJevProxyRequest(req(), ctx({ limiter }))).toMatchObject({
      allow: false,
      status: 429,
      headers: { 'retry-after': '2' },
    })
  })
})

describe('createTokenBucketLimiter', () => {
  it('documents its defaults: 300 per minute and 3000 per hour per IP', () => {
    expect(DEFAULT_RATE_LIMITS).toEqual([
      { capacity: 300, windowMs: 60_000 },
      { capacity: 3_000, windowMs: 3_600_000 },
    ])
  })

  it('allows a burst up to capacity, then refuses until a token refills', () => {
    const limiter = createTokenBucketLimiter({ rules: [{ capacity: 3, windowMs: 3_000 }] })
    expect([0, 0, 0].map((t) => limiter.take('a', t).ok)).toEqual([true, true, true])
    const refused = limiter.take('a', 0)
    expect(refused).toEqual({ ok: false, retryAfterMs: 1_000 })
    expect(limiter.take('a', 999).ok).toBe(false)
    expect(limiter.take('a', 1_000).ok).toBe(true)
    expect(limiter.take('a', 1_000).ok).toBe(false)
  })

  it('never refills above capacity', () => {
    const limiter = createTokenBucketLimiter({ rules: [{ capacity: 2, windowMs: 1_000 }] })
    limiter.take('a', 0)
    const later = 1_000_000
    expect([limiter.take('a', later).ok, limiter.take('a', later).ok, limiter.take('a', later).ok]).toEqual([
      true,
      true,
      false,
    ])
  })

  it('keeps one bucket per key', () => {
    const limiter = createTokenBucketLimiter({ rules: [{ capacity: 1, windowMs: 60_000 }] })
    expect(limiter.take('a', 0).ok).toBe(true)
    expect(limiter.take('a', 0).ok).toBe(false)
    expect(limiter.take('b', 0).ok).toBe(true)
  })

  it('applies every rule: the hourly bucket stops a client the minute bucket would let through', () => {
    const limiter = createTokenBucketLimiter({
      rules: [
        { capacity: 2, windowMs: 1_000 },
        { capacity: 3, windowMs: 3_600_000 },
      ],
    })
    const results = [0, 0, 5_000, 10_000].map((t) => limiter.take('a', t).ok)
    expect(results).toEqual([true, true, true, false])
    const refused = limiter.take('a', 10_000)
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    // The hourly bucket refills one token per 1 200 000 ms.
    expect(refused.retryAfterMs).toBeGreaterThan(1_000_000)
  })

  it('does not spend minute tokens when the hourly rule refuses', () => {
    const limiter = createTokenBucketLimiter({
      rules: [
        { capacity: 1, windowMs: 1_000 },
        { capacity: 1, windowMs: 1_000_000 },
      ],
    })
    expect(limiter.take('a', 0).ok).toBe(true)
    expect(limiter.take('a', 1_000).ok).toBe(false)
    // After the hourly bucket refills, the minute bucket is still full: one request passes.
    expect(limiter.take('a', 1_000_000).ok).toBe(true)
  })

  it('bounds its memory: the oldest key is evicted past maxKeys', () => {
    const limiter = createTokenBucketLimiter({ rules: [{ capacity: 1, windowMs: 60_000 }], maxKeys: 2 })
    limiter.take('a', 0)
    limiter.take('b', 0)
    limiter.take('c', 0)
    expect(limiter.size()).toBe(2)
    // 'a' was evicted, so it starts with a full bucket again.
    expect(limiter.take('a', 0).ok).toBe(true)
  })

  it('tolerates a clock that goes backwards', () => {
    const limiter = createTokenBucketLimiter({ rules: [{ capacity: 1, windowMs: 1_000 }] })
    expect(limiter.take('a', 10_000).ok).toBe(true)
    expect(limiter.take('a', 0).ok).toBe(false)
  })

  it('rejects invalid rules', () => {
    expect(() => createTokenBucketLimiter({ rules: [] })).toThrow()
    expect(() => createTokenBucketLimiter({ rules: [{ capacity: 0, windowMs: 1 }] })).toThrow()
    expect(() => createTokenBucketLimiter({ rules: [{ capacity: 1, windowMs: 0 }] })).toThrow()
  })
})

describe('decideJevProxyRequest: purity', () => {
  it('never logs', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    decideJevProxyRequest(req(), ctx())
    decideJevProxyRequest(req({ secFetchSite: 'cross-site' }), ctx())
    decideJevProxyRequest(req({ path: '/jev/x' }), ctx())
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })
})
