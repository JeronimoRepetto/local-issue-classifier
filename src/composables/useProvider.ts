// Which server classifies (docs/local-providers.md): a module singleton that
// builds the Jev client for Preferences.provider.
//
// - TypeSafe: the unchanged `/jev` proxy path with useSecrets().state.jevApiKey.
// - Local (Kev, JevK5): a direct browser call to `baseUrl` when a one-time
//   CORS check (`GET {baseUrl}/v1/models`, mode 'cors') succeeds, otherwise the
//   `/jev-local` Vite proxy with the target in `x-local-target`. The decision
//   is cached in memory per base URL; an unreachable result is not cached, so
//   the next call probes again.
// - Browser (docs/browser-inference.md): no server. The model is downloaded
//   once on request (downloadBrowserModel), cached by the browser, and answers
//   in-process through createBrowserJevTransport; `ready` means loaded.
// The optional local key lives in useSecrets().state.localApiKey, never in
// Preferences. Nothing here logs.
import { computed, reactive } from 'vue'
import {
  JEV_LOCAL_PROXY_PREFIX,
  LOCAL_PRESETS,
  LOCAL_PROXY_MARKER_HEADER,
  LOCAL_TARGET_HEADER,
  BROWSER_MODELS,
  configForCandidateId,
  defaultBrowserProviderConfig,
  defaultLocalProviderConfig,
  defaultProviderConfig,
  deviceLabel,
  parseFirstModelDevice,
  parseModelNames,
  providerKey,
  providerLabel,
  validateLocalBaseUrl,
} from '../domain/provider'
import type { BrowserProviderConfig, ProviderConfig, ProviderProbeResult, ProviderRouteStatus } from '../domain/provider'
import { createJevClient } from '../adapters/jev/client'
import type { JevClient } from '../adapters/jev/client'
import { JevTransportError, createHttpJevTransport, resolveJevBaseUrl } from '../adapters/jev/transport'
import type { JevTransport } from '../adapters/jev/transport'
import { createBrowserJevTransport } from '../adapters/browser/browserJevTransport'
import { loadBrowserModel } from '../adapters/browser/browserModel'
import type { BrowserBackend, LoadedBrowserModel, LoadBrowserModelOptions } from '../adapters/browser/browserModel'
import { cachedModelBytes, removeCachedModel } from '../adapters/browser/modelCache'
import { detectBrowserSupport } from '../adapters/browser/webgpu'
import type { BrowserSupport } from '../adapters/browser/webgpu'
import { usePreferences } from './usePreferences'
import { useSecrets } from './useSecrets'

/** A 4B model on a consumer GPU can take far longer than the cloud's 20 s per call. */
export const LOCAL_TIMEOUT_MS = 180_000
/** The connection check must answer quickly or count as failed. */
export const PROBE_TIMEOUT_MS = 5_000
/** Returning to Home re-probes a local server only when its last check is at least this old. */
export const REPROBE_AFTER_MS = 30_000

/** The in-browser runtime: real transformers.js and Cache API by default, fakes in tests. */
export interface BrowserRuntime {
  detectSupport: () => Promise<BrowserSupport>
  loadModel: (options: Pick<LoadBrowserModelOptions, 'modelId' | 'backend' | 'onProgress'>) => Promise<LoadedBrowserModel>
  /** null when the Cache API is unavailable. */
  cachedBytes: (modelId: string) => Promise<number | null>
  removeCached: (modelId: string) => Promise<number>
}

export type BrowserModelPhase = 'idle' | 'downloading' | 'ready' | 'unsupported' | 'error'

export interface BrowserModelStatus {
  phase: BrowserModelPhase
  /** 0..1 over the files seen so far while downloading; null otherwise. */
  progress: number | null
  /** What this browser offers; null until checked. */
  support: BrowserSupport | null
  /** The backend the loaded model runs on. */
  device: BrowserBackend | null
  /** Bytes of the configured model in the browser cache; null when unknown. */
  cachedBytes: number | null
  error: string | null
}

