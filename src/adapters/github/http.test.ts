// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGitHubHttp, parseRateLimit, type GitHubHttpOptions } from './http'
import { AuthError, GitHubHttpError, NotFoundError, RateLimitedError } from './errors'

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> }
type Call = { url: string; headers: Headers }

function reply({ status = 200, body = {}, headers = {} }: Reply): Response {
  const noBody = status === 304 || status === 204
  const isText = headers['content-type']?.startsWith('text/') && typeof body === 'string'
  return new Response(noBody ? null : isText ? (body as string) : JSON.stringify(body), {
    status,
    headers,
  })
}

/** A fake `fetch` that answers from a script, in order, and records every call. */
function fakeFetch(script: Reply[]) {
  const calls: Call[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) })
    const next = script.shift()
    if (!next) throw new Error(`unexpected request ${String(input)}`)
    return reply(next)
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

function client(script: Reply[], overrides: Partial<GitHubHttpOptions> = {}) {
  const fake = fakeFetch(script)
  const sleep = vi.fn(async (_ms: number, _signal?: AbortSignal) => {})
  const http = createGitHubHttp({
    fetch: fake.fetch,
    getToken: () => '',
    sleep,
    now: () => 1_000_000,
    ...overrides,
  })
  return { http, calls: fake.calls, sleep }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('request headers', () => {
  it('sends the GitHub media type and API version on every request', async () => {
    const { http, calls } = client([{ body: { ok: true } }])
    await http.request('/repos/o/r')
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r')
    expect(calls[0].headers.get('accept')).toBe('application/vnd.github+json')
    expect(calls[0].headers.get('x-github-api-version')).toBe('2022-11-28')
  })

  it('sends Authorization: Bearer only when the token is non-empty', async () => {
    let token = ''
    const { http, calls } = client([{}, {}, {}], { getToken: () => token })
    await http.request('/a')
    token = 'secret-token'
    await http.request('/b')
    token = '   '
    await http.request('/c')
    expect(calls[0].headers.has('authorization')).toBe(false)
    expect(calls[1].headers.get('authorization')).toBe('Bearer secret-token')
    expect(calls[2].headers.has('authorization')).toBe(false)
  })

  it('never sends the token to a host other than the API base', async () => {
    const { http, calls } = client([{}], { getToken: () => 'secret-token' })
    await http.request('https://evil.example.com/steal')
    expect(calls[0].headers.has('authorization')).toBe(false)
  })

  it('honours a custom Accept header and returns raw text when asked', async () => {
    const { http, calls } = client([{ body: '# Readme', headers: { 'content-type': 'text/plain' } }])
    const res = await http.request<string>('/repos/o/r/readme', {
      accept: 'application/vnd.github.raw+json',
      responseType: 'text',
    })
    expect(calls[0].headers.get('accept')).toBe('application/vnd.github.raw+json')
    expect(res.body).toBe('# Readme')
  })
})

describe('ETag conditional requests', () => {
  it('stores the ETag and returns the cached body and link on 304', async () => {
    const link = '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"'
    const { http, calls } = client([
      { body: [{ id: 1 }], headers: { etag: 'W/"abc"', link } },
      { status: 304, headers: { etag: 'W/"abc"' } },
    ])
    const first = await http.request('/repos/o/r/issues')
    expect(calls[0].headers.has('if-none-match')).toBe(false)
    expect(first.fromCache).toBe(false)

    const second = await http.request('/repos/o/r/issues')
    expect(calls[1].headers.get('if-none-match')).toBe('W/"abc"')
    expect(second.status).toBe(304)
    expect(second.fromCache).toBe(true)
    expect(second.body).toEqual([{ id: 1 }])
    expect(second.link).toEqual({ next: 'https://api.github.com/repos/o/r/issues?page=2' })
  })

  it('sends conditional requests without a token too', async () => {
    const { http, calls } = client([{ body: 1, headers: { etag: '"e1"' } }, { body: 2 }])
    await http.request('/x')
    await http.request('/x')
    expect(calls[1].headers.get('if-none-match')).toBe('"e1"')
    expect(calls[1].headers.has('authorization')).toBe(false)
  })

  it('keeps separate cache entries per Accept header', async () => {
    const { http, calls } = client([{ body: 1, headers: { etag: '"json"' } }, { body: 'raw' }])
    await http.request('/readme')
    await http.request('/readme', { accept: 'application/vnd.github.raw+json', responseType: 'text' })
    expect(calls[1].headers.has('if-none-match')).toBe(false)
  })

  it('clearCache forgets stored ETags', async () => {
    const { http, calls } = client([{ body: 1, headers: { etag: '"e1"' } }, { body: 1 }])
    await http.request('/x')
    http.clearCache()
    await http.request('/x')
    expect(calls[1].headers.has('if-none-match')).toBe(false)
  })
})

describe('rate-limit state', () => {
  const headers = {
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4990',
    'x-ratelimit-used': '10',
    'x-ratelimit-reset': '1790000000',
    'x-ratelimit-resource': 'core',
  }

  it('parses the X-RateLimit-* headers', () => {
    expect(parseRateLimit(new Headers(headers))).toEqual({
      limit: 5000,
      remaining: 4990,
      used: 10,
      resetAt: 1_790_000_000_000,
      resource: 'core',
    })
  })

  it('returns null when the headers are absent or not numeric', () => {
    expect(parseRateLimit(new Headers())).toBeNull()
    expect(parseRateLimit(new Headers({ 'x-ratelimit-remaining': 'abc' }))).toBeNull()
  })

  it('updates the state from every response and notifies the listener', async () => {
    const onRateLimit = vi.fn()
    const { http } = client([{ headers }], { onRateLimit })
    expect(http.getRateLimit()).toBeNull()
    await http.request('/x')
    expect(http.getRateLimit()?.remaining).toBe(4990)
    expect(onRateLimit).toHaveBeenCalledWith(expect.objectContaining({ remaining: 4990 }))
  })
})

describe('error policy', () => {
  it('waits for retry-after seconds, then retries once (fake timers)', async () => {
    vi.useFakeTimers()
    const fake = fakeFetch([{ status: 403, headers: { 'retry-after': '30' } }, { body: 'ok' }])
    const http = createGitHubHttp({ fetch: fake.fetch, getToken: () => '' })
    const pending = http.request('/x')
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fake.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    const res = await pending
    expect(fake.calls).toHaveLength(2)
    expect(res.body).toBe('ok')
  })

  it('retries retry-after only once, then reports a rate limit', async () => {
    const { http, calls, sleep } = client([
      { status: 429, headers: { 'retry-after': '5' } },
      { status: 429, headers: { 'retry-after': '5' } },
    ])
    const err = await http.request('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitedError)
    expect((err as RateLimitedError).resetAt).toBe(1_000_000 + 5_000)
    expect(calls).toHaveLength(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(5_000, undefined)
  })

  it('throws RateLimitedError(resetAt) when remaining is 0, without retrying', async () => {
    const { http, calls } = client([
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' } },
    ])
    const err = await http.request('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitedError)
    expect((err as RateLimitedError).resetAt).toBe(1_790_000_000_000)
    expect(calls).toHaveLength(1)
  })

  it('other 403/429: waits 60 s, then backs off exponentially, at most 2 retries', async () => {
    const { http, calls, sleep } = client([{ status: 403 }, { status: 429 }, { status: 403 }])
    const err = await http.request('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubHttpError)
    expect((err as GitHubHttpError).status).toBe(403)
    expect(calls).toHaveLength(3)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([60_000, 120_000])
  })

  it('other 403 succeeds on a retry', async () => {
    const { http } = client([{ status: 403 }, { body: 'ok' }])
    expect((await http.request('/x')).body).toBe('ok')
  })

  it('5xx: up to 2 retries with backoff, then a typed error', async () => {
    const { http, calls, sleep } = client([{ status: 502 }, { status: 503 }, { status: 500 }])
    const err = await http.request('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubHttpError)
    expect((err as GitHubHttpError).status).toBe(500)
    expect(calls).toHaveLength(3)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1_000, 2_000])
  })

  it('5xx succeeds on a retry', async () => {
    const { http } = client([{ status: 500 }, { body: 'ok' }])
    expect((await http.request('/x')).body).toBe('ok')
  })

  it('401: calls onUnauthorized once and throws AuthError, without retrying', async () => {
    const onUnauthorized = vi.fn()
    const { http, calls } = client([{ status: 401 }], {
      getToken: () => 'secret-token',
      onUnauthorized,
    })
    const err = await http.request('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AuthError)
    expect((err as Error).message).toBe('Token invalid or expired')
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
  })

  it('404: throws NotFoundError without retrying', async () => {
    const { http, calls } = client([{ status: 404 }])
    const err = await http.request('/repos/o/missing').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NotFoundError)
    expect((err as NotFoundError).status).toBe(404)
    expect(calls).toHaveLength(1)
  })

  it('other 4xx: throws GitHubHttpError without retrying', async () => {
    const { http, calls } = client([{ status: 422 }])
    const err = await http.request('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubHttpError)
    expect(calls).toHaveLength(1)
  })

  it('a malformed JSON body becomes a typed error that does not echo the body', async () => {
    const { http } = client([{ body: 'body-secret{', headers: { 'content-type': 'text/plain' } }])
    const err = (await http.request('/x').catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(GitHubHttpError)
    expect(err.message).not.toMatch(/body-secret/)
  })

  it('error messages never contain the token or the response body', async () => {
    const { http } = client([{ status: 422, body: { message: 'body-secret' } }], {
      getToken: () => 'secret-token',
    })
    const err = (await http.request('/x').catch((e: unknown) => e)) as Error
    expect(`${err.message} ${JSON.stringify(err)}`).not.toMatch(/secret-token|body-secret/)
  })
})

describe('request queue', () => {
  it('never has more than 2 requests in flight and starts them in order', async () => {
    let inFlight = 0
    let peak = 0
    const started: string[] = []
    const release: Array<() => void> = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      started.push(String(input).split('/').pop() as string)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise<void>((resolve) => release.push(resolve))
      inFlight -= 1
      return reply({ body: String(input) })
    }) as unknown as typeof fetch
    const http = createGitHubHttp({ fetch: fetchFn, getToken: () => '' })

    const results = ['1', '2', '3', '4', '5'].map((n) => http.request<string>(`/r/${n}`))
    const flush = () => new Promise((r) => setTimeout(r, 0))
    await flush()
    expect(started).toEqual(['1', '2'])
    while (release.length) {
      release.shift()?.()
      await flush()
    }
    const bodies = (await Promise.all(results)).map((r) => r.body)
    expect(peak).toBe(2)
    expect(started).toEqual(['1', '2', '3', '4', '5'])
    expect(bodies).toEqual([1, 2, 3, 4, 5].map((n) => `https://api.github.com/r/${n}`))
  })

  it('frees the slot when a request fails', async () => {
    const { http } = client([{ status: 404 }, { status: 404 }, { body: 'ok' }])
    await expect(http.request('/a')).rejects.toBeInstanceOf(NotFoundError)
    await expect(http.request('/b')).rejects.toBeInstanceOf(NotFoundError)
    expect((await http.request('/c')).body).toBe('ok')
  })
})

describe('paginate', () => {
  const next = (p: number) => `<https://api.github.com/items?page=${p}>; rel="next"`

  it('follows rel="next" until there is no next page', async () => {
    const { http, calls } = client([
      { body: [1], headers: { link: next(2) } },
      { body: [2], headers: { link: next(3) } },
      { body: [3] },
    ])
    const pages: unknown[] = []
    await http.paginate('/items', (body) => {
      pages.push(body)
    })
    expect(pages).toEqual([[1], [2], [3]])
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.github.com/items',
      'https://api.github.com/items?page=2',
      'https://api.github.com/items?page=3',
    ])
  })

  it('stops when onPage returns false', async () => {
    const { http, calls } = client([
      { body: [1], headers: { link: next(2) } },
      { body: [2], headers: { link: next(3) } },
    ])
    await http.paginate('/items', () => false)
    expect(calls).toHaveLength(1)
  })

  it('stops with an AbortError when the signal is aborted', async () => {
    const controller = new AbortController()
    const { http, calls } = client([{ body: [1], headers: { link: next(2) } }])
    const err = await http
      .paginate('/items', () => controller.abort(), controller.signal)
      .catch((e: unknown) => e)
    expect((err as Error).name).toBe('AbortError')
    expect(calls).toHaveLength(1)
  })
})
