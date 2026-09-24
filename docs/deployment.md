# Deployment modes

local-issue-classifier v1 runs **only locally**, with `pnpm dev` or `pnpm preview` on `http://localhost:5200`.
GitHub is called directly from the browser. Jev is always reached through a proxy, because the Jev
API rejects browser origins. Switching modes changes configuration only; no code changes.

**Invariant for every mode: no server ever stores a key or a token.** Keys live in the browser
tab's memory. A proxy only forwards the `Authorization` header while the request is in flight, and
never logs, caches or persists it.

## Quick path (v1, local)

1. `pnpm install`
2. `pnpm dev` (or `pnpm build && pnpm preview`)
3. Open `http://localhost:5200` and paste your Jev key in Settings.

The browser calls `/jev/v1/systemone`; the Vite server forwards it to
`https://api.typesafe.ai/v1/systemone`.

## Modes

| Mode | Status | Where Jev calls go | `VITE_JEV_BASE_URL` |
|------|--------|--------------------|---------------------|
| (a) Local, Vite proxy | **implemented (v1)** | `localhost:5200/jev/...` → `api.typesafe.ai` | `/jev` (default) |
| (b) Hosted, same-origin function | reference implementation, not deployed | `/jev/**` served by a Cloudflare Pages Function | `/jev` |
| (b') Hosted, function on another origin | future, not implemented | the function's absolute URL | e.g. `https://fn.example.com/jev` |

### (a) Local proxy: what it does

Built by `server/jevProxy.ts` and registered in `vite.config.ts` for both `server.proxy` and
`preview.proxy`. Every request first goes through the shared policy in `server/jevProxyPolicy.ts`,
the same one the hosted function uses (see [security.md](security.md#the-proxy-trust-boundary)):

| Rule | Behaviour |
|------|-----------|
| Allowlist | Only `POST /jev/v1/systemone` and `GET /jev/v1/models` are forwarded. Any other path under `/jev` gets a 404, a wrong method a 405, and neither reaches upstream. |
| Callers | Same-origin only: `Sec-Fetch-Site: same-origin`, or an `Origin`/`Referer` of `http://localhost:5200`, `http://127.0.0.1:5200` or `http://[::1]:5200`. Anything else gets a 403. |
| Limits | Bodies up to 2 MB (413 above). 300 requests per minute and 3 000 per hour per client IP (429 with `Retry-After`). |
| Rewrite | `/jev` is stripped, so `/jev/v1/models` becomes `/v1/models` upstream. |
| Headers | Only `authorization`, `content-type` and `accept` are forwarded, plus the transport headers of the hop. `origin`, `referer`, `cookie` and everything else are removed, so upstream sees a server-to-server call. The JSON body is forwarded unchanged. |
| Answers | `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Upstream `Set-Cookie` is dropped. No CORS headers. |
| Logging | The proxy code logs nothing. Vite itself prints a one-line `http proxy error` with the path (never headers or bodies) if the upstream cannot be reached. |
| Binding | Vite binds to `localhost` only. Do not set `host: true`: other machines on the LAN must not use the proxy. |

### (a') Local proxy for local providers: `/jev-local`

For a local Jev-compatible server (Kev, JevK5; see [local-providers.md](local-providers.md)) that
sends no CORS headers, `jevLocalProxy()` in `server/jevProxy.ts` adds a second path. Unlike `/jev`,
its upstream is not fixed: each request names the server in the `x-local-target` header.

| Rule | Behaviour |
|------|-----------|
| Target | `x-local-target` must pass `validateLocalBaseUrl` (`src/domain/provider.ts`): `http`/`https` to `localhost`, `127.x`, `[::1]` or a private LAN range. Anything else, or a missing header, gets a 400 before any connection is made. |
| Allowlist | Only `/jev-local/v1/systemone` and `/jev-local/v1/models`. Other paths get a 404. Only `GET` and `POST` are accepted. |
| Callers | A request whose `origin` is not the Vite server itself gets a 403, so other websites open in the browser cannot use the proxy to reach your LAN. |
| Headers | Only `authorization`, `content-type` and `accept` are forwarded, so `origin`, `referer`, `cookie` and `x-local-target` never reach the server. Only `content-type`, `retry-after` and `retry-after-ms` come back. |
| Redirects | Returned to the browser, never followed. |
| Marker | Every answer carries `x-jev-local-proxy`: `upstream` (forwarded), `rejected` (400/403/404/405/413) or `unreachable` (502, the server is down). The app's connection test uses it to tell the proxy apart from an SPA fallback page. |
| Logging | None. |

This proxy exists **only in the local Vite server** (`pnpm dev`, `pnpm preview`). A hosted build
(modes b and b') would not offer local providers: a public relay into private networks is exactly
what the target check forbids.

### (b) Hosted: the Cloudflare Pages Function

`functions/jev/[[path]].ts` is a reference implementation for Cloudflare Pages. **This repository
does not deploy it.** Pages routes every path under `/jev/` to it, so the site keeps
`VITE_JEV_BASE_URL=/jev` and stays same-origin. `functions/` is not part of the Vite build: `dist/`
never contains it.

It applies the same policy as the local proxy (`server/jevProxyPolicy.ts`):

| Rule | Hosted behaviour |
|------|------------------|
| Allowlist | `POST /jev/v1/systemone`, `GET /jev/v1/models`. Otherwise 404 or 405. `OPTIONS` gets a 204 with no CORS headers. |
| Same-origin | `Sec-Fetch-Site: same-origin`, or an `Origin`/`Referer` listed in `ALLOWED_ORIGINS`. Otherwise 403, so `issueclassifier.com/jev` is not a public relay. |
| Rate limits | 300 per minute and 3 000 per hour per `CF-Connecting-IP`, 429 with `Retry-After`. The in-memory bucket is **per isolate**. Use the `sharedLimiter` hook (Durable Object or KV) for a global limit; see [security.md](security.md#the-proxy-trust-boundary). |
| Body | At most 2 MB, checked against both `Content-Length` and the bytes actually read (413). |
| Headers | Only `authorization`, `content-type`, `accept` go upstream. Only `content-type`, `retry-after`, `retry-after-ms` come back. |
| Answers | `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. A failed upstream gets a 502 with no detail. |
| Logging | None, and no storage. |

Environment variables (set them in the Pages project, never in the repository):

| Variable | Default | Purpose |
|----------|---------|---------|
| `ALLOWED_ORIGINS` | none (only `Sec-Fetch-Site: same-origin` passes) | Comma-separated site origins, e.g. `https://issueclassifier.com,https://www.issueclassifier.com`. |
| `JEV_UPSTREAM_URL` | `https://api.typesafe.ai` | Upstream origin. |

A function on **another origin** (mode b') would additionally need CORS for the site origin only, a
`VITE_JEV_BASE_URL` set to its absolute URL, and that origin in the CSP `connect-src` in
`index.html`. The reference function does not implement it.

### Asking TypeSafe for CORS (removes the proxy)

The proxy exists only because the Jev API rejects browser origins. If TypeSafe allows the site's
origin, the browser could call Jev directly with the user's own key. The proxy, its rate limiter and
its hosting cost would then go away. What to ask for:

- Allow the origin `https://issueclassifier.com` for `POST /v1/systemone` and `GET /v1/models`.
- Allow the request headers `Authorization` and `Content-Type`.
- Expose the `Retry-After` and `Retry-After-Ms` response headers, which the app uses for backoff.

Once granted: set `VITE_JEV_BASE_URL=https://api.typesafe.ai`, add `https://api.typesafe.ai` to the
CSP `connect-src`, and stop deploying the function.

Ready-to-send message:

```text
Subject: CORS allowlist request for issueclassifier.com

Hello TypeSafe team,

I maintain local-issue-classifier, an open-source web app that rates GitHub issues with Jev.
Each user brings their own Jev API key. The key stays in their browser tab and is sent only to
your API.

Today the browser cannot call api.typesafe.ai directly because the API rejects browser origins,
so we relay requests through a small same-origin proxy. We would prefer to remove that proxy.

Could you allow CORS for the origin https://issueclassifier.com on these endpoints?

- POST /v1/systemone
- GET /v1/models

The requests carry the Authorization and Content-Type headers. It would also help to expose the
Retry-After and Retry-After-Ms response headers, so the app can back off correctly on 429s.

No other origin or endpoint is needed. Thank you!
```

## Configuration

| Variable | Read by | Default | Purpose |
|----------|---------|---------|---------|
| `VITE_JEV_BASE_URL` | browser bundle and `vite.config.ts` | `/jev` | Base URL of the Jev proxy. When it is a path, the local proxy listens on that path. Not a secret. |
| `JEV_UPSTREAM_URL` | `vite.config.ts` and the hosted function (never bundled) | `https://api.typesafe.ai` | Where the proxy forwards. Point it at any server that speaks the same `/v1/systemone` and `/v1/models` API. |
| `ALLOWED_ORIGINS` | the hosted function only | none | Site origins accepted from `Origin`/`Referer`; see mode (b). |

The model name defaults to `jev-latest` (one constant, `DEFAULT_JEV_MODEL` in `src/domain/types.ts`)
and can be changed in Preferences. The response's `confidence` fields are optional, so a compatible
provider that omits them still works. To classify with a local server instead of the TypeSafe cloud,
choose it in Settings; see [local-providers.md](local-providers.md).

Never put a key in `.env`. Keys are entered at runtime and kept in memory only.

## Measuring classification latency

Measured classification latencies (2026-09-23 and -24):

- Per-issue mode (concurrency 4): ≈2 s per call (22 issues classified in 11 s)
- Batched mode (one request): 22 issues classified in ≈3.2 s

The in-app estimate in `src/domain/classifyRun.ts` (`SECONDS_PER_CALL`) defaults to 2 s per call.
To measure again with a different key or provider, run `pnpm dev`, enter the key in Settings,
open an analysis and click **Classify unclassified**. Note the wall-clock time from click to the
summary, divide by the number of calls, and update `SECONDS_PER_CALL` in `src/domain/classifyRun.ts`.
