// modelCache: measures and removes the model files transformers.js keeps in
// the Cache API. A fake CacheStorage stands in for the browser's.
import { describe, expect, it } from 'vitest'
import { TRANSFORMERS_CACHE, cachedModelBytes, removeCachedModel } from './modelCache'
import { detectBrowserSupport } from './webgpu'

function fakeCaches(entries: Record<string, number | null>) {
  const store = new Map(Object.entries(entries))
  const opened: string[] = []
  const cache = {
    keys: async () => [...store.keys()].map((url) => new Request(url)),
    match: async (request: Request) => {
      const size = store.get(request.url)
      if (size === undefined) return undefined
      const headers: Record<string, string> = size === null ? {} : { 'content-length': String(size) }
      return new Response(size === null ? 'abcd' : '', { headers })
    },
    delete: async (request: Request) => store.delete(request.url),
  }
  const storage = {
    has: async (name: string) => name === TRANSFORMERS_CACHE,
    open: async (name: string) => {
      opened.push(name)
      return cache
    },
  } as unknown as CacheStorage
  return { storage, store, opened }
}

const HUB = 'https://huggingface.co'
const ENTRIES = {
  [`${HUB}/org/model/resolve/main/config.json`]: 900,
  [`${HUB}/org/model/resolve/main/onnx/model_q4f16.onnx`]: 569_789_750,
  [`${HUB}/org/model-other/resolve/main/config.json`]: 100,
  [`${HUB}/other/model/resolve/main/config.json`]: 50,
}

describe('cachedModelBytes', () => {
  it('sums the cached files of one model only', async () => {
    const { storage, opened } = fakeCaches(ENTRIES)
    expect(await cachedModelBytes('org/model', storage)).toBe(900 + 569_789_750)
    expect(opened).toEqual([TRANSFORMERS_CACHE])
  })

  it('falls back to the body size when there is no content-length', async () => {
    const { storage } = fakeCaches({ [`${HUB}/org/model/resolve/main/tokenizer.json`]: null })
    expect(await cachedModelBytes('org/model', storage)).toBe(4)
  })

  it('is 0 before anything was downloaded, and null without the Cache API', async () => {
    const empty = { has: async () => false } as unknown as CacheStorage
    expect(await cachedModelBytes('org/model', empty)).toBe(0)
    expect(await cachedModelBytes('org/model', undefined)).toBeNull()
  })
})

describe('removeCachedModel', () => {
  it('deletes only that model’s files', async () => {
    const { storage, store } = fakeCaches(ENTRIES)
    expect(await removeCachedModel('org/model', storage)).toBe(2)
    expect([...store.keys()]).toEqual([`${HUB}/org/model-other/resolve/main/config.json`, `${HUB}/other/model/resolve/main/config.json`])
  })
})

describe('detectBrowserSupport', () => {
  it('is webgpu when an adapter is granted', async () => {
    expect(await detectBrowserSupport({ gpu: { requestAdapter: async () => ({}) }, wasm: true })).toBe('webgpu')
  })

  it('is wasm without navigator.gpu, or when no adapter is granted', async () => {
    expect(await detectBrowserSupport({ gpu: undefined, wasm: true })).toBe('wasm')
    expect(await detectBrowserSupport({ gpu: { requestAdapter: async () => null }, wasm: true })).toBe('wasm')
    expect(await detectBrowserSupport({ gpu: { requestAdapter: async () => Promise.reject(new Error('x')) }, wasm: true })).toBe(
      'wasm',
    )
  })

  it('is none without WebAssembly either', async () => {
    expect(await detectBrowserSupport({ gpu: undefined, wasm: false })).toBe('none')
  })
})
