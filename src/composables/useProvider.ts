// Which server classifies (docs/local-providers.md): a module singleton that
// builds the Jev client for Preferences.provider.
//
// - TypeSafe: the unchanged `/jev` proxy path with useSecrets().state.jevApiKey.
// - Local (Kev, JevK5): a direct browser call to `baseUrl` when a one-time
//   CORS check (`GET {baseUrl}/v1/models`, mode 'cors') succeeds, otherwise the
//   `/jev-local` Vite proxy with the target in `x-local-target`. The decision
//   is cached in memory per base URL; an unreachable result is not cached, so
//   the next call probes again.
// The optional local key lives in useSecrets().state.localApiKey, never in
// Preferences. Nothing here logs.
import { computed, reactive } from 'vue'
import {
  JEV_LOCAL_PROXY_PREFIX,
  LOCAL_PROXY_MARKER_HEADER,
  LOCAL_TARGET_HEADER,
  defaultLocalProviderConfig,
  defaultProviderConfig,
  parseModelNames,
  providerKey,
  validateLocalBaseUrl,
} from '../domain/provider'
import type { ProviderConfig, ProviderProbeResult, ProviderRouteStatus } from '../domain/provider'
import { createJevClient } from '../adapters/jev/client'
import type { JevClient } from '../adapters/jev/client'
import { JevTransportError, createHttpJevTransport, resolveJevBaseUrl } from '../adapters/jev/transport'
import type { JevTransport } from '../adapters/jev/transport'
import { usePreferences } from './usePreferences'
import { useSecrets } from './useSecrets'

/** A 4B model on a consumer GPU can take far longer than the cloud's 20 s per call. */
export const LOCAL_TIMEOUT_MS = 180_000
/** The connection check must answer quickly or count as failed. */
export const PROBE_TIMEOUT_MS = 5_000

export interface ProviderEnvironment {
  fetch: typeof fetch
  /** The TypeSafe proxy path, VITE_JEV_BASE_URL (default '/jev'). */
  typesafeBaseUrl: string
  localProxyPrefix: string
  localTimeoutMs: number
  probeTimeoutMs: number
}

let env: ProviderEnvironment = {
  fetch: (input, init) => globalThis.fetch(input, init),
  typesafeBaseUrl: resolveJevBaseUrl(import.meta.env.VITE_JEV_BASE_URL),
  localProxyPrefix: JEV_LOCAL_PROXY_PREFIX,
  localTimeoutMs: LOCAL_TIMEOUT_MS,
  probeTimeoutMs: PROBE_TIMEOUT_MS,
}

/** Dependency injection for tests (fake fetch). */
export function configureProvider(next: Partial<ProviderEnvironment>): void {
  env = { ...env, ...next }
}

const prefs = usePreferences()
const secrets = useSecrets()

/** Routing decisions and model lists, keyed by providerKey(). In memory only. */
const routes = reactive<Record<string, ProviderRouteStatus>>({})
const modelLists = reactive<Record<string, string[] | null>>({})
const inflight = new Map<string, Promise<ProviderProbeResult>>()

const config = computed<ProviderConfig>(() => prefs.state.provider ?? defaultProviderConfig())
const isLocal = computed(() => config.value.kind === 'local')
const status = computed<ProviderRouteStatus>(() => routes[providerKey(config.value)] ?? 'unknown')
const models = computed<string[] | null>(() => modelLists[providerKey(config.value)] ?? null)

/** TypeSafe needs a Jev key; a local server needs a valid base URL (its key is optional). */
const ready = computed(() => {
  const c = config.value
  return c.kind === 'typesafe' ? secrets.hasJevKey.value : validateLocalBaseUrl(c.baseUrl).ok
})

function getApiKey(): string {
  return config.value.kind === 'typesafe' ? secrets.state.jevApiKey : secrets.state.localApiKey
}

/** The model sent with every request: Preferences.jevModel, or the local config's model. */
function model(): string {
  const c = config.value
  if (c.kind === 'typesafe') return prefs.state.jevModel
  return c.model.trim() || defaultLocalProviderConfig().model
}

