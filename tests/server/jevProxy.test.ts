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

  it('strips origin, referer and cookie from the upstream request, silently', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    const options = createJevProxy()[jevProxyKey('/jev')]
    const proxy = new EventEmitter()
    options.configure?.(proxy as never, options)
    const removed: string[] = []
    const proxyReq = { removeHeader: (name: string) => removed.push(name) }
    proxy.emit('proxyReq', proxyReq, {}, {}, {})
    expect(STRIPPED_REQUEST_HEADERS).toEqual(['origin', 'referer', 'cookie'])
    expect(removed.sort()).toEqual(['cookie', 'origin', 'referer'])
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

  beforeAll(async () => {
    upstream = createHttpServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        seen.push({ url: req.url ?? '', method: req.method ?? '', headers: req.headers, body })
        res.writeHead(401, { 'content-type': 'application/json' })
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
      plugins: [jevProxyGuard()],
      server: { port: 0, host: '127.0.0.1', proxy: createJevProxy({ target }), hmr: false, watch: null },
    })
    await vite.listen()
    base = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await vite?.close()
    await new Promise((resolve) => upstream?.close(resolve))
  })

  const consoleSpies: ReturnType<typeof vi.spyOn>[] = []
  beforeEach(() => {
    seen.length = 0
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

  it('forwards /jev/v1/systemone with the body and Authorization, minus origin/referer/cookie', async () => {
    const res = await fetch(`${base}/jev/v1/systemone`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
        origin: 'http://localhost:5200',
        referer: 'http://localhost:5200/analysis',
        cookie: 'session=abc',
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
    expect(seen[0].headers.origin).toBeUndefined()
    expect(seen[0].headers.referer).toBeUndefined()
    expect(seen[0].headers.cookie).toBeUndefined()
  })

  it('forwards GET /jev/v1/models', async () => {
    const res = await fetch(`${base}/jev/v1/models`)
    expect(res.status).toBe(401)
    expect(seen.map((s) => s.url)).toEqual(['/v1/models'])
  })

  it.each(['/jev/v1/other', '/jev/v1/models?x=1', '/jev/', '/jev'])(
    'refuses %s with 404 and never reaches upstream',
    async (path) => {
      const res = await fetch(`${base}${path}`)
      expect(res.status).toBe(404)
      expect(seen).toHaveLength(0)
    },
  )
})
