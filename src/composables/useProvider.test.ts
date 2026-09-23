// T16 — useProvider: builds the Jev client for the selected provider and
// routes a local server directly (CORS ok) or through /jev-local (CORS fails).
// Every network call goes to a fake fetch; nothing real is contacted.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS, defaultPreferences } from '../domain/types'
import type { Preferences } from '../domain/types'
import type { ProviderConfig } from '../domain/provider'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

type Mods = {
  provider: typeof import('./useProvider')
  prefs: typeof import('./usePreferences')
  secrets: typeof import('./useSecrets')
}

interface Seen {
  url: string
  method: string
  mode: string | undefined
  headers: Record<string, string>
  body: unknown
}

type Route = (call: Seen) => Response | Promise<Response>

let mods: Mods
let seen: Seen[]

const LOCAL: ProviderConfig = { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' }
const MODELS = { models: [{ name: 'kev-latest', description: 'Kev 4B', release_date: '2026-09-01' }] }
const ANSWERS = { model: 'kev-latest', answers: {} }

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const viaProxy = (body: unknown, status = 200) => json(body, status, { 'x-jev-local-proxy': 'upstream' })
const corsFailure = () => Promise.reject(new TypeError('Failed to fetch'))

async function load(route: Route, prefs: Partial<Preferences> = {}) {
  const storage = new MemoryStorage()
  storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...defaultPreferences(), ...prefs }))
  const { setAppStorage } = await import('../adapters/storage/appStorage')
  setAppStorage(storage)
  mods = {
    provider: await import('./useProvider'),
    prefs: await import('./usePreferences'),
    secrets: await import('./useSecrets'),
  }
  seen = []
  mods.provider.configureProvider({
    fetch: async (input, init) => {
      const call: Seen = {
        url: String(input),
        method: init?.method ?? 'GET',
        mode: init?.mode,
        headers: { ...((init?.headers as Record<string, string>) ?? {}) },
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      }
      seen.push(call)
      return route(call)
    },
  })
}

beforeEach(() => {
  vi.resetModules()
})

const state = { issue: 1 } as never

describe('useProvider: TypeSafe (unchanged path)', () => {
  it('sends through the /jev proxy with the Jev key and the preferred model', async () => {
    await load(() => json(ANSWERS), { jevModel: 'jev-1.13.0' })
    mods.secrets.useSecrets().setJevKey('jev-test')
    const provider = mods.provider.useProvider()
    expect(provider.isLocal.value).toBe(false)
    expect(provider.ready.value).toBe(true)

    const client = provider.createClient()
    expect(client.model).toBe('jev-1.13.0')
    await client.classify(state)
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe('/jev/v1/systemone')
    expect(seen[0].headers.authorization).toBe('Bearer jev-test')
    expect(seen[0].headers['x-local-target']).toBeUndefined()
    expect(seen[0].body).toMatchObject({ model: 'jev-1.13.0' })
  })

  it('is not ready without a Jev key', async () => {
    await load(() => json(ANSWERS))
    expect(mods.provider.useProvider().ready.value).toBe(false)
  })

  it('dropKey clears the Jev key only', async () => {
    await load(() => json(ANSWERS))
    const secrets = mods.secrets.useSecrets()
    secrets.setJevKey('jev-test')
    secrets.setLocalApiKey('local-test')
    mods.provider.useProvider().dropKey()
    expect(secrets.state.jevApiKey).toBe('')
    expect(secrets.state.localApiKey).toBe('local-test')
  })
})

