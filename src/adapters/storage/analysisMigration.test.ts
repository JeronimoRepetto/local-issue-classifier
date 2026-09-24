// FB IndexedDB lane — one-time move of the legacy localStorage analyses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBObjectStore } from 'fake-indexeddb'
import { migrateLegacyAnalyses } from './analysisMigration'
import { createAnalysisDb } from './analysisDb'
import type { AnalysisDb } from './analysisDb'
import { saveAnalysis as saveLegacy } from './analysisStore'
import { createAnalysis } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { STORAGE_KEYS, defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'
import { IDBFactory } from '../../../tests/fakes/idb'

function analysis(id: string, updatedAt = '2026-03-01T10:00:00Z'): Analysis {
  return {
    ...createAnalysis({
      id,
      repo: fakeRepo(),
      stateFilter: 'open',
      now: '2026-03-01T10:00:00Z',
      prefs: defaultPreferences(),
      projectContext: defaultProjectContext('acme/widgets'),
      issues: [fakeIssue(1), fakeIssue(2)],
      commentsFetched: false,
    }),
    updatedAt,
  }
}

function idsOf(entries: Awaited<ReturnType<AnalysisDb['loadIndex']>>): string[] {
  return entries.map((e) => (e.status === 'ok' ? e.summary.id : `!${e.id}`))
}

let storage: MemoryStorage
let db: AnalysisDb

beforeEach(() => {
  storage = new MemoryStorage()
  db = createAnalysisDb(new IDBFactory())
})

afterEach(() => {
  db.close()
  vi.restoreAllMocks()
})

describe('migrateLegacyAnalyses', () => {
  it('copies every readable analysis, verifies it, then deletes the legacy keys (and only those)', async () => {
    const a1 = analysis('a1', '2026-01-01T00:00:00Z')
    const a2 = analysis('a2', '2026-02-01T00:00:00Z')
    saveLegacy(storage, a1)
    saveLegacy(storage, a2)
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...defaultPreferences(), lastAnalysisId: 'a1' }))
    storage.setItem('other-app:x', 'keep')

    expect(await migrateLegacyAnalyses(storage, db)).toEqual({ moved: 2, unreadable: 0, failed: 0 })

    expect(await db.loadAnalysis('a1')).toEqual({ ok: true, analysis: a1 })
    expect(await db.loadAnalysis('a2')).toEqual({ ok: true, analysis: a2 })
    expect(idsOf(await db.loadIndex())).toEqual(['a2', 'a1'])
    expect(storage.keys().sort()).toEqual([STORAGE_KEYS.preferences, 'other-app:x'].sort())
  })

  it('keeps an unreadable legacy entry as unreadable in the new index instead of dropping it', async () => {
    saveLegacy(storage, analysis('a1'))
    storage.setItem(STORAGE_KEYS.analysis('bad'), 'garbage')

    expect(await migrateLegacyAnalyses(storage, db)).toEqual({ moved: 2, unreadable: 1, failed: 0 })
    expect(await db.loadIndex()).toEqual([
      { status: 'ok', summary: expect.objectContaining({ id: 'a1' }) },
      { status: 'unreadable', id: 'bad', approxBytes: 'garbage'.length * 2 },
    ])
    expect(await db.loadRaw('bad')).toBe('garbage')
    expect(storage.getItem(STORAGE_KEYS.analysis('bad'))).toBeNull()
  })

  it('is idempotent: a second run finds nothing to move and changes nothing', async () => {
    saveLegacy(storage, analysis('a1'))
    await migrateLegacyAnalyses(storage, db)
    const before = await db.loadIndex()
    const writes = storage.setCalls

    expect(await migrateLegacyAnalyses(storage, db)).toEqual({ moved: 0, unreadable: 0, failed: 0 })
    expect(await db.loadIndex()).toEqual(before)
    expect(storage.setCalls).toBe(writes)
  })

  it('removes a stale legacy index that has no entries left', async () => {
    storage.setItem(STORAGE_KEYS.analysesIndex, '[]')
    expect(await migrateLegacyAnalyses(storage, db)).toEqual({ moved: 0, unreadable: 0, failed: 0 })
    expect(storage.getItem(STORAGE_KEYS.analysesIndex)).toBeNull()
  })

  it('never overwrites a readable analysis already in the database (an interrupted earlier run)', async () => {
    const newer = { ...analysis('a1', '2026-06-01T00:00:00Z'), name: 'Edited after the move' }
    await db.saveAnalysis(newer)
    saveLegacy(storage, analysis('a1'))

    expect(await migrateLegacyAnalyses(storage, db)).toEqual({ moved: 1, unreadable: 0, failed: 0 })
    expect(await db.loadAnalysis('a1')).toEqual({ ok: true, analysis: newer })
    expect(storage.getItem(STORAGE_KEYS.analysis('a1'))).toBeNull()
  })

  it('keeps the legacy key (and its index) when the copy fails, so the next load retries it', async () => {
    saveLegacy(storage, analysis('a1'))
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(await migrateLegacyAnalyses(storage, db)).toEqual({ moved: 0, unreadable: 0, failed: 1 })
    expect(storage.getItem(STORAGE_KEYS.analysis('a1'))).not.toBeNull()
    expect(storage.getItem(STORAGE_KEYS.analysesIndex)).not.toBeNull()

    vi.restoreAllMocks()
    expect(await migrateLegacyAnalyses(storage, db)).toEqual({ moved: 1, unreadable: 0, failed: 0 })
    expect(storage.getItem(STORAGE_KEYS.analysis('a1'))).toBeNull()
  })
})
