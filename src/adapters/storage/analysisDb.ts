// Saved analyses in IndexedDB (see docs/architecture.md). localStorage's
// ~5 MB quota was too small for real analyses, so they moved here; preferences,
// lastAnalysisId and the opt-in secrets entry stay where they were. This is the
// ONLY file allowed to touch indexedDB (tests/architecture.test.ts).
//
// Layout: database `local-issue-classifier` v1 with two object stores, both
// keyed by analysis id:
//   - `analyses`:  the analysis as its serialized JSON text, byte-for-byte what
//                  the old localStorage entry held (schemaVersion included), so
//                  one parser (analysisStore.parseAnalysis) validates both and
//                  a Vue proxy can never hit a DataCloneError;
//   - `summaries`: the AnalysisSummary for Home, written in the same
//                  transaction as its analysis, so the two cannot drift.
// Every operation is queued and runs in call order. No function throws or
// rejects: results are typed exactly like the legacy store's, and nothing is
// ever evicted to make room.
import { summarize } from '../../domain/analysis'
import type { AnalysisSummary } from '../../domain/types'
import { isQuotaError, parseAnalysis } from './analysisStore'
import type { ClearResult, IndexEntry, LoadResult, RemoveResult, SaveResult, WriteFailure } from './analysisStore'
import type { Analysis } from '../../domain/types'

export const ANALYSIS_DB_NAME = 'local-issue-classifier'
export const ANALYSIS_DB_VERSION = 1
export const ANALYSIS_STORES = { analyses: 'analyses', summaries: 'summaries' } as const

/** The subset of navigator.storage (StorageManager) this app uses; every member is optional. */
export interface StorageManagerLike {
  estimate?(): Promise<{ usage?: number; quota?: number }>
  persist?(): Promise<boolean>
  persisted?(): Promise<boolean>
}

/** `estimate`: the browser's own figures for this origin. `counted`: our serialized sizes, quota unknown. */
export type StorageUsage =
  | { usedBytes: number; quotaBytes: number; source: 'estimate' }
  | { usedBytes: number; quotaBytes: null; source: 'counted' }

/** Whether the browser may evict this origin's data under storage pressure. */
export type PersistenceState = 'persisted' | 'best-effort' | 'unsupported'

export interface AnalysisDb {
  loadIndex(): Promise<IndexEntry[]>
  loadAnalysis(id: string): Promise<LoadResult>
  saveAnalysis(analysis: Analysis): Promise<SaveResult>
  removeAnalysis(id: string): Promise<RemoveResult>
  clearAll(): Promise<ClearResult>
  /** Store JSON text as-is, with no summary (migration keeps unreadable legacy entries this way). */
  putRaw(id: string, raw: string): Promise<RemoveResult>
  /** The stored JSON text, or null when absent or not text (migration read-back check). */
  loadRaw(id: string): Promise<string | null>
  /** Used vs. available bytes. `extraCountedBytes` joins the fallback count (e.g. localStorage). */
  usage(extraCountedBytes?: number): Promise<StorageUsage>
  close(): void
}

export interface AnalysisDbOptions {
  storageManager?: StorageManagerLike | null
}

const { analyses: ANALYSES, summaries: SUMMARIES } = ANALYSIS_STORES

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new DOMException('The transaction was aborted.', 'AbortError'))
  })
}

function abortQuietly(tx: IDBTransaction): void {
  try {
    tx.abort()
  } catch {
    // Already finished or aborted.
  }
}

function writeFailure(error: unknown): WriteFailure {
  return { ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable' }
}

function isSummary(value: unknown): value is AnalysisSummary {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.updatedAt === 'string' && typeof v.counts === 'object'
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(ANALYSIS_DB_NAME, ANALYSIS_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of [ANALYSES, SUMMARIES]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new DOMException('The database upgrade is blocked by another tab.', 'UnknownError'))
  })
}