export interface ProviderEnvironment {
  browser: BrowserRuntime
  fetch: typeof fetch
  /** The TypeSafe proxy path, VITE_JEV_BASE_URL (default '/jev'). */
  typesafeBaseUrl: string
  localProxyPrefix: string
  localTimeoutMs: number
  probeTimeoutMs: number
  /** Wall clock in ms, for autoProbe's staleness rule. */
  now: () => number
}

let env: ProviderEnvironment = {
  browser: {
    detectSupport: () => detectBrowserSupport(),
    loadModel: (options) => loadBrowserModel(options),
    cachedBytes: (modelId) => cachedModelBytes(modelId),
    removeCached: (modelId) => removeCachedModel(modelId),
  },
  fetch: (input, init) => globalThis.fetch(input, init),
  typesafeBaseUrl: resolveJevBaseUrl(import.meta.env.VITE_JEV_BASE_URL),
  localProxyPrefix: JEV_LOCAL_PROXY_PREFIX,
  localTimeoutMs: LOCAL_TIMEOUT_MS,
  probeTimeoutMs: PROBE_TIMEOUT_MS,
  now: () => Date.now(),
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
/** The first model's device, when a probed server's /v1/models includes one. */
const modelDevices = reactive<Record<string, string | null>>({})
const inflight = new Map<string, Promise<ProviderProbeResult>>()
/** When each key's last probe finished (env.now()), for autoProbe's session cache. */
const probedAt = new Map<string, number>()
/** Keys with a probe in flight, so the UI can say it is still looking. */
const probing = reactive<Record<string, boolean>>({})

/** probeLocal's internal result: the same shape ProviderProbeResult exposes, plus the device. */
type LocalProbeResult = ProviderProbeResult & { device: string | null }

const config = computed<ProviderConfig>(() => prefs.state.provider ?? defaultProviderConfig())
const isLocal = computed(() => config.value.kind === 'local')
const isBrowser = computed(() => config.value.kind === 'browser')

// ── Browser model (in memory; the weights themselves live in the Cache API) ──
const browserStatus = reactive<BrowserModelStatus>({
  phase: 'idle',
  progress: null,
  support: null,
  device: null,
  cachedBytes: null,
  error: null,
})
/** The loaded model, by repo id; at most one is kept. */
let browserModel: { modelId: string; model: LoadedBrowserModel } | null = null
let browserLoading: Promise<void> | null = null
const browserModelId = () => (config.value.kind === 'browser' ? config.value.modelId : null)
/** The model whose cached files Settings measures: the configured one, else the default. */
const cacheModelId = () => browserModelId() ?? BROWSER_MODELS[0].id
const status = computed<ProviderRouteStatus>(() => routes[providerKey(config.value)] ?? 'unknown')
const models = computed<string[] | null>(() => modelLists[providerKey(config.value)] ?? null)

/** TypeSafe needs a Jev key; a local server needs a valid base URL (its key is optional). */
/** A browser provider is ready once its model is loaded in this page. */
const ready = computed(() => {
  const c = config.value
  if (c.kind === 'typesafe') return secrets.hasJevKey.value
  if (c.kind === 'browser') return browserStatus.phase === 'ready' && browserStatus.device !== null
  return validateLocalBaseUrl(c.baseUrl).ok
})

function getApiKey(): string {
  const c = config.value
  if (c.kind === 'browser') return ''
  return c.kind === 'typesafe' ? secrets.state.jevApiKey : secrets.state.localApiKey
}

/** The model sent with every request: Preferences.jevModel, or the local config's model. */
function model(): string {
  const c = config.value
  if (c.kind === 'typesafe') return prefs.state.jevModel
  if (c.kind === 'browser') return c.modelId
  return c.model.trim() || defaultLocalProviderConfig().model
}

/** After a rejected key (401/403): drop the key of the provider that rejected it. */
function dropKey(): void {
  const kind = config.value.kind
  if (kind === 'typesafe') secrets.setJevKey('')
  else if (kind === 'local') secrets.setLocalApiKey('')
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

async function probeLocal(baseUrl: string, apiKey: string): Promise<LocalProbeResult> {
  const headers = probeHeaders(apiKey)
  try {
    // Any HTTP answer (even a 404 from a server without /v1/models) proves CORS works.
    const response = await timedFetch(`${baseUrl}/v1/models`, { method: 'GET', mode: 'cors', headers })
    const parsed = response.ok ? await readJson(response) : null
    return { status: 'direct', models: parseModelNames(parsed), device: parseFirstModelDevice(parsed) }
  } catch {
    // CORS refused, CSP blocked, or the server is down: try the proxy.
  }
  try {
    const response = await timedFetch(`${env.localProxyPrefix}/v1/models`, {
      method: 'GET',
      headers: { ...headers, [LOCAL_TARGET_HEADER]: baseUrl },
    })
    if (response.headers.get(LOCAL_PROXY_MARKER_HEADER) === 'upstream') {
      const parsed = response.ok ? await readJson(response) : null
      return { status: 'proxied', models: parseModelNames(parsed), device: parseFirstModelDevice(parsed) }
    }
  } catch {
    // The proxy itself is absent (e.g. a hosted build).
  }
  return { status: 'unreachable', models: null, device: null }
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
  // A browser model has no server to test; its state is browserStatus.
  if (c.kind === 'browser') return Promise.resolve({ status: 'unreachable', models: null })
  const key = providerKey(c)
  const running = inflight.get(key)
  if (running) return running
  const apiKey = c.kind === 'typesafe' ? secrets.state.jevApiKey : secrets.state.localApiKey
  let task: Promise<LocalProbeResult>
  if (c.kind === 'typesafe') {
    task = probeTypeSafe(apiKey).then((result) => ({ ...result, device: null }))
  } else {
    const valid = validateLocalBaseUrl(c.baseUrl)
    task = valid.ok ? probeLocal(valid.url, apiKey) : Promise.resolve({ status: 'unreachable', models: null, device: null })
  }
  probing[key] = true
  const done = task.then((result): ProviderProbeResult => {
    routes[key] = result.status
    modelLists[key] = result.models
    modelDevices[key] = result.device
    probedAt.set(key, env.now())
    delete probing[key]
    inflight.delete(key)
    // The device is an internal extra for the switcher's label (candidates
    // below); probe()'s public result stays exactly { status, models }.
    return { status: result.status, models: result.models }
  })
  inflight.set(key, done)
  return done
}

/** "Test connection": probes the current provider and caches the route. Always runs: it is the manual retry. */
function probe(): Promise<ProviderProbeResult> {
  return probeConfig(config.value)
}

export interface AutoProbeOptions {
  /** Also probe the Kev/JevK5 presets; default true (false on a hosted page). */
  presets?: boolean
  /** Re-probe a key whose last check is at least this old; without it, a checked key is never re-probed. */
  staleAfterMs?: number
}

/**
 * Passive, cached connection checks (docs/local-providers.md "Connection
 * status"): the configured local base URL (when the provider is local) and
 * the local presets. A key is probed when it was never checked this session,
 * or when `staleAfterMs` says its last check is old; a probe already in
 * flight is shared. Called on app load, when a local provider is selected and
 * when Home is shown again — never on a timer.
 */
function autoProbe(options: AutoProbeOptions = {}): Promise<void> {
  const targets = new Map<string, ProviderConfig>()
  const c = config.value
  if (c.kind === 'local') targets.set(providerKey(c), c)
  if (options.presets ?? true) {
    for (const preset of LOCAL_PRESETS) {
      const presetConfig: ProviderConfig = { kind: 'local', baseUrl: preset.baseUrl, model: preset.model }
      targets.set(providerKey(presetConfig), presetConfig)
    }
  }
  const tasks: Promise<unknown>[] = []
  for (const [key, target] of targets) {
    const running = inflight.get(key)
    if (running) {
      tasks.push(running)
      continue
    }
    const last = probedAt.get(key)
    const stale = last === undefined || (options.staleAfterMs !== undefined && env.now() - last >= options.staleAfterMs)
    if (stale) tasks.push(probeConfig(target))
  }
  return Promise.all(tasks).then(() => undefined)
}

/** The configured local server's live status, as the Home card and Settings show it. */
export interface LocalLiveStatus {
  phase: 'checking' | 'connected' | 'unreachable'
  text: string
}

const localStatus = computed<LocalLiveStatus>(() => {
  const c = config.value
  if (c.kind !== 'local') return { phase: 'checking', text: '' }
  const key = providerKey(c)
  const route = routes[key]
  if (probing[key] || route === undefined || route === 'unknown') {
    return { phase: 'checking', text: 'Looking for a local server…' }
  }
  if (route === 'unreachable') {
    const port = portOf(c.baseUrl)
    return { phase: 'unreachable', text: port ? `Not reachable on :${port}` : 'Not reachable' }
  }
  return { phase: 'connected', text: 'Connected' }
})

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

// ── Browser model lifecycle ─────────────────────────────────────────
async function checkBrowserSupport(): Promise<BrowserSupport> {
  if (browserStatus.support === null) browserStatus.support = await env.browser.detectSupport()
  if (browserStatus.support === 'none') browserStatus.phase = 'unsupported'
  return browserStatus.support
}

/** Re-reads how much of the configured model the browser has cached. */
async function refreshBrowserCache(): Promise<void> {
  const modelId = cacheModelId()
  try {
    browserStatus.cachedBytes = await env.browser.cachedBytes(modelId)
  } catch {
    browserStatus.cachedBytes = null
  }
}

function progressOf(files: Map<string, { loaded: number; total: number }>): number | null {
  let loaded = 0
  let total = 0
  for (const file of files.values()) {
    loaded += file.loaded
    total += file.total
  }
  return total > 0 ? loaded / total : null
}

/** Downloads (or reads from the cache) and loads the configured model. One load at a time. */
function downloadBrowserModel(): Promise<void> {
  if (browserLoading) return browserLoading
  browserLoading = (async () => {
    const modelId = browserModelId()
    if (!modelId) return
    const support = await checkBrowserSupport()
    if (support === 'none') return
    if (browserModel?.modelId === modelId) {
      browserStatus.phase = 'ready'
      return
    }
    const files = new Map<string, { loaded: number; total: number }>()
    browserStatus.phase = 'downloading'
    browserStatus.progress = 0
    browserStatus.error = null
    try {
      const model = await env.browser.loadModel({
        modelId,
        backend: support,
        onProgress: ({ file, loaded, total }) => {
          files.set(file, { loaded, total })
          browserStatus.progress = progressOf(files)
        },
      })
      await browserModel?.model.dispose()
      browserModel = { modelId, model }
      browserStatus.device = model.device
      browserStatus.phase = 'ready'
    } catch (error) {
      browserStatus.device = null
      browserStatus.phase = 'error'
      browserStatus.error = error instanceof Error && error.message ? error.message : 'The model could not be loaded.'
    } finally {
      browserStatus.progress = null
      await refreshBrowserCache()
    }
  })().finally(() => {
    browserLoading = null
  })
  return browserLoading
}

/** "Remove downloaded model": unloads it and deletes its files from the browser cache. */
async function removeBrowserModel(): Promise<void> {
  const modelId = cacheModelId()
  if (browserModel?.modelId === modelId) {
    await browserModel.model.dispose()
    browserModel = null
  }
  await env.browser.removeCached(modelId)
  browserStatus.device = null
  browserStatus.phase = browserStatus.support === 'none' ? 'unsupported' : 'idle'
  await refreshBrowserCache()
}

function browserTransport(c: BrowserProviderConfig): JevTransport {
  return createBrowserJevTransport({
    getModel: async () => {
      if (browserModel?.modelId !== c.modelId) throw new Error('The browser model is not loaded')
      return browserModel.model
    },
  })
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
      : c.kind === 'browser'
        ? browserTransport({ ...c })
        : localTransport({ ...c }, getKey)
  return createJevClient({ transport, model: options.model ?? model() })
}

/** Test-only: forgets every routing decision. */
function __resetForTests(): void {
  for (const key of Object.keys(routes)) delete routes[key]
  for (const key of Object.keys(modelLists)) delete modelLists[key]
  for (const key of Object.keys(modelDevices)) delete modelDevices[key]
  for (const key of Object.keys(probing)) delete probing[key]
  inflight.clear()
  probedAt.clear()
  browserModel = null
  browserLoading = null
  Object.assign(browserStatus, { phase: 'idle', progress: null, support: null, device: null, cachedBytes: null, error: null })
}

// ── Provider switcher (classification screen) ─────────────────────────
/** One option of the switcher; `reason` doubles as its disabled tooltip. */
export interface ProviderCandidate {
  id: string
  label: string
  kind: ProviderConfig['kind']
  available: boolean
  reason?: string
  detail?: string
}

/** A local preset's port, for the "not reachable" reason; '' if the URL is somehow malformed. */
function portOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).port
  } catch {
    return ''
  }
}

