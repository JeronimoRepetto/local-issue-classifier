// local-issue-classifier — local Jev proxy for `pnpm dev` and `pnpm preview`
// (SPEC.md §4.1, §8 "Proxy hardening", §9 mode a). Node-only; imported by
// vite.config.ts alone.
//
// The Jev API rejects browser origins, so the browser calls `/jev/v1/...` on
// the Vite server, which forwards it upstream as a server-to-server call:
// - allowlist: only `/v1/systemone` and `/v1/models`; anything else under the
//   prefix gets a 404 and never reaches upstream;
// - `origin`, `referer` and `cookie` are stripped; `authorization` and the JSON
//   body are forwarded unchanged, in transit only;
// - nothing here logs or stores headers or bodies.
//
// `/jev-local` (T16, docs/local-providers.md) forwards the same two paths to a
// local Jev-compatible server (Kev, JevK5) named per request in
// `x-local-target`, for servers that send no CORS headers. The target must be
// loopback or a private LAN address (validateLocalBaseUrl); anything else is
// refused before any connection is made. This proxy exists only in the local
// Vite server: a hosted build would not offer local providers.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, ProxyOptions } from 'vite'
import {
  JEV_LOCAL_PROXY_PREFIX,
  LOCAL_PROXY_MARKER_HEADER,
  LOCAL_TARGET_HEADER,
  validateLocalBaseUrl,
} from '../src/domain/provider'

export { JEV_LOCAL_PROXY_PREFIX, LOCAL_PROXY_MARKER_HEADER, LOCAL_TARGET_HEADER }

export const JEV_UPSTREAM_DEFAULT = 'https://api.typesafe.ai'
export const JEV_PROXY_PREFIX_DEFAULT = '/jev'
export const STRIPPED_REQUEST_HEADERS = ['origin', 'referer', 'cookie'] as const

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Vite proxy key: a regex (leading `^`) matching only the two allowed paths. */
export function jevProxyKey(prefix: string = JEV_PROXY_PREFIX_DEFAULT): string {
  return `^${escapeRegExp(prefix)}/v1/(systemone|models)$`
}

/**
 * The local proxy prefix. A path VITE_JEV_BASE_URL (e.g. '/jev') is used as-is;
 * an absolute URL means another host proxies, so the local proxy keeps '/jev'.
 */
export function jevProxyPrefix(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim().replace(/\/+$/, '')
  return trimmed && trimmed.startsWith('/') ? trimmed : JEV_PROXY_PREFIX_DEFAULT
}

export interface JevProxyConfig {
  /** Upstream origin; default https://api.typesafe.ai. */
  target?: string
  /** Path prefix the browser uses; default '/jev'. */
  prefix?: string
}

/** Options for both `server.proxy` and `preview.proxy`. */
export function createJevProxy(config: JevProxyConfig = {}): Record<string, ProxyOptions> {
  const prefix = config.prefix ?? JEV_PROXY_PREFIX_DEFAULT
  const prefixRe = new RegExp(`^${escapeRegExp(prefix)}`)
  return {
    [jevProxyKey(prefix)]: {
      target: config.target ?? JEV_UPSTREAM_DEFAULT,
      changeOrigin: true,
      rewrite: (path) => path.replace(prefixRe, ''),
      configure: (proxy) => {
        // Silent on purpose: no header, body or URL is ever logged here.
        proxy.on('proxyReq', (proxyReq) => {
          for (const header of STRIPPED_REQUEST_HEADERS) proxyReq.removeHeader(header)
        })
      },
    },
  }
}

/**
 * Answers 404 for any path under the prefix that is not allowlisted, so it
 * neither reaches upstream nor falls through to the SPA fallback.
 */
