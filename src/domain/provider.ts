// local-issue-classifier — which Jev-compatible server classifies (docs/local-providers.md).
// Pure: no Vue, no fetch, no storage. The TypeSafe cloud is the default; a
// local provider is any server answering TypeSafe's `/v1/systemone` shape
// (Kev, JevK5) on loopback or a private LAN address.
//
// A local server's optional key is a secret: it lives in useSecrets() only and
// is deliberately NOT part of ProviderConfig, so Preferences never carry it.
//
// A third kind, `browser` (docs/browser-inference.md), runs a small model in
// this page with transformers.js; it has no server, no URL and no key.

export type ProviderConfig =
  | { kind: 'typesafe' }
  | { kind: 'local'; baseUrl: string; model: string }
  | { kind: 'browser'; modelId: string }

export type LocalProviderConfig = Extract<ProviderConfig, { kind: 'local' }>
export type BrowserProviderConfig = Extract<ProviderConfig, { kind: 'browser' }>

/** A model the browser provider can download from the Hugging Face Hub. */
export interface BrowserModelPreset {
  /** Hugging Face repo id. */
  id: string
  label: string
  /** Bytes fetched on first load: the ONNX weights for that backend plus config and tokenizer files. */
  downloadBytes: { webgpu: number; wasm: number }
  /** A generic model standing in for Jev: its answers are placeholders, not classifications. */
  placeholder: boolean
}

// Sizes from the Hub's file listing (checked 2026-09-24): onnx/model_q4f16.onnx
// 569 789 750 B (WebGPU), onnx/model_q4.onnx 919 096 585 B (WASM), plus
// tokenizer.json 9 117 040 B, tokenizer_config.json 9 705 B, config.json 912 B,
// generation_config.json 219 B.
const QWEN3_SIDE_FILES = 9_117_040 + 9_705 + 912 + 219

export const BROWSER_MODELS: readonly BrowserModelPreset[] = [
  {
    id: 'onnx-community/Qwen3-0.6B-ONNX',
    label: 'Qwen3 0.6B',
    downloadBytes: { webgpu: 569_789_750 + QWEN3_SIDE_FILES, wasm: 919_096_585 + QWEN3_SIDE_FILES },
    placeholder: true,
  },
]

export function defaultBrowserProviderConfig(): BrowserProviderConfig {
  return { kind: 'browser', modelId: BROWSER_MODELS[0].id }
}

export function findBrowserModel(modelId: string): BrowserModelPreset | null {
  return BROWSER_MODELS.find((m) => m.id === modelId) ?? null
}

/** Browser-side path of the Vite proxy for local servers (server/jevProxy.ts, docs/deployment.md). */
export const JEV_LOCAL_PROXY_PREFIX = '/jev-local'
/** Request header naming the local server the `/jev-local` proxy forwards to. */
export const LOCAL_TARGET_HEADER = 'x-local-target'
/**
 * Response header set by the `/jev-local` proxy on every answer: `upstream`
 * (forwarded), `rejected` (bad target) or `unreachable` (server down). Its
 * absence means the proxy is not there (e.g. an SPA fallback answered).
 */
export const LOCAL_PROXY_MARKER_HEADER = 'x-jev-local-proxy'

/** How the browser reaches the provider: straight to it, or through the Vite proxy. */
export type ProviderRoute = 'direct' | 'proxied'
export type ProviderRouteStatus = 'unknown' | ProviderRoute | 'unreachable'

/** The outcome of a connection test (`GET {baseUrl}/v1/models`). */
export interface ProviderProbeResult {
  status: ProviderRoute | 'unreachable'
  /** Model names from `/v1/models`, or null when the server did not list any. */
  models: string[] | null
}

export interface LocalPreset {
  id: 'kev' | 'jevk5'
  label: string
  baseUrl: string
  model: string
  description: string
}

/** Defaults from each project's README (checked 2026-09-23). */
export const LOCAL_PRESETS: readonly LocalPreset[] = [
  {
    id: 'kev',
    label: 'Kev',
    baseUrl: 'http://localhost:8009',
    model: 'kev-latest',
    description: 'jaredpalmer/kev: python -m kev.serve, port 8009',
  },
  {
    id: 'jevk5',
    label: 'JevK5',
    baseUrl: 'http://localhost:8090',
    model: 'alibiserikbay/JevK5',
    description: 'allebee/jevk5: jevk5-serve, port 8090',
  },
]

export function defaultProviderConfig(): ProviderConfig {
  return { kind: 'typesafe' }
}

/** A local config seeded from the Kev preset. */
export function defaultLocalProviderConfig(): LocalProviderConfig {
  const kev = LOCAL_PRESETS[0]
  return { kind: 'local', baseUrl: kev.baseUrl, model: kev.model }
}

export type LocalBaseUrlRejection = 'empty' | 'scheme' | 'invalid' | 'credentials' | 'query' | 'host'

export type LocalBaseUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: LocalBaseUrlRejection; message: string }

