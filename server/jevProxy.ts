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
import type { Connect, Plugin, ProxyOptions } from 'vite'

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
