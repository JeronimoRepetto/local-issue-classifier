// @vitest-environment node
import { EventEmitter } from 'node:events'
import { createServer as createHttpServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer as createViteServer, type ViteDevServer } from 'vite'
import {
  createJevProxy,
  jevProxyGuard,
  jevProxyKey,
  jevProxyPrefix,
  JEV_UPSTREAM_DEFAULT,
  STRIPPED_REQUEST_HEADERS,
} from '../../server/jevProxy'
import { createTokenBucketLimiter, type JevRateLimiter } from '../../server/jevProxyPolicy'

describe('jevProxy options factory', () => {
  it('allowlists only /v1/systemone and /v1/models under the prefix', () => {
    const re = new RegExp(jevProxyKey('/jev'))
    expect(re.test('/jev/v1/systemone')).toBe(true)
    expect(re.test('/jev/v1/models')).toBe(true)
    for (const path of [
      '/jev/v1/other',
      '/jev/v1/systemone/extra',
      '/jev/v1/models?x=1',
      '/jev/v2/systemone',
      '/v1/systemone',
      '/jevx/v1/models',
      '/jev/v1/../admin',
    ]) {
      expect(re.test(path), path).toBe(false)
    }
  })

  it('has exactly one entry, keyed by the allowlist regex, with the default upstream', () => {
    const proxy = createJevProxy()
    expect(Object.keys(proxy)).toEqual(['^/jev/v1/(systemone|models)$'])
    const options = proxy[jevProxyKey('/jev')]
    expect(JEV_UPSTREAM_DEFAULT).toBe('https://api.typesafe.ai')
    expect(options.target).toBe('https://api.typesafe.ai')
    expect(options.changeOrigin).toBe(true)
  })

  it('takes the upstream target and prefix from configuration', () => {
    const proxy = createJevProxy({ target: 'http://localhost:9999', prefix: '/ai' })
    const options = proxy['^/ai/v1/(systemone|models)$']
    expect(options.target).toBe('http://localhost:9999')
    expect(options.rewrite?.('/ai/v1/models')).toBe('/v1/models')
  })

  it('rewrites /jev away', () => {
    const options = createJevProxy()[jevProxyKey('/jev')]
    expect(options.rewrite?.('/jev/v1/systemone')).toBe('/v1/systemone')
  })

  it('strips every request header but the allowlist and transport headers, silently', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    const options = createJevProxy()[jevProxyKey('/jev')]
    const proxy = new EventEmitter()
    options.configure?.(proxy as never, options)
    const removed: string[] = []
    const present = [
      'host',
      'content-length',
      'authorization',
      'content-type',
      'accept',
      'origin',
      'referer',
      'cookie',
      'user-agent',
      'x-forwarded-for',
      'sec-fetch-site',
    ]
    const proxyReq = {
      getHeaderNames: () => present,
      removeHeader: (name: string) => removed.push(name),
    }
    proxy.emit('proxyReq', proxyReq, {}, {}, {})
    expect(STRIPPED_REQUEST_HEADERS).toEqual(['origin', 'referer', 'cookie'])
    expect(removed.sort()).toEqual(['cookie', 'origin', 'referer', 'sec-fetch-site', 'user-agent', 'x-forwarded-for'])
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })

  it('derives the proxy prefix from VITE_JEV_BASE_URL when it is a path', () => {
    expect(jevProxyPrefix(undefined)).toBe('/jev')
    expect(jevProxyPrefix('/jev/')).toBe('/jev')
    expect(jevProxyPrefix('/ai')).toBe('/ai')
    expect(jevProxyPrefix('https://fn.example.com/jev')).toBe('/jev')
  })
})