function localCandidate(preset: (typeof LOCAL_PRESETS)[number]): ProviderCandidate {
  const config: ProviderConfig = { kind: 'local', baseUrl: preset.baseUrl, model: preset.model }
  const key = providerKey(config)
  const routeStatus = routes[key] ?? 'unknown'
  const available = routeStatus === 'direct' || routeStatus === 'proxied'
  const modelName = modelLists[key]?.[0] ?? preset.model
  const device = deviceLabel(modelDevices[key] ?? null)
  return {
    id: `local:${preset.id}`,
    label: available ? `${preset.label} · ${modelName}${device ? ` · ${device}` : ''}` : preset.label,
    kind: 'local',
    available,
    reason: available ? undefined : `Server not reachable on :${portOf(preset.baseUrl)}`,
    detail: preset.baseUrl,
  }
}

/** Why the browser candidate is (not) available yet; gated on WebGPU alone (docs/browser-inference.md). */
function browserReason(): string | undefined {
  if (browserStatus.support === 'webgpu') return undefined
  if (browserStatus.support === null) return 'Checking browser support…'
  return 'WebGPU is not available in this browser.'
}

/**
 * Candidates for the classification-screen switcher: TypeSafe cloud, one per
 * local preset (probed by probeAll) and the in-browser model. Selecting one
 * (selectProvider) writes the same Preferences.provider the Settings selector
 * edits, so both stay in sync.
 */