export function jevProxyGuard(config: Pick<JevProxyConfig, 'prefix'> = {}): Plugin {
  const prefix = config.prefix ?? JEV_PROXY_PREFIX_DEFAULT
  const allowed = new RegExp(jevProxyKey(prefix))
  const guard: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ''
    const underPrefix =
      url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`)
    if (!underPrefix || allowed.test(url)) return next()
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'Not found' }))
  }
  return {
    name: 'local-issue-classifier:jev-proxy-guard',
    configureServer: (server) => {
      server.middlewares.use(guard)
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(guard)
    },
  }
}

// ── /jev-local: a local Jev-compatible server named per request ─────────────

/** Only these request headers reach the local server (so origin, referer, cookie and the target never do). */
export const LOCAL_FORWARDED_REQUEST_HEADERS = ['authorization', 'content-type', 'accept'] as const
/** Only these response headers come back, plus the marker. */
export const LOCAL_FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after', 'retry-after-ms'] as const
/** A batched request carries a large state, but never this much. */
export const LOCAL_MAX_BODY_BYTES = 32 * 1024 * 1024

export interface JevLocalProxyConfig {
  prefix?: string
  /** Injected for tests; defaults to Node's global fetch. */
  fetch?: typeof fetch
}

type Marker = 'upstream' | 'rejected' | 'unreachable'

function sendJson(res: ServerResponse, status: number, marker: Marker, body: Record<string, string>): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader(LOCAL_PROXY_MARKER_HEADER, marker)
  res.end(JSON.stringify(body))
}

/** A present `origin` must be this server's own host: other sites never get to use the proxy. */
function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true
  try {
    return host !== undefined && new URL(origin).host === host
  } catch {
    return false
  }
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > LOCAL_MAX_BODY_BYTES) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function jevLocalProxyHandler(config: JevLocalProxyConfig = {}): Connect.NextHandleFunction {
  const prefix = config.prefix ?? JEV_LOCAL_PROXY_PREFIX
  const allowed = new RegExp(jevProxyKey(prefix))
  const doFetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init))

  return (req, res, next) => {
    const url = req.url ?? ''
    const underPrefix = url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`)
    if (!underPrefix) return next()
    const match = allowed.exec(url)
    if (!match) return sendJson(res, 404, 'rejected', { error: 'Not found' })
    if (!sameOrigin(req.headers.origin, req.headers.host)) {
      return sendJson(res, 403, 'rejected', { error: 'Cross-origin request refused' })
    }
    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'POST') return sendJson(res, 405, 'rejected', { error: 'Method not allowed' })
    const raw = req.headers[LOCAL_TARGET_HEADER]
    const target = typeof raw === 'string' ? validateLocalBaseUrl(raw) : null
    if (!target || !target.ok) {
      return sendJson(res, 400, 'rejected', {
        error: `${LOCAL_TARGET_HEADER} must be a loopback or private LAN base URL`,
      })
    }

    void (async () => {
      const body = method === 'POST' ? await readBody(req) : undefined
      if (body === null) return sendJson(res, 413, 'rejected', { error: 'Request too large' })

      const headers: Record<string, string> = {}
      for (const name of LOCAL_FORWARDED_REQUEST_HEADERS) {
        const value = req.headers[name]
        if (typeof value === 'string') headers[name] = value
      }
      // Cancelled by the browser (timeout, Cancel): stop the local request too.
      const controller = new AbortController()
      res.on('close', () => {
        if (!res.writableEnded) controller.abort()
      })

      let upstream: Response
      try {
        upstream = await doFetch(`${target.url}/v1/${match[1]}`, {
          method,
          headers,
          body: body && body.length > 0 ? new Uint8Array(body) : undefined,
          signal: controller.signal,
          // A redirect could point anywhere; it is returned, never followed.
          redirect: 'manual',
        })
      } catch {
        if (!controller.signal.aborted) sendJson(res, 502, 'unreachable', { error: 'Local server unreachable' })
        return
      }
      const payload = Buffer.from(await upstream.arrayBuffer())
      res.statusCode = upstream.status
      for (const name of LOCAL_FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name)
        if (value !== null) res.setHeader(name, value)
      }
      res.setHeader(LOCAL_PROXY_MARKER_HEADER, 'upstream')
      res.end(payload)
    })().catch(() => {
      // Silent on purpose. The response may already be gone.
      if (!res.headersSent) sendJson(res, 502, 'unreachable', { error: 'Local server unreachable' })
    })
  }
}

/** Registers `/jev-local` for both `pnpm dev` and `pnpm preview`. */
export function jevLocalProxy(config: JevLocalProxyConfig = {}): Plugin {
  const handler = jevLocalProxyHandler(config)
  return {
    name: 'local-issue-classifier:jev-local-proxy',
    configureServer: (server) => {
      server.middlewares.use(handler)
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(handler)
    },
  }
}