export function createAnalysisDb(factory: IDBFactory | null, options: AnalysisDbOptions = {}): AnalysisDb {
  const storageManager = options.storageManager ?? null
  let connection: Promise<IDBDatabase> | null = null
  let tail: Promise<unknown> = Promise.resolve()

  /** Opens lazily; a failed open is forgotten so the next call (e.g. Retry save) tries again. */
  function connect(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new DOMException('IndexedDB is unavailable.', 'UnknownError'))
    if (!connection) {
      let opening: Promise<IDBDatabase>
      try {
        opening = openDatabase(factory)
      } catch (error) {
        opening = Promise.reject(error)
      }
      connection = opening.then((db) => {
        // Another tab deleting or upgrading the database: step aside and reopen next time.
        db.onversionchange = () => {
          db.close()
          connection = null
        }
        db.onclose = () => {
          connection = null
        }
        return db
      })
      connection.catch(() => {
        connection = null
      })
    }
    return connection
  }

  /** Serializes every operation, in call order, whatever the previous one's outcome. */
  function queue<T>(op: () => Promise<T>): Promise<T> {
    const run = tail.then(op, op)
    tail = run.catch(() => undefined)
    return run
  }

  async function readIndex(): Promise<IndexEntry[]> {
    const db = await connect()
    const tx = db.transaction([ANALYSES, SUMMARIES], 'readonly')
    const [ids, summaryKeys, summaries] = await Promise.all([
      request(tx.objectStore(ANALYSES).getAllKeys()),
      request(tx.objectStore(SUMMARIES).getAllKeys()),
      request(tx.objectStore(SUMMARIES).getAll()),
    ])
    const summaryById = new Map<string, AnalysisSummary>()
    summaryKeys.forEach((key, i) => {
      const summary: unknown = summaries[i]
      if (isSummary(summary) && summary.id === key) summaryById.set(key, summary)
    })

    const ok: AnalysisSummary[] = []
    const unreadable: IndexEntry[] = []
    const needsParsing: string[] = []
    for (const key of ids) {
      const id = String(key)
      const summary = summaryById.get(id)
      if (summary) ok.push(summary)
      else needsParsing.push(id)
    }
    if (needsParsing.length > 0) {
      // Records without a (valid) summary: recover them by parsing, else list them as unreadable.
      const readTx = db.transaction(ANALYSES, 'readonly')
      const raws = await Promise.all(needsParsing.map((id) => request(readTx.objectStore(ANALYSES).get(id))))
      needsParsing.forEach((id, i) => {
        const raw: unknown = raws[i]
        const text = typeof raw === 'string' ? raw : ''
        const analysis = text ? parseAnalysis(text, id) : null
        if (analysis) ok.push(summarize(analysis, text.length * 2))
        else unreadable.push({ status: 'unreadable', id, approxBytes: text.length * 2 })
      })
    }
    ok.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return [...ok.map((summary): IndexEntry => ({ status: 'ok', summary })), ...unreadable]
  }

  async function readRaw(id: string): Promise<unknown> {
    const db = await connect()
    return request(db.transaction(ANALYSES, 'readonly').objectStore(ANALYSES).get(id))
  }

  async function write(stores: string[], body: (tx: IDBTransaction) => void): Promise<void> {
    const db = await connect()
    const tx = db.transaction(stores, 'readwrite')
    const done = completion(tx)
    try {
      body(tx)
    } catch (error) {
      // A request that throws synchronously must not leave the other half written.
      abortQuietly(tx)
      done.catch(() => undefined)
      throw error
    }
    await done
  }

  return {
    loadIndex: () => queue(() => readIndex().catch((): IndexEntry[] => [])),

    loadAnalysis: (id) =>
      queue(async (): Promise<LoadResult> => {
        let raw: unknown
        try {
          raw = await readRaw(id)
        } catch {
          // No database at all reads like an empty one; a failing read of a present one is corrupt.
          return { ok: false, reason: factory ? 'corrupt' : 'missing' }
        }
        if (raw === undefined) return { ok: false, reason: 'missing' }
        const analysis = typeof raw === 'string' ? parseAnalysis(raw, id) : null
        return analysis ? { ok: true, analysis } : { ok: false, reason: 'corrupt' }
      }),

    saveAnalysis: (analysis) =>
      queue(async (): Promise<SaveResult> => {
        try {
          const raw = JSON.stringify(analysis)
          const summary = summarize(analysis, raw.length * 2)
          await write([ANALYSES, SUMMARIES], (tx) => {
            tx.objectStore(ANALYSES).put(raw, analysis.id)
            tx.objectStore(SUMMARIES).put(summary, analysis.id)
          })
          return { ok: true, summary }
        } catch (error) {
          return writeFailure(error)
        }
      }),

    removeAnalysis: (id) =>
      queue(async (): Promise<RemoveResult> => {
        try {
          await write([ANALYSES, SUMMARIES], (tx) => {
            tx.objectStore(ANALYSES).delete(id)
            tx.objectStore(SUMMARIES).delete(id)
          })
          return { ok: true }
        } catch (error) {
          return writeFailure(error)
        }
      }),

    clearAll: () =>
      queue(async (): Promise<ClearResult> => {
        try {
          const db = await connect()
          const removed = await request(db.transaction(ANALYSES, 'readonly').objectStore(ANALYSES).count())
          await write([ANALYSES, SUMMARIES], (tx) => {
            tx.objectStore(ANALYSES).clear()
            tx.objectStore(SUMMARIES).clear()
          })
          return { ok: true, removed }
        } catch (error) {
          return writeFailure(error)
        }
      }),

    putRaw: (id, raw) =>
      queue(async (): Promise<RemoveResult> => {
        try {
          await write([ANALYSES, SUMMARIES], (tx) => {
            tx.objectStore(ANALYSES).put(raw, id)
            tx.objectStore(SUMMARIES).delete(id)
          })
          return { ok: true }
        } catch (error) {
          return writeFailure(error)
        }
      }),

    loadRaw: (id) =>
      queue(async () => {
        try {
          const raw = await readRaw(id)
          return typeof raw === 'string' ? raw : null
        } catch {
          return null
        }
      }),

    usage: async (extraCountedBytes = 0) => {
      try {
        const estimate = await storageManager?.estimate?.()
        if (estimate && typeof estimate.usage === 'number' && typeof estimate.quota === 'number' && estimate.quota > 0) {
          return { usedBytes: estimate.usage, quotaBytes: estimate.quota, source: 'estimate' }
        }
      } catch {
        // Fall through to our own count.
      }
      const entries = await queue(() => readIndex().catch((): IndexEntry[] => []))
      const counted = entries.reduce((sum, e) => sum + (e.status === 'ok' ? e.summary.approxBytes : e.approxBytes), 0)
      return { usedBytes: counted + extraCountedBytes, quotaBytes: null, source: 'counted' }
    },

    close: () => {
      const open = connection
      connection = null
      open?.then((db) => db.close()).catch(() => undefined)
    },
  }
}

