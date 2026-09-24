// local-issue-classifier — the downloaded model files (docs/browser-inference.md).
// transformers.js caches every file it fetches from the Hugging Face Hub in the
// Cache API under 'transformers-cache', keyed by the file's `/resolve/` URL.
// This adapter only measures and removes one model's entries; it never writes.
// The browser may evict the cache under storage pressure like any other site
// data (it is covered by the same navigator.storage.persist() grant as the
// saved analyses); the next load then simply downloads the files again.

/** The Cache API name transformers.js v3 uses (src/utils/hub.js). */
export const TRANSFORMERS_CACHE = 'transformers-cache'

const ownsUrl = (modelId: string) => (url: string) => url.includes(`/${modelId}/resolve/`)

const browserCaches = (): CacheStorage | undefined =>
  typeof globalThis.caches === 'undefined' ? undefined : globalThis.caches

async function entries(modelId: string, storage: CacheStorage): Promise<{ cache: Cache; requests: Request[] } | null> {
  if (!(await storage.has(TRANSFORMERS_CACHE))) return null
  const cache = await storage.open(TRANSFORMERS_CACHE)
  const requests = (await cache.keys()).filter((r) => ownsUrl(modelId)(r.url))
  return { cache, requests }
}

/** Bytes of this model in the cache: 0 when nothing is cached, null without the Cache API. */
export async function cachedModelBytes(
  modelId: string,
  storage: CacheStorage | undefined = browserCaches(),
): Promise<number | null> {
  if (!storage) return null
  const found = await entries(modelId, storage)
  if (!found) return 0
  let total = 0
  for (const request of found.requests) {
    const response = await found.cache.match(request)
    if (!response) continue
    const length = Number(response.headers.get('content-length'))
    total += Number.isFinite(length) && length > 0 ? length : (await response.blob()).size
  }
  return total
}

/** Deletes this model's cached files; returns how many entries were removed. */
export async function removeCachedModel(
  modelId: string,
  storage: CacheStorage | undefined = browserCaches(),
): Promise<number> {
  if (!storage) return 0
  const found = await entries(modelId, storage)
  if (!found) return 0
  let removed = 0
  for (const request of found.requests) if (await found.cache.delete(request)) removed++
  return removed
}
