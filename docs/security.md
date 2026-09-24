# Security model

Issue Classifier is a browser app. Your keys stay in the tab. The only server-side piece is
a small proxy that forwards two Jev endpoints and nothing else. This page describes what the app
defends against, how it does it, and what it does **not** protect.

## At a glance

| Area | Defence | Where |
|------|---------|-------|
| Secrets | Kept in memory by default. Never sent anywhere except the API they belong to. Never logged or stored by a proxy. | `src/composables/useSecrets.ts`, [architecture.md](architecture.md#secrets-policy) |
| XSS | No `v-html`. All issue text is rendered as plain text. A strict Content-Security-Policy. The HTML export escapes every value. | `index.html`, `src/domain/exportHtml.ts` |
| Proxy abuse | Same-origin callers only, two allowlisted routes, per-IP rate limits, a body cap, a header allowlist. | `server/jevProxyPolicy.ts` |
| Local providers | Loopback or private LAN targets only, and only from the local Vite server. | `validateLocalBaseUrl`, `/jev-local` |
| Supply chain | `pnpm hygiene` fails on high or critical advisories in production dependencies. | `scripts/check-hygiene.mjs` |

## Secrets in the browser

- The Jev key, the GitHub token and a local server's key live in `useSecrets()`'s module state.
  By default nothing is written to storage. Opt-in `tab` or `device` persistence is explained in
  the UI and in [architecture.md](architecture.md#secrets-policy).
- The GitHub token goes only to `api.github.com`. The Jev key goes only to `/jev/...` (the proxy),
  which forwards it to Jev in the `Authorization` header while the request is in flight.
- The proxy never logs, caches or stores headers or bodies. Answers carry
  `Cache-Control: no-store`, so no browser or intermediate cache keeps a response.
- `.env` never holds a key. `pnpm hygiene` fails on a tracked `.env`, on token-shaped strings, and
  on anything key-shaped under `functions/`.

## XSS defences

Issue titles, bodies and comments come from GitHub. Anyone can write them, so treat them as hostile.

- **No `v-html`.** Vue templates escape interpolated text. Issue bodies and comments are shown as
  plain text (`IssueDetailDrawer.vue`). This is a code convention; no test enforces it yet.
- **Content-Security-Policy** (`index.html`, checked by `tests/csp.test.ts`): scripts come only
  from `'self'`, plus `'wasm-unsafe-eval'` for the in-browser model. `connect-src` lists only this
  app, GitHub, loopback addresses and the Hugging Face model hosts. An injected script could
  neither load code from elsewhere nor send a key to an unlisted host.
- **Exports**: the HTML export escapes every value (`escapeHtml` in `src/domain/exportHtml.ts`).

## The proxy trust boundary

The Jev API rejects browser origins, so the browser calls `/jev/v1/systemone` and `/jev/v1/models`
on its own origin, and a proxy forwards them. Without a policy, a hosted `/jev` would be a public
relay: any website or script could use it to reach Jev from our IP addresses. Every proxy host (the
Vite server locally, the Pages Function when hosted) runs the same pure decision table in
`server/jevProxyPolicy.ts`:

| # | Check | Refusal |
|---|-------|---------|
| 1 | Path is exactly `<prefix>/v1/systemone` or `<prefix>/v1/models` (no query string) | 404 |
| 2 | `OPTIONS` is answered by the proxy itself, with no CORS headers | 204 (a cross-origin preflight therefore fails in the caller's browser) |
| 3 | Method: `POST` for systemone, `GET` for models | 405 with `Allow` |
| 4 | Same-origin caller: `Sec-Fetch-Site: same-origin`, or, when that header is absent, an `Origin` (else `Referer`) whose origin is in `allowedOrigins` | 403 |
| 5 | Body: `POST` needs a valid `Content-Length` of at most 2 MB | 411 / 413 |
| 6 | Rate limit per client IP: 300 requests per minute and 3 000 per hour (token buckets) | 429 with `Retry-After` |

The limits leave room for normal use. One tab classifying at the maximum concurrency of 8 sends
about 240 requests a minute. A refused request never spends rate-limit tokens.

**Fail-closed on the hosted function.** `Sec-Fetch-Site` is a genuine browser guarantee only for an
actual browser request; a non-browser caller can set it to whatever it likes. So the hosted
function (`functions/jev/[[path]].ts`) does not rely on it alone: when its `ALLOWED_ORIGINS`
environment variable is unset or empty, it refuses every request with a 403 before the shared
policy even runs, rather than silently falling through to trusting `Sec-Fetch-Site`. See
[architecture.md](architecture.md#deployment-modes) for the two hosts and their environment
variable contract.

What reaches Jev: only `authorization`, `content-type` and `accept`, plus the transport headers the
HTTP client sets for the hop (`host`, `content-length`). `Cookie`, `Origin`, `Referer`, `User-Agent`,
`X-Forwarded-For` and all other headers are dropped. Upstream `Set-Cookie` is dropped from the
answer. Redirects are returned to the caller, never followed.

**Client IP.** Locally, the IP is the socket address. On Cloudflare, it is `CF-Connecting-IP`,
which the edge sets. A client-sent `X-Forwarded-For` is never trusted.

**Rate-limit scope.** The default limiter is an in-memory token bucket
(`createTokenBucketLimiter`, at most 10 000 tracked IPs). On Cloudflare Workers that memory is
**per isolate**: each data center and instance has its own buckets, and an isolate can be recycled
at any time. The limiter slows a single abuser down, but it is not a global limit. The production
upgrade is a shared limiter, such as a Durable Object keyed by IP or a KV counter. Plug it in
through the `sharedLimiter` hook of `createJevPagesHandler`, typed as `AsyncJevRateLimiter`.

## Local providers on loopback

`/jev-local` forwards to a Kev or JevK5 server named in `x-local-target`. The target must be
loopback or a private LAN address (`validateLocalBaseUrl`). A foreign `Origin` gets a 403, so other
websites open in the browser cannot use it to probe your network. `/jev-local` exists only in the
local Vite server. A hosted build has no such route: a public relay into private networks is exactly
what this route must never become. See [local-providers.md](local-providers.md).

The Vite server binds to `localhost` only. Vite's own `allowedHosts` check refuses unknown `Host`
headers, which blocks DNS-rebinding attempts against the dev server.

## Supply chain

- `pnpm hygiene` runs `pnpm audit --json`:
  - a **high or critical** advisory in a **production** dependency fails the check;
  - moderate and low advisories, and any advisory in devDependencies only, are warnings.
- An advisory can be acknowledged in `ACKNOWLEDGED_ADVISORIES` (`scripts/check-hygiene.mjs`), with a
  written reason. It is then reported as a warning that repeats the reason. Every entry is a
  reviewed decision.
- Currently acknowledged: two `sharp` advisories (libvips and libheif, fixed in `sharp >=0.35.4`).
  `sharp` is reached only through `@huggingface/transformers`, which requires `^0.34.1` and uses it
  under Node only. The app ships the browser build, which never imports it.
- If the registry cannot be reached, the audit is reported as a warning, not a failure. CI should
  run where the registry is reachable.
- Build scripts of dependencies are denied by default (`allowBuilds` in `pnpm-workspace.yaml`).
  Only `esbuild` may run one.

## What is NOT protected

- **A compromised device or browser profile.** Malware, extensions with page access, or anyone
  using your OS account can read keys from memory or from opt-in storage.
- **A holder of a valid Jev key using the proxy outside a browser.** `Sec-Fetch-Site`, `Origin` and
  `Referer` are browser signals. `curl` can forge them. The same-origin check stops other websites
  from using a visitor's browser as a relay. It does not stop a scripted client. Against those, the
  only defences are the per-IP rate limit and Jev's own key-based limits. Nobody gains Jev access
  without a key: the proxy adds no credentials of its own.
- **Distributed abuse.** Many IPs, or many Cloudflare isolates, multiply the in-memory limit. Only a
  shared limiter caps them globally.
- **GitHub content semantics.** Issue text is displayed safely, but it is still sent to Jev as
  context. A crafted issue can try to influence its own rating (prompt injection). Ratings are
  advisory.
- **Vulnerabilities in devDependencies.** The test tooling (`vitest`, `happy-dom`) has known
  advisories. They are reported as warnings, because that tooling runs only on developer machines
  and in CI, never in the shipped app.
