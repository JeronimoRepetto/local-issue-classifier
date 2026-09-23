// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHttpJevTransport,
  parseRetryAfter,
  resolveJevBaseUrl,
  JevTransportError,
  DEFAULT_JEV_BASE_URL,
  type HttpJevTransportOptions,
  type SystemOneRequestBody,
} from './transport'

const SECRET = 'jev_sk_test_secret_value'
const BODY = { model: 'jev-latest', state: { issue: { number: 1 } }, questions: {} } as unknown as SystemOneRequestBody

type Call = { url: string; init: RequestInit }

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init }
    calls.push(call)
    return respond(call)
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

function transport(respond: (call: Call) => Response | Promise<Response>, o: Partial<HttpJevTransportOptions> = {}) {
  const fake = fakeFetch(respond)
  const t = createHttpJevTransport({
    baseUrl: '/jev',
    getApiKey: () => SECRET,
    fetch: fake.fetch,
    now: () => Date.parse('2026-09-23T00:00:00Z'),
    ...o,
  })
  return { t, calls: fake.calls }
}

const consoleSpies: ReturnType<typeof vi.spyOn>[] = []
beforeEach(() => {
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    consoleSpies.push(vi.spyOn(console, m).mockImplementation(() => {}))
  }
})
afterEach(() => {
  for (const spy of consoleSpies) {
    expect(spy, 'the transport must never log').not.toHaveBeenCalled()
    spy.mockRestore()
  }
  consoleSpies.length = 0
  vi.useRealTimers()
})

describe('createHttpJevTransport: URL and headers', () => {
  it.each([
    ['/jev', '/jev/v1/systemone'],
    ['/jev/', '/jev/v1/systemone'],
    ['https://fn.example.com/jev', 'https://fn.example.com/jev/v1/systemone'],
    ['http://localhost:8080', 'http://localhost:8080/v1/systemone'],
  ])('builds the URL from baseUrl %s', async (baseUrl, expected) => {
    const { t, calls } = transport(() => json(200, { answers: {} }), { baseUrl })
    await t.systemOne(BODY)
    expect(calls[0].url).toBe(expected)
  })

  it('POSTs the JSON body with a Bearer key read at call time', async () => {
    let key = 'first'
    const { t, calls } = transport(() => json(200, { answers: {} }), { getApiKey: () => key })
    await t.systemOne(BODY)
    key = 'second'
    await t.systemOne(BODY)
    const headers = new Headers(calls[1].init.headers)
    expect(calls[1].init.method).toBe('POST')
    expect(headers.get('authorization')).toBe('Bearer second')
    expect(headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(String(calls[1].init.body))).toEqual(BODY)
  })

  it('omits Authorization when the key is blank (keyless local providers)', async () => {
    const { t, calls } = transport(() => json(200, { answers: {} }), { getApiKey: () => '  ' })
    await t.systemOne(BODY)
    expect(new Headers(calls[0].init.headers).has('authorization')).toBe(false)
  })

  it('lists models with GET {baseUrl}/v1/models', async () => {
    const { t, calls } = transport(() => json(200, { models: [] }))
    const result = await t.listModels()
    expect(calls[0].url).toBe('/jev/v1/models')
    expect(calls[0].init.method).toBe('GET')
    expect(result).toEqual({ status: 200, ok: true, body: { models: [] }, retryAfterMs: null })
  })

  it('calls fetch without binding it to the options object (no Illegal invocation)', async () => {
    const thisValues: unknown[] = []
    const fetchImpl = function (this: unknown) {
      thisValues.push(this)
      return Promise.resolve(json(200, {}))
    } as unknown as typeof fetch
    const t = createHttpJevTransport({ baseUrl: '/jev', getApiKey: () => SECRET, fetch: fetchImpl })
    await t.listModels()
    expect(thisValues[0]).toBeUndefined()
  })
})