/** Whether the browser keeps this origin's data under storage pressure; never prompts. */
export async function persistenceState(manager: StorageManagerLike | null): Promise<PersistenceState> {
  if (!manager?.persisted) return 'unsupported'
  try {
    return (await manager.persisted()) ? 'persisted' : 'best-effort'
  } catch {
    return 'unsupported'
  }
}

/** Ask for persistent storage (navigator.storage.persist) unless it is already granted. */
export async function requestPersistence(manager: StorageManagerLike | null): Promise<PersistenceState> {
  if (!manager?.persist) return 'unsupported'
  try {
    if (manager.persisted && (await manager.persisted())) return 'persisted'
    return (await manager.persist()) ? 'persisted' : 'best-effort'
  } catch {
    return 'unsupported'
  }
}

// ── The app's instances (tests and DI swap them) ──────────────────────
let dbOverride: AnalysisDb | null = null
let managerOverride: StorageManagerLike | null | undefined
let cached: { factory: IDBFactory | null; db: AnalysisDb } | null = null

/** navigator.storage, or null when the browser has none (or an injected one). */
export function getStorageManager(): StorageManagerLike | null {
  if (managerOverride !== undefined) return managerOverride
  try {
    return (globalThis.navigator?.storage as StorageManagerLike | undefined) ?? null
  } catch {
    return null
  }
}

/** Test / DI hook. Pass undefined to go back to navigator.storage. */
export function setStorageManager(manager: StorageManagerLike | null | undefined): void {
  managerOverride = manager
  cached = null
}

function browserFactory(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null
  } catch {
    // Accessing indexedDB throws when site data is blocked.
    return null
  }
}

/** The app's analysis database over the browser's indexedDB (one instance per factory). */
export function getAnalysisDb(): AnalysisDb {
  if (dbOverride) return dbOverride
  const factory = browserFactory()
  if (!cached || cached.factory !== factory) {
    cached?.db.close()
    cached = { factory, db: createAnalysisDb(factory, { storageManager: getStorageManager() }) }
  }
  return cached.db
}

/** Test / DI hook. Pass null to go back to the browser's indexedDB. */
export function setAnalysisDb(db: AnalysisDb | null): void {
  dbOverride = db
}
