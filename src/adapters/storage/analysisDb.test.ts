// FB IndexedDB lane — the async analysis store over an injected IDBFactory.
// Uses fake-indexeddb (devDependency only) through tests/fakes/idb.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBObjectStore } from 'fake-indexeddb'
import { ANALYSIS_STORES, createAnalysisDb, persistenceState, requestPersistence } from './analysisDb'
import type { AnalysisDb, StorageManagerLike } from './analysisDb'
import { createAnalysis, summarize } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { IDBFactory, rawDump, rawPut } from '../../../tests/fakes/idb'

function analysis(id: string, updatedAt = '2026-03-01T10:00:00Z', repo = 'widgets'): Analysis {
  return {
    ...createAnalysis({
      id,
      repo: fakeRepo({ fullName: `acme/${repo}`, ref: { owner: 'acme', repo } }),
      stateFilter: 'open',
      now: '2026-03-01T10:00:00Z',
      prefs: defaultPreferences(),
      projectContext: defaultProjectContext(`acme/${repo}`),
      issues: [fakeIssue(1), fakeIssue(2)],
      commentsFetched: false,
    }),
    updatedAt,
  }
}

let factory: IDBFactory
let db: AnalysisDb

beforeEach(() => {
  factory = new IDBFactory()
  db = createAnalysisDb(factory)
})

afterEach(() => {
  db.close()
  vi.restoreAllMocks()
})

describe('saveAnalysis / loadAnalysis', () => {
  it('round-trips an analysis and stores it as the same versioned JSON text as before', async () => {
    const a = analysis('a1')
    const result = await db.saveAnalysis(a)
    expect(result).toEqual({ ok: true, summary: summarize(a, JSON.stringify(a).length * 2) })
    expect(await db.loadAnalysis('a1')).toEqual({ ok: true, analysis: a })

    const records = await rawDump(factory)
    const stored = records.find((r) => r.store === ANALYSIS_STORES.analyses && r.key === 'a1')
    expect(stored?.value).toBe(JSON.stringify(a))
    expect(JSON.parse(stored?.value as string)).toMatchObject({ schemaVersion: 1, id: 'a1' })
  })

  it('reports a missing id as missing and a garbage or unknown-schema record as corrupt', async () => {
    expect(await db.loadAnalysis('nope')).toEqual({ ok: false, reason: 'missing' })
    await rawPut(factory, ANALYSIS_STORES.analyses, 'bad', 'garbage')
    await rawPut(factory, ANALYSIS_STORES.analyses, 'future', JSON.stringify({ ...analysis('future'), schemaVersion: 2 }))
    await rawPut(factory, ANALYSIS_STORES.analyses, 'object', { not: 'a string' })
    expect(await db.loadAnalysis('bad')).toEqual({ ok: false, reason: 'corrupt' })
    expect(await db.loadAnalysis('future')).toEqual({ ok: false, reason: 'corrupt' })
    expect(await db.loadAnalysis('object')).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('survives a reload: a new adapter over the same factory sees the data', async () => {
    await db.saveAnalysis(analysis('a1'))
    db.close()
    const reopened = createAnalysisDb(factory)
    expect(await reopened.loadAnalysis('a1')).toMatchObject({ ok: true, analysis: { id: 'a1' } })
    reopened.close()
  })

  it('applies writes in call order, so the last save wins', async () => {
    const writes = [
      db.saveAnalysis({ ...analysis('a1'), name: 'one' }),
      db.saveAnalysis({ ...analysis('a1'), name: 'two' }),
      db.saveAnalysis({ ...analysis('a1'), name: 'three' }),
    ]
    await Promise.all(writes)
    expect(await db.loadAnalysis('a1')).toMatchObject({ ok: true, analysis: { name: 'three' } })
  })
})

describe('loadIndex', () => {
  it('lists summaries newest first and upserts on re-save', async () => {
    await db.saveAnalysis(analysis('old', '2026-01-01T00:00:00Z'))
    await db.saveAnalysis(analysis('new', '2026-02-01T00:00:00Z'))
    await db.saveAnalysis({ ...analysis('old', '2026-01-01T00:00:00Z'), name: 'Renamed' })
    const index = await db.loadIndex()
    expect(index.map((e) => (e.status === 'ok' ? e.summary.id : e.id))).toEqual(['new', 'old'])
    expect(index[1]).toMatchObject({ status: 'ok', summary: { name: 'Renamed' } })
  })

  it('recovers a record without a summary, lists an unparseable one as unreadable, drops orphan summaries', async () => {
    await db.saveAnalysis(analysis('a1'))
    const recovered = analysis('lost-summary', '2026-05-01T00:00:00Z')
    await rawPut(factory, ANALYSIS_STORES.analyses, 'lost-summary', JSON.stringify(recovered))
    await rawPut(factory, ANALYSIS_STORES.analyses, 'bad', 'garbage')
    await rawPut(factory, ANALYSIS_STORES.summaries, 'orphan', summarize(analysis('orphan')))

    const index = await db.loadIndex()
    expect(index).toEqual([
      { status: 'ok', summary: summarize(recovered, JSON.stringify(recovered).length * 2) },
      { status: 'ok', summary: expect.objectContaining({ id: 'a1' }) },
      { status: 'unreadable', id: 'bad', approxBytes: 'garbage'.length * 2 },
    ])
  })
})

describe('removeAnalysis / clearAll', () => {
  it('remove deletes the record and its summary, readable or not', async () => {
    await db.saveAnalysis(analysis('a1'))
    await db.saveAnalysis(analysis('a2'))
    await rawPut(factory, ANALYSIS_STORES.analyses, 'bad', 'garbage')
    expect(await db.removeAnalysis('a1')).toEqual({ ok: true })
    expect(await db.removeAnalysis('bad')).toEqual({ ok: true })
    expect((await db.loadIndex()).map((e) => (e.status === 'ok' ? e.summary.id : e.id))).toEqual(['a2'])
    expect((await rawDump(factory)).map((r) => r.key)).toEqual(['a2', 'a2'])
  })

  it('clearAll empties every store and reports how many analyses it removed', async () => {
    await db.saveAnalysis(analysis('a1'))
    await db.saveAnalysis(analysis('a2'))
    expect(await db.clearAll()).toEqual({ ok: true, removed: 2 })
    expect(await rawDump(factory)).toEqual([])
    expect(await db.loadIndex()).toEqual([])
  })
})

describe('raw records (migration support)', () => {
  it('putRaw stores text as-is and loadRaw reads it back', async () => {
    expect(await db.putRaw('bad', 'garbage')).toEqual({ ok: true })
    expect(await db.loadRaw('bad')).toBe('garbage')
    expect(await db.loadRaw('nope')).toBeNull()
  })
})

describe('write failures are typed, never thrown', () => {
  it('maps a QuotaExceededError to quota and leaves nothing half-written', async () => {
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === ANALYSIS_STORES.summaries) throw new DOMException('full', 'QuotaExceededError')
      return put.apply(this, args as Parameters<typeof put>)
    })
    expect(await db.saveAnalysis(analysis('a1'))).toEqual({ ok: false, reason: 'quota' })
    vi.restoreAllMocks()
    expect(await rawDump(factory)).toEqual([])
  })

  it('maps an aborted transaction without a quota error to unavailable', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore) {
      this.transaction.abort()
      throw new DOMException('aborted', 'TransactionInactiveError')
    })
    expect(await db.saveAnalysis(analysis('a1'))).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('without a database factory, reads are empty and writes are unavailable', async () => {
    const none = createAnalysisDb(null)
    expect(await none.loadIndex()).toEqual([])
    expect(await none.loadAnalysis('a1')).toEqual({ ok: false, reason: 'missing' })
    expect(await none.saveAnalysis(analysis('a1'))).toEqual({ ok: false, reason: 'unavailable' })
    expect(await none.removeAnalysis('a1')).toEqual({ ok: false, reason: 'unavailable' })
    expect(await none.clearAll()).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('a factory whose open() fails behaves as unavailable, and a later call retries the open', async () => {
    const failing = {
      open: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    } as unknown as IDBFactory
    const blocked = createAnalysisDb(failing)
    expect(await blocked.saveAnalysis(analysis('a1'))).toEqual({ ok: false, reason: 'unavailable' })
    expect(await blocked.saveAnalysis(analysis('a1'))).toEqual({ ok: false, reason: 'unavailable' })
    expect(failing.open).toHaveBeenCalledTimes(2)
  })
})