describe('jevProxy end to end, against a fake upstream', () => {
  let upstream: Server
  let vite: ViteDevServer
  let base: string
  const seen: { url: string; method: string; headers: IncomingHttpHeaders; body: string }[] = []
  // Filled in once the server has a port: the explicit allowlist vite.config.ts passes.
  const allowedOrigins: string[] = []
  let rate: ReturnType<JevRateLimiter['take']> = { ok: true }
  const limiterKeys: string[] = []
  const limiter: JevRateLimiter = {
    take: (key) => {
      limiterKeys.push(key)
      return rate
    },
  }

  beforeAll(async () => {
    upstream = createHttpServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        seen.push({ url: req.url ?? '', method: req.method ?? '', headers: req.headers, body })
        res.writeHead(401, { 'content-type': 'application/json', 'set-cookie': 'tracker=1' })
        res.end(JSON.stringify({ detail: 'Invalid API key' }))
      })
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`

    vite = await createViteServer({
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [jevProxyGuard({ allowedOrigins, limiter })],
      server: { port: 0, host: '127.0.0.1', proxy: createJevProxy({ target }), hmr: false, watch: null },
    })
    await vite.listen()
    base = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`
    allowedOrigins.push(base)
  })

  afterAll(async () => {
    await vite?.close()
    await new Promise((resolve) => upstream?.close(resolve))
  })

  const consoleSpies: ReturnType<typeof vi.spyOn>[] = []
  beforeEach(() => {
    seen.length = 0
    limiterKeys.length = 0
    rate = { ok: true }
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      consoleSpies.push(vi.spyOn(console, m))
    }
  })
  afterEach(() => {
    for (const spy of consoleSpies) {
      expect(spy, 'the proxy must never log').not.toHaveBeenCalled()
      spy.mockRestore()
    }
    consoleSpies.length = 0
  })

  it('forwards /jev/v1/systemone with the body and Authorization, minus every other header', async () => {
    const res = await fetch(`${base}/jev/v1/systemone`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
        origin: base,
        referer: `${base}/analysis`,
        cookie: 'session=abc',
        'x-forwarded-for': '198.51.100.1',
      },
      body: JSON.stringify({ model: 'jev-latest' }),
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ detail: 'Invalid API key' })
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe('/v1/systemone')
    expect(seen[0].method).toBe('POST')
    expect(seen[0].body).toBe('{"model":"jev-latest"}')
    expect(seen[0].headers.authorization).toBe('Bearer test-key')
    expect(seen[0].headers['content-type']).toBe('application/json')
    expect(seen[0].headers.origin).toBeUndefined()
    expect(seen[0].headers.referer).toBeUndefined()
    expect(seen[0].headers.cookie).toBeUndefined()
    expect(seen[0].headers['x-forwarded-for']).toBeUndefined()
    expect(seen[0].headers['user-agent']).toBeUndefined()
  })

  it('answers with Cache-Control: no-store and without upstream cookies', async () => {
    const res = await fetch(`${base}/jev/v1/models`, { headers: { 'sec-fetch-site': 'same-origin' } })
    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('forwards a same-origin GET /jev/v1/models, rate limited by the socket address', async () => {
    const res = await fetch(`${base}/jev/v1/models`, { headers: { 'sec-fetch-site': 'same-origin' } })
    expect(res.status).toBe(401)
    expect(seen.map((s) => s.url)).toEqual(['/v1/models'])
    expect(limiterKeys).toEqual(['127.0.0.1'])
  })

  it.each(['/jev/v1/other', '/jev/v1/models?x=1', '/jev/', '/jev'])(
    'refuses %s with 404 and never reaches upstream',
    async (path) => {
      const res = await fetch(`${base}${path}`)
      expect(res.status).toBe(404)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(seen).toHaveLength(0)
    },
  )

  it.each([
    ['a cross-site browser request', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['no origin information at all', {}],
  ])('refuses %s with 403 and never reaches upstream', async (_label, headers) => {
    const res = await fetch(`${base}/jev/v1/models`, { headers })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Cross-origin request refused' })
    expect(seen).toHaveLength(0)
    expect(limiterKeys).toEqual([])
  })

  it('answers 429 with Retry-After once the limiter refuses, and never reaches upstream', async () => {
    rate = { ok: false, retryAfterMs: 2_500 }
    const res = await fetch(`${base}/jev/v1/models`, { headers: { 'sec-fetch-site': 'same-origin' } })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('3')
    expect(seen).toHaveLength(0)
  })

  it('answers 405 with Allow for the wrong method', async () => {
    const res = await fetch(`${base}/jev/v1/systemone`, { headers: { 'sec-fetch-site': 'same-origin' } })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
    expect(seen).toHaveLength(0)
  })

  it('answers an OPTIONS preflight with 204 and no CORS headers', async () => {
    const res = await fetch(`${base}/jev/v1/systemone`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(seen).toHaveLength(0)
  })

  it('refuses a body over 2 MB with 413', async () => {
    const res = await fetch(`${base}/jev/v1/systemone`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      body: 'x'.repeat(2 * 1024 * 1024 + 1),
    })
    expect(res.status).toBe(413)
    expect(seen).toHaveLength(0)
  })
})

describe('jevProxyGuard defaults', () => {
  let upstream: Server
  let vite: ViteDevServer
  let base: string

  beforeAll(async () => {
    upstream = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"data":[]}')
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
    vite = await createViteServer({
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] },
      // A real in-memory bucket with a tiny capacity; no allowlist, so the origin comes from Host.
      plugins: [jevProxyGuard({ limiter: createTokenBucketLimiter({ rules: [{ capacity: 2, windowMs: 60_000 }] }) })],
      server: { port: 0, host: '127.0.0.1', proxy: createJevProxy({ target }), hmr: false, watch: null },
    })
    await vite.listen()
    base = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await vite?.close()
    await new Promise((resolve) => upstream?.close(resolve))
  })

  it('accepts its own origin, derived from Host, and refuses another port', async () => {
    const foreign = await fetch(`${base}/jev/v1/models`, { headers: { origin: 'http://127.0.0.1:1' } })
    expect(foreign.status).toBe(403)
  })

  it('exhausts the in-memory bucket and answers 429', async () => {
    const hit = () => fetch(`${base}/jev/v1/models`, { headers: { origin: base } }).then((r) => r.status)
    expect([await hit(), await hit(), await hit()]).toEqual([200, 200, 429])
  })
})
