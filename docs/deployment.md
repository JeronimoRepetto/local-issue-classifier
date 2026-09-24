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
| (b) Hosted, same-origin rewrite | future, not implemented | `/jev/**` rewritten to a serverless function | `/jev` |
| (b') Hosted, function on another origin | future, not implemented | the function's absolute URL | e.g. `https://fn.example.com/jev` |

### (a) Local proxy: what it does

Built by `server/jevProxy.ts` and registered in `vite.config.ts` for both `server.proxy` and
`preview.proxy`:

| Rule | Behaviour |
|------|-----------|
| Allowlist | Only `/jev/v1/systemone` and `/jev/v1/models` are forwarded. Any other path under `/jev` gets a 404 and never reaches upstream. |
| Rewrite | `/jev` is stripped, so `/jev/v1/models` becomes `/v1/models` upstream. |
| Headers | `origin`, `referer` and `cookie` are removed, so upstream sees a server-to-server call. `authorization` and the JSON body are forwarded unchanged. |
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

### (b) Hosted: the contract a future function must honour

- The same two allowlisted paths.
- Forward `Authorization` and the JSON body unchanged.
- Strip `cookie`, `origin` and `referer`.
- No logging of headers or bodies, and no storage.
- With a function on another origin: set `VITE_JEV_BASE_URL` to its absolute URL, add that origin to
  the CSP `connect-src` in `index.html`, and let the function answer CORS for the site origin only.

Before going public, such a function needs its own review of abuse and rate limiting: it is an open
relay for anyone who holds a Jev key. That design is out of scope for v1.

## Configuration

| Variable | Read by | Default | Purpose |
|----------|---------|---------|---------|
| `VITE_JEV_BASE_URL` | browser bundle and `vite.config.ts` | `/jev` | Base URL of the Jev proxy. When it is a path, the local proxy listens on that path. Not a secret. |
| `JEV_UPSTREAM_URL` | `vite.config.ts` only (never bundled) | `https://api.typesafe.ai` | Where the local proxy forwards. Point it at any server that speaks the same `/v1/systemone` and `/v1/models` API. |

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