describe('usage', () => {
  it('uses navigator.storage.estimate() when it reports usage and quota', async () => {
    const manager: StorageManagerLike = { estimate: async () => ({ usage: 12_345, quota: 50_000_000 }) }
    const withEstimate = createAnalysisDb(factory, { storageManager: manager })
    expect(await withEstimate.usage()).toEqual({ usedBytes: 12_345, quotaBytes: 50_000_000, source: 'estimate' })
    withEstimate.close()
  })

  it('falls back to summing serialized sizes (plus extra bytes) with an unknown quota', async () => {
    const a = analysis('a1')
    await db.saveAnalysis(a)
    await rawPut(factory, ANALYSIS_STORES.analyses, 'bad', 'garbage')
    const expected = JSON.stringify(a).length * 2 + 'garbage'.length * 2 + 100
    expect(await db.usage(100)).toEqual({ usedBytes: expected, quotaBytes: null, source: 'counted' })

    const broken = createAnalysisDb(factory, { storageManager: { estimate: async () => Promise.reject(new Error('x')) } })
    expect(await broken.usage(100)).toEqual({ usedBytes: expected, quotaBytes: null, source: 'counted' })
    broken.close()
  })
})

describe('persistence (navigator.storage.persist)', () => {
  it('requests persistence only when not already persisted, and reports the result', async () => {
    const persist = vi.fn(async () => true)
    expect(await requestPersistence({ persisted: async () => false, persist })).toBe('persisted')
    expect(persist).toHaveBeenCalledTimes(1)

    const alreadyPersist = vi.fn(async () => true)
    expect(await requestPersistence({ persisted: async () => true, persist: alreadyPersist })).toBe('persisted')
    expect(alreadyPersist).not.toHaveBeenCalled()

    expect(await requestPersistence({ persisted: async () => false, persist: async () => false })).toBe('best-effort')
    expect(await requestPersistence(null)).toBe('unsupported')
    expect(await requestPersistence({ persist: async () => Promise.reject(new Error('x')) })).toBe('unsupported')
  })

  it('persistenceState reads without prompting', async () => {
    const persist = vi.fn(async () => true)
    expect(await persistenceState({ persisted: async () => true, persist })).toBe('persisted')
    expect(await persistenceState({ persisted: async () => false, persist })).toBe('best-effort')
    expect(await persistenceState({})).toBe('unsupported')
    expect(persist).not.toHaveBeenCalled()
  })
})