describe('useProvider: local server routing', () => {
  it('goes direct when the CORS preflight to /v1/models succeeds, and caches that', async () => {
    await load((call) => (call.url.endsWith('/v1/models') ? json(MODELS) : json(ANSWERS)), { provider: LOCAL })
    const provider = mods.provider.useProvider()
    expect(provider.isLocal.value).toBe(true)
    expect(provider.ready.value).toBe(true)
    expect(provider.status.value).toBe('unknown')

    const result = await provider.probe()
    expect(result).toEqual({ status: 'direct', models: ['kev-latest'] })
    expect(provider.status.value).toBe('direct')
    expect(provider.models.value).toEqual(['kev-latest'])
    expect(seen[0]).toMatchObject({ url: 'http://localhost:8009/v1/models', method: 'GET', mode: 'cors' })

    const client = provider.createClient()
    expect(client.model).toBe('kev-latest')
    await client.classify(state)
    await client.classify(state)
    expect(seen.map((c) => c.url)).toEqual([
      'http://localhost:8009/v1/models',
      'http://localhost:8009/v1/systemone',
      'http://localhost:8009/v1/systemone',
    ])
    expect(seen[1].headers['x-local-target']).toBeUndefined()
    expect(seen[1].headers.authorization).toBeUndefined()
    expect(seen[1].body).toMatchObject({ model: 'kev-latest' })
  })

  it('falls back to /jev-local with the target header when the direct call fails CORS', async () => {
    await load(
      (call) => {
        if (call.url.startsWith('http://')) return corsFailure()
        return call.url.endsWith('/v1/models') ? viaProxy(MODELS) : viaProxy(ANSWERS)
      },
      { provider: LOCAL },
    )
    const provider = mods.provider.useProvider()
    expect(await provider.probe()).toEqual({ status: 'proxied', models: ['kev-latest'] })
    expect(seen.map((c) => c.url)).toEqual(['http://localhost:8009/v1/models', '/jev-local/v1/models'])
    expect(seen[1].headers['x-local-target']).toBe('http://localhost:8009')

    await provider.createClient().classify(state)
    expect(seen.at(-1)?.url).toBe('/jev-local/v1/systemone')
    expect(seen.at(-1)?.headers['x-local-target']).toBe('http://localhost:8009')
    expect(provider.status.value).toBe('proxied')
  })

  it('is unreachable when both routes fail, and a classify call reports a network error', async () => {
    await load((call) => (call.url.startsWith('http://') ? corsFailure() : json({ error: 'x' }, 502, { 'x-jev-local-proxy': 'unreachable' })), {
      provider: LOCAL,
    })
    const provider = mods.provider.useProvider()
    expect(await provider.probe()).toEqual({ status: 'unreachable', models: null })
    expect(provider.status.value).toBe('unreachable')
    await expect(provider.createClient().classify(state)).rejects.toMatchObject({ name: 'JevTransportError', kind: 'network' })
  })

  it('treats a proxy answer without the marker header (e.g. an SPA fallback) as unreachable', async () => {
    await load(
      (call) =>
        call.url.startsWith('http://') ? corsFailure() : new Response('<html></html>', { status: 200 }),
      { provider: LOCAL },
    )
    expect((await mods.provider.useProvider().probe()).status).toBe('unreachable')
  })

  it('counts a direct HTTP error (e.g. 404 on /v1/models) as reachable, without a model list', async () => {
    await load((call) => (call.url.endsWith('/v1/models') ? json({ detail: 'Not Found' }, 404) : json(ANSWERS)), {
      provider: LOCAL,
    })
    expect(await mods.provider.useProvider().probe()).toEqual({ status: 'direct', models: null })
  })

  it('probes lazily on the first classify call when no route is known yet', async () => {
    await load((call) => (call.url.endsWith('/v1/models') ? json(MODELS) : json(ANSWERS)), { provider: LOCAL })
    await mods.provider.useProvider().createClient().classify(state)
    expect(seen.map((c) => c.url)).toEqual(['http://localhost:8009/v1/models', 'http://localhost:8009/v1/systemone'])
  })

  it('sends the optional local key as a bearer token', async () => {
    await load(() => json(MODELS), { provider: LOCAL })
    mods.secrets.useSecrets().setLocalApiKey('kev-key')
    await mods.provider.useProvider().probe()
    expect(seen[0].headers.authorization).toBe('Bearer kev-key')
  })

  it('is ready without any key, but not with an invalid base URL', async () => {
    await load(() => json(MODELS), { provider: { ...LOCAL, baseUrl: 'https://api.example.com' } })
    const provider = mods.provider.useProvider()
    expect(provider.ready.value).toBe(false)
    expect(await provider.probe()).toEqual({ status: 'unreachable', models: null })
    expect(seen).toEqual([])
  })

  it('keeps one routing decision per base URL', async () => {
    await load(
      (call) => (call.url.startsWith('http://localhost:8009') ? json(MODELS) : call.url.startsWith('http://') ? corsFailure() : viaProxy(MODELS)),
      { provider: LOCAL },
    )
    const provider = mods.provider.useProvider()
    const prefs = mods.prefs.usePreferences()
    expect((await provider.probe()).status).toBe('direct')
    prefs.update({ provider: { ...LOCAL, baseUrl: 'http://192.168.1.20:8009' } })
    expect(provider.status.value).toBe('unknown')
    expect((await provider.probe()).status).toBe('proxied')
    prefs.update({ provider: LOCAL })
    expect(provider.status.value).toBe('direct')
  })

  it('dropKey clears the local key only', async () => {
    await load(() => json(MODELS), { provider: LOCAL })
    const secrets = mods.secrets.useSecrets()
    secrets.setJevKey('jev-test')
    secrets.setLocalApiKey('local-test')
    mods.provider.useProvider().dropKey()
    expect(secrets.state.localApiKey).toBe('')
    expect(secrets.state.jevApiKey).toBe('jev-test')
  })
})