const candidates = computed<ProviderCandidate[]>(() => [
  {
    id: 'typesafe',
    label: 'Jev (TypeSafe cloud)',
    kind: 'typesafe',
    available: secrets.hasJevKey.value,
    reason: secrets.hasJevKey.value ? undefined : 'Add a Jev key in Settings.',
  },
  ...LOCAL_PRESETS.map(localCandidate),
  {
    id: 'browser',
    label: providerLabel(defaultBrowserProviderConfig()),
    kind: 'browser',
    available: browserStatus.support === 'webgpu',
    reason: browserReason(),
  },
])

/**
 * Probes every local preset not yet known this session, and checks WebGPU
 * support once — both passive (no benchmark), both cached: called once on
 * mount of the analysis view, never polled.
 */
function probeAll(): Promise<void> {
  const tasks: Promise<unknown>[] = [checkBrowserSupport()]
  for (const preset of LOCAL_PRESETS) {
    const config: ProviderConfig = { kind: 'local', baseUrl: preset.baseUrl, model: preset.model }
    if (routes[providerKey(config)] === undefined) tasks.push(probeConfig(config))
  }
  return Promise.all(tasks).then(() => undefined)
}

/** Replaces Preferences.provider with the candidate's config; unknown ids are ignored. */
function selectProvider(id: string): void {
  const config = configForCandidateId(id)
  if (config) prefs.update({ provider: config })
}

export function useProvider() {
  return {
    config,
    isLocal,
    isBrowser,
    ready,
    status,
    models,
    probe,
    autoProbe,
    localStatus,
    getApiKey,
    model,
    dropKey,
    createClient,
    browserStatus,
    checkBrowserSupport,
    downloadBrowserModel,
    removeBrowserModel,
    refreshBrowserCache,
    candidates,
    probeAll,
    selectProvider,
    __resetForTests,
  }
}
