// @vitest-environment node
// T16 — the /jev-local proxy (docs/deployment.md): forwards to a local
// Jev-compatible server named per request in `x-local-target`, only when that
// target is loopback or a private LAN address. Tested against a fake upstream.
import { createServer as createHttpServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer as createViteServer, type ViteDevServer } from 'vite'
import {
  JEV_LOCAL_PROXY_PREFIX,
  LOCAL_PROXY_MARKER_HEADER,
  LOCAL_TARGET_HEADER,
  jevLocalProxy,
} from '../../server/jevProxy'

describe('jevLocalProxy constants', () => {
  it('uses /jev-local, x-local-target and a marker header', () => {
    expect(JEV_LOCAL_PROXY_PREFIX).toBe('/jev-local')
    expect(LOCAL_TARGET_HEADER).toBe('x-local-target')
    expect(LOCAL_PROXY_MARKER_HEADER).toBe('x-jev-local-proxy')
  })
})

describe('jevLocalProxy end to end, against a fake upstream', () => {
  let upstream: Server
  let vite: ViteDevServer
  let base: string
  let target: string
  let deadTarget: string
  const seen: { url: string; method: string; headers: IncomingHttpHeaders; body: string }[] = []

  beforeAll(async () => {
    upstream = createHttpServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        seen.push({ url: req.url ?? '', method: req.method ?? '', headers: req.headers, body })
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3', 'x-internal': 'no' })
        res.end(JSON.stringify({ detail: 'slow down' }))
      })
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`

    const dead = createHttpServer()
    await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve))
    deadTarget = `http://127.0.0.1:${(dead.address() as AddressInfo).port}`
    await new Promise((resolve) => dead.close(resolve))

    vite = await createViteServer({
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [jevLocalProxy()],
      server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
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
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) consoleSpies.push(vi.spyOn(console, m))
  })
  afterEach(() => {
    for (const spy of consoleSpies) {
      expect(spy, 'the proxy must never log').not.toHaveBeenCalled()
      spy.mockRestore()
    }
    consoleSpies.length = 0
  })

  it('forwards POST /v1/systemone to the header target with body and Authorization only', async () => {
    const res = await fetch(`${base}/jev-local/v1/systemone`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer local-key',
        'content-type': 'application/json',
        [LOCAL_TARGET_HEADER]: target,
        origin: base,
        referer: `${base}/analysis`,
        cookie: 'session=abc',
      },
      body: JSON.stringify({ model: 'kev-latest' }),
    })
    expect(res.status).toBe(429)
    expect(res.headers.get(LOCAL_PROXY_MARKER_HEADER)).toBe('upstream')
    expect(res.headers.get('retry-after')).toBe('3')
    expect(res.headers.get('x-internal')).toBeNull()
    expect(await res.json()).toEqual({ detail: 'slow down' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ url: '/v1/systemone', method: 'POST', body: '{"model":"kev-latest"}' })
    expect(seen[0].headers.authorization).toBe('Bearer local-key')
    for (const header of ['origin', 'referer', 'cookie', LOCAL_TARGET_HEADER]) {
      expect(seen[0].headers[header], header).toBeUndefined()
    }
  })

  it('forwards GET /v1/models, keeping a path prefix of the target', async () => {
    const res = await fetch(`${base}/jev-local/v1/models`, { headers: { [LOCAL_TARGET_HEADER]: `${target}/kev/` } })
    expect(res.status).toBe(429)
    expect(seen.map((s) => s.url)).toEqual(['/kev/v1/models'])
  })

  it.each([
    ['a missing target header', undefined],
    ['a public host', 'https://api.typesafe.ai'],
    ['link-local metadata', 'http://169.254.169.254'],
    ['a non-http scheme', 'file:///etc/passwd'],
  ])('refuses %s with 400 and never reaches upstream', async (_label, value) => {
    const headers: Record<string, string> = value === undefined ? {} : { [LOCAL_TARGET_HEADER]: value }
    const res = await fetch(`${base}/jev-local/v1/models`, { headers })
    expect(res.status).toBe(400)
    expect(res.headers.get(LOCAL_PROXY_MARKER_HEADER)).toBe('rejected')
    expect(seen).toHaveLength(0)
  })

  it.each(['/jev-local/v1/other', '/jev-local/v1/models?x=1', '/jev-local/', '/jev-local'])(
    'refuses %s with 404 and never reaches upstream',
    async (path) => {
      const res = await fetch(`${base}${path}`, { headers: { [LOCAL_TARGET_HEADER]: target } })
      expect(res.status).toBe(404)
      expect(seen).toHaveLength(0)
    },
  )

  it('refuses a cross-origin caller with 403', async () => {
    const res = await fetch(`${base}/jev-local/v1/models`, {
      headers: { [LOCAL_TARGET_HEADER]: target, origin: 'https://evil.example.com' },
    })
    expect(res.status).toBe(403)
    expect(seen).toHaveLength(0)
  })

  it('answers 502 with the unreachable marker when the local server is down', async () => {
    const res = await fetch(`${base}/jev-local/v1/models`, { headers: { [LOCAL_TARGET_HEADER]: deadTarget } })
    expect(res.status).toBe(502)
    expect(res.headers.get(LOCAL_PROXY_MARKER_HEADER)).toBe('unreachable')
  })

  it('leaves other paths, including /jev, to the rest of the server', async () => {
    const res = await fetch(`${base}/jev-localx/v1/models`, { headers: { [LOCAL_TARGET_HEADER]: target } })
    expect(res.headers.get(LOCAL_PROXY_MARKER_HEADER)).toBeNull()
    expect(seen).toHaveLength(0)
  })
})