const REJECTION_MESSAGES: Record<LocalBaseUrlRejection, string> = {
  empty: 'Enter the base URL of your local server, e.g. http://localhost:8009.',
  scheme: 'Start the URL with http:// or https://, e.g. http://localhost:8009.',
  invalid: 'This is not a valid URL.',
  credentials: 'Do not put a user name or password in the URL; use the key field instead.',
  query: 'Use a plain base URL, without ? or #.',
  host: 'Only localhost, 127.0.0.1, [::1] or a private LAN address (10.x, 172.16-31.x, 192.168.x) is allowed.',
}

function reject(reason: LocalBaseUrlRejection): LocalBaseUrlResult {
  return { ok: false, reason, message: REJECTION_MESSAGES[reason] }
}

function ipv4Octets(host: string): number[] | null {
  const parts = host.split('.')
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null
  const octets = parts.map(Number)
  return octets.every((o) => o <= 255) ? octets : null
}

/** Loopback (127/8, ::1, localhost) or a private LAN range (RFC 1918, IPv6 ULA fc00::/7). */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost') return true
  if (host.startsWith('[') && host.endsWith(']')) {
    const v6 = host.slice(1, -1)
    return v6 === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(v6)
  }
  const octets = ipv4Octets(host)
  if (!octets) return false
  const [a, b] = octets
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/**
 * Guards a local provider's base URL. Accepted URLs are normalized (lowercase
 * host, no trailing slash); anything that is not http(s) to loopback or a
 * private LAN address is refused with a typed reason.
 */
export function validateLocalBaseUrl(input: string): LocalBaseUrlResult {
  const raw = input.trim()
  if (raw === '') return reject('empty')
  if (!/^https?:\/\//i.test(raw)) return reject('scheme')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return reject('invalid')
  }
  if (url.hostname === '') return reject('invalid')
  if (url.username !== '' || url.password !== '') return reject('credentials')
  if (raw.includes('?') || raw.includes('#')) return reject('query')
  if (!isLocalHost(url.hostname)) return reject('host')
  const path = url.pathname.replace(/\/+$/, '')
  return { ok: true, url: `${url.protocol}//${url.host}${path}` }
}

/** A base URL for comparisons: normalized when valid, trimmed otherwise. */
function normalizedBaseUrl(baseUrl: string): string {
  const result = validateLocalBaseUrl(baseUrl)
  return result.ok ? result.url : baseUrl.trim().replace(/\/+$/, '')
}

export function findPreset(config: ProviderConfig): LocalPreset | null {
  if (config.kind !== 'local') return null
  const url = normalizedBaseUrl(config.baseUrl)
  return LOCAL_PRESETS.find((p) => p.baseUrl === url) ?? null
}

export function providerLabel(config: ProviderConfig): string {
  if (config.kind === 'typesafe') return 'TypeSafe cloud (Jev)'
  if (config.kind === 'browser') {
    return `In this browser (${findBrowserModel(config.modelId)?.label ?? config.modelId}, experimental)`
  }
  const url = normalizedBaseUrl(config.baseUrl)
  const preset = findPreset(config)
  return preset ? `${preset.label} (local, ${url})` : `Local server (${url})`
}

/** Routing-cache key: one decision per provider and normalized base URL. */
export function providerKey(config: ProviderConfig): string {
  if (config.kind === 'typesafe') return 'typesafe'
  if (config.kind === 'browser') return `browser:${config.modelId}`
  return `local:${normalizedBaseUrl(config.baseUrl)}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Tolerant loading of a stored value: unknown shapes fall back to TypeSafe, a
 * local config keeps only its base URL and model (never a key or extra field),
 * a browser config only its model id.
 * An invalid base URL is kept as typed; validateLocalBaseUrl reports it.
 */
export function sanitizeProviderConfig(value: unknown): ProviderConfig {
  if (isObject(value) && value.kind === 'browser') {
    const modelId = typeof value.modelId === 'string' ? value.modelId.trim() : ''
    return modelId === '' ? defaultBrowserProviderConfig() : { kind: 'browser', modelId }
  }
  if (!isObject(value) || value.kind !== 'local') return defaultProviderConfig()
  const seed = defaultLocalProviderConfig()
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl : seed.baseUrl
  const model = typeof value.model === 'string' && value.model.trim() !== '' ? value.model : seed.model
  return { kind: 'local', baseUrl, model }
}

/** Model names from `/v1/models`: TypeSafe's `{ models: [{ name }] }` or `{ data: [{ id }] }`. */
export function parseModelNames(body: unknown): string[] | null {
  if (!isObject(body)) return null
  const list = Array.isArray(body.models) ? body.models : Array.isArray(body.data) ? body.data : null
  if (!list) return null
  const names = list
    .map((m) => (isObject(m) ? (typeof m.name === 'string' ? m.name : typeof m.id === 'string' ? m.id : null) : null))
    .filter((n): n is string => n !== null && n !== '')
  return names.length > 0 ? names : null
}