/** After a rejected key (401/403): drop the key of the provider that rejected it. */
function dropKey(): void {
  if (config.value.kind === 'typesafe') secrets.setJevKey('')
  else secrets.setLocalApiKey('')
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text()
    return text.trim() === '' ? null : JSON.parse(text)
  } catch {
    return null
  }
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.probeTimeoutMs)
  try {
    return await env.fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function probeHeaders(apiKey: string): Record<string, string> {
  // content-type forces a real CORS preflight, exactly like the JSON POST to
  // /v1/systemone will, so a "direct" verdict holds for classification too.
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' }
  const key = apiKey.trim()
  if (key) headers.authorization = `Bearer ${key}`
  return headers
}

async function probeLocal(baseUrl: string, apiKey: string): Promise<ProviderProbeResult> {
  const headers = probeHeaders(apiKey)
  try {
    // Any HTTP answer (even a 404 from a server without /v1/models) proves CORS works.
    const response = await timedFetch(`${baseUrl}/v1/models`, { method: 'GET', mode: 'cors', headers })
    return { status: 'direct', models: response.ok ? parseModelNames(await readJson(response)) : null }
  } catch {
    // CORS refused, CSP blocked, or the server is down: try the proxy.
  }
  try {
    const response = await timedFetch(`${env.localProxyPrefix}/v1/models`, {
      method: 'GET',
      headers: { ...headers, [LOCAL_TARGET_HEADER]: baseUrl },
    })
    if (response.headers.get(LOCAL_PROXY_MARKER_HEADER) === 'upstream') {
      return { status: 'proxied', models: response.ok ? parseModelNames(await readJson(response)) : null }
    }
  } catch {
    // The proxy itself is absent (e.g. a hosted build).
  }
  return { status: 'unreachable', models: null }
}

async function probeTypeSafe(apiKey: string): Promise<ProviderProbeResult> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (apiKey.trim()) headers.authorization = `Bearer ${apiKey.trim()}`
  try {
    const response = await timedFetch(`${env.typesafeBaseUrl.replace(/\/+$/, '')}/v1/models`, { method: 'GET', headers })
    return { status: 'proxied', models: response.ok ? parseModelNames(await readJson(response)) : null }
  } catch {
    return { status: 'unreachable', models: null }
  }
}

function probeConfig(c: ProviderConfig): Promise<ProviderProbeResult> {
  const key = providerKey(c)
  const running = inflight.get(key)
  if (running) return running
  const apiKey = c.kind === 'typesafe' ? secrets.state.jevApiKey : secrets.state.localApiKey
  let task: Promise<ProviderProbeResult>
  if (c.kind === 'typesafe') {
    task = probeTypeSafe(apiKey)
  } else {
    const valid = validateLocalBaseUrl(c.baseUrl)
    task = valid.ok ? probeLocal(valid.url, apiKey) : Promise.resolve({ status: 'unreachable', models: null })
  }
  const done = task.then((result) => {
    routes[key] = result.status
    modelLists[key] = result.models
    inflight.delete(key)
    return result
  })
  inflight.set(key, done)
  return done
}

/** "Test connection": probes the current provider and caches the route. */
function probe(): Promise<ProviderProbeResult> {
  return probeConfig(config.value)
}

/** A transport that picks direct or proxied on first use, probing when no route is known. */
function localTransport(c: Extract<ProviderConfig, { kind: 'local' }>, getKey: () => string): JevTransport {
  const valid = validateLocalBaseUrl(c.baseUrl)
  const baseUrl = valid.ok ? valid.url : c.baseUrl
  const key = providerKey(c)
  const fetchLater: typeof fetch = (input, init) => env.fetch(input, init)
  const direct = createHttpJevTransport({ baseUrl, getApiKey: getKey, fetch: fetchLater, timeoutMs: env.localTimeoutMs })
  const proxied = createHttpJevTransport({
    baseUrl: env.localProxyPrefix,
    getApiKey: getKey,
    fetch: (input, init) =>
      env.fetch(input, {
        ...init,
        headers: { ...((init?.headers as Record<string, string>) ?? {}), [LOCAL_TARGET_HEADER]: baseUrl },
      }),
    timeoutMs: env.localTimeoutMs,
  })

  async function pick(): Promise<JevTransport> {
    let route = routes[key]
    if (route !== 'direct' && route !== 'proxied') route = (await probeConfig(c)).status
    if (route === 'direct') return direct
    if (route === 'proxied') return proxied
    throw new JevTransportError('network')
  }

  return {
    systemOne: async (body, signal) => (await pick()).systemOne(body, signal),
    listModels: async (signal) => (await pick()).listModels(signal),
  }
}

export interface CreateProviderClientOptions {
  getApiKey?: () => string
  model?: string
}

/** The Jev client for the current provider (read once, at call time). */
function createClient(options: CreateProviderClientOptions = {}): JevClient {
  const c = config.value
  const getKey = options.getApiKey ?? getApiKey
  const transport =
    c.kind === 'typesafe'
      ? createHttpJevTransport({
          baseUrl: env.typesafeBaseUrl,
          getApiKey: getKey,
          fetch: (input, init) => env.fetch(input, init),
        })
      : localTransport({ ...c }, getKey)
  return createJevClient({ transport, model: options.model ?? model() })
}

/** Test-only: forgets every routing decision. */
function __resetForTests(): void {
  for (const key of Object.keys(routes)) delete routes[key]
  for (const key of Object.keys(modelLists)) delete modelLists[key]
  inflight.clear()
}

export function useProvider() {
  return {
    config,
    isLocal,
    ready,
    status,
    models,
    probe,
    getApiKey,
    model,
    dropKey,
    createClient,
    __resetForTests,
  }
}
