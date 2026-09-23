// local-issue-classifier — HTTP transport to a Jev-compatible `/v1/systemone` endpoint
// (SPEC.md §4.1). The single seam between the app and the Jev service: switching
// deployment modes (§9) or providers changes only `baseUrl`, never code above.
//
// - The browser never calls api.typesafe.ai directly (it rejects browser
//   origins); `baseUrl` points at a proxy, `/jev` by default.
// - One attempt per call. Retries, backoff and the pool live above (runner.ts);
//   this layer only reports status, body and the retry hint.
// - Framework-free: `fetch` and the clock are injected.
// - Nothing here logs. Results never contain the request or the key.
import type { JevState } from '../../domain/jevState'
import type { JevBatchState } from '../../domain/jevBatchState'
import type { JevQuestion } from './questions'

export const DEFAULT_JEV_BASE_URL = '/jev'
export const DEFAULT_JEV_TIMEOUT_MS = 20_000

export interface SystemOneRequestBody {
  model: string
  /** One issue (per-issue mode) or the composite state of a batch (docs/batching.md). */
  state: JevState | JevBatchState
  questions: Readonly<Record<string, JevQuestion>>
}

/** Parsed as-is; classification.ts validates the shape. */
export interface SystemOneResponseBody {
  model?: string
  answers: Record<string, unknown>
  usage?: { input_tokens?: number; output_tokens?: number }
}

export interface ModelsResponseBody {
  models: { name: string; description: string; release_date: string }[]
}

/** Error bodies are JSON with a field detail (422) or a message. */
export type JevErrorBody = Record<string, unknown>

/** Status + parsed JSON + retry hint; never contains the request or the key. */
export interface JevHttpResult<T> {
  status: number
  ok: boolean
  /** Parsed JSON, or null when the body is empty or not JSON. */
  body: T | JevErrorBody | null
  /** From `retry-after-ms` or `retry-after` (seconds or HTTP date). */
  retryAfterMs: number | null
}

export type JevTransportErrorKind = 'timeout' | 'aborted' | 'network'

/** No HTTP response: the attempt timed out, was cancelled, or the network failed. */
export class JevTransportError extends Error {
  readonly kind: JevTransportErrorKind

  constructor(kind: JevTransportErrorKind) {
    const messages: Record<JevTransportErrorKind, string> = {
      timeout: 'Jev request timed out',
      aborted: 'Jev request cancelled',
      network: 'Could not reach the Jev proxy',
    }
    super(messages[kind])
    this.name = 'JevTransportError'
    this.kind = kind
  }
}

export interface JevTransport {
  systemOne(
    body: SystemOneRequestBody,
    signal?: AbortSignal,
  ): Promise<JevHttpResult<SystemOneResponseBody>>
  listModels(signal?: AbortSignal): Promise<JevHttpResult<ModelsResponseBody>>
}

export interface HttpJevTransportOptions {
  /** Proxy base URL, e.g. '/jev' or an absolute function URL. Never api.typesafe.ai. */
  baseUrl: string
  /** Reads the in-memory key at call time. A blank key sends no Authorization header. */
  getApiKey: () => string
  fetch: typeof fetch
  /** Clock in epoch milliseconds, for HTTP-date `retry-after`. */
  now?: () => number
  /** Per attempt; default 20 000. */
  timeoutMs?: number
}

/** VITE_JEV_BASE_URL, trimmed, defaulting to '/jev'. */
export function resolveJevBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : DEFAULT_JEV_BASE_URL
}

/** Milliseconds to wait, from `retry-after-ms` (preferred) or `retry-after`. */
export function parseRetryAfter(headers: Headers, nowMs: number): number | null {
  const ms = headers.get('retry-after-ms')
  if (ms !== null && ms.trim() !== '') {
    const value = Number(ms)
    if (Number.isFinite(value) && value >= 0) return Math.ceil(value)
  }
  const after = headers.get('retry-after')
  if (after === null || after.trim() === '') return null
  const seconds = Number(after)
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.ceil(seconds * 1000) : null
  const date = Date.parse(after)
  return Number.isNaN(date) ? null : Math.max(0, date - nowMs)
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function createHttpJevTransport(options: HttpJevTransportOptions): JevTransport {
  // Detached from `options` so fetch is never called with a foreign `this`
  // (window.fetch throws "Illegal invocation" otherwise).
  const doFetch = options.fetch
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? DEFAULT_JEV_TIMEOUT_MS
  const root = options.baseUrl.replace(/\/+$/, '')

  async function send<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string },
    signal?: AbortSignal,
  ): Promise<JevHttpResult<T>> {
    if (signal?.aborted) throw new JevTransportError('aborted')

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    const headers: Record<string, string> = { accept: 'application/json' }
    const key = options.getApiKey().trim()
    if (key) headers.authorization = `Bearer ${key}`
    if (init.body !== undefined) headers['content-type'] = 'application/json'

    try {
      const response = await doFetch(`${root}${path}`, {
        method: init.method,
        headers,
        body: init.body,
        signal: controller.signal,
      })
      const body = (await readJson(response)) as T | JevErrorBody | null
      return {
        status: response.status,
        ok: response.ok,
        body,
        retryAfterMs: parseRetryAfter(response.headers, now()),
      }
    } catch {
      // The original error may carry request details; it is deliberately dropped.
      if (timedOut) throw new JevTransportError('timeout')
      if (signal?.aborted) throw new JevTransportError('aborted')
      throw new JevTransportError('network')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  return {
    systemOne: (body, signal) =>
      send<SystemOneResponseBody>('/v1/systemone', { method: 'POST', body: JSON.stringify(body) }, signal),
    listModels: (signal) => send<ModelsResponseBody>('/v1/models', { method: 'GET' }, signal),
  }
}