describe('createHttpJevTransport: results', () => {
  it('returns status, parsed error body and no request data for a 422', async () => {
    const { t } = transport(() => json(422, { detail: 'questions.kind: bad' }))
    const result = await t.systemOne(BODY)
    expect(result).toEqual({ status: 422, ok: false, body: { detail: 'questions.kind: bad' }, retryAfterMs: null })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('returns body null when the response is not JSON', async () => {
    const { t } = transport(() => new Response('Disallowed CORS origin', { status: 400 }))
    expect((await t.systemOne(BODY)).body).toBeNull()
  })

  it('parses retry-after-ms first, then retry-after seconds', async () => {
    const { t } = transport(() => json(429, {}, { 'retry-after-ms': '1500', 'retry-after': '9' }))
    expect((await t.systemOne(BODY)).retryAfterMs).toBe(1500)
    const { t: t2 } = transport(() => json(529, {}, { 'retry-after': '2' }))
    expect((await t2.systemOne(BODY)).retryAfterMs).toBe(2000)
  })
})

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-09-23T00:00:00Z')
  const h = (init: Record<string, string>) => new Headers(init)

  it('reads retry-after-ms as milliseconds, including fractions', () => {
    expect(parseRetryAfter(h({ 'retry-after-ms': '250.5' }), now)).toBe(251)
  })
  it('reads retry-after as seconds', () => {
    expect(parseRetryAfter(h({ 'retry-after': '3' }), now)).toBe(3000)
  })
  it('reads retry-after as an HTTP date relative to now', () => {
    expect(parseRetryAfter(h({ 'retry-after': 'Wed, 23 Sep 2026 00:00:05 GMT' }), now)).toBe(5000)
  })
  it('clamps a past date to 0 and ignores garbage or absence', () => {
    expect(parseRetryAfter(h({ 'retry-after': 'Tue, 22 Sep 2026 00:00:00 GMT' }), now)).toBe(0)
    expect(parseRetryAfter(h({ 'retry-after': 'soon' }), now)).toBeNull()
    expect(parseRetryAfter(h({ 'retry-after-ms': '-5' }), now)).toBeNull()
    expect(parseRetryAfter(h({}), now)).toBeNull()
  })
})

describe('createHttpJevTransport: timeout, abort and network errors', () => {
  const hanging = (call: Call) =>
    new Promise<Response>((_resolve, reject) => {
      call.init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })

  it('aborts an attempt after timeoutMs with a timeout error', async () => {
    vi.useFakeTimers()
    const { t, calls } = transport(hanging, { timeoutMs: 1_000 })
    const pending = t.systemOne(BODY)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'JevTransportError', kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
    expect(calls[0].init.signal?.aborted).toBe(true)
  })

  it('defaults to a 20 s timeout per attempt', async () => {
    vi.useFakeTimers()
    const { t } = transport(hanging)
    let settled = false
    const pending = t.systemOne(BODY).catch((e: unknown) => {
      settled = true
      return e
    })
    await vi.advanceTimersByTimeAsync(19_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toBeInstanceOf(JevTransportError)
  })

  it('reports a caller abort as aborted, not as a timeout', async () => {
    const controller = new AbortController()
    const { t } = transport(hanging)
    const pending = t.systemOne(BODY, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('rejects immediately when the caller signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const { t, calls } = transport(() => json(200, {}))
    await expect(t.systemOne(BODY, controller.signal)).rejects.toMatchObject({ kind: 'aborted' })
    expect(calls).toHaveLength(0)
  })

  it('wraps a network failure without leaking the key or the request', async () => {
    const { t } = transport(() => {
      throw new TypeError(`fetch failed for Bearer ${SECRET}`)
    })
    const error = await t.systemOne(BODY).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(JevTransportError)
    expect((error as JevTransportError).kind).toBe('network')
    expect(String((error as Error).message)).not.toContain(SECRET)
  })
})

describe('resolveJevBaseUrl', () => {
  it('defaults to /jev and trims configured values', () => {
    expect(DEFAULT_JEV_BASE_URL).toBe('/jev')
    expect(resolveJevBaseUrl(undefined)).toBe('/jev')
    expect(resolveJevBaseUrl('  ')).toBe('/jev')
    expect(resolveJevBaseUrl(' https://fn.example.com/jev ')).toBe('https://fn.example.com/jev')
  })
})
