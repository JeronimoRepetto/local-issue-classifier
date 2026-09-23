// Task 7 — SPEC.md §4.8: analysis store over an injected Storage.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAll,
  loadAnalysis,
  loadIndex,
  removeAnalysis,
  saveAnalysis,
  usage,
} from './analysisStore'
import { createAnalysis, summarize } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { STORAGE_KEYS, defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

function analysis(id: string, repo = 'widgets'): Analysis {
  return createAnalysis({
    id,
    repo: fakeRepo({ fullName: `acme/${repo}`, ref: { owner: 'acme', repo } }),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext(`acme/${repo}`),
    issues: [fakeIssue(1), fakeIssue(2)],
    commentsFetched: false,
  })
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
})

describe('saveAnalysis / loadAnalysis', () => {
  it('round-trips an analysis under its own key and upserts the index', () => {
    const a = analysis('a1')
    const result = saveAnalysis(storage, a)
    expect(result.ok).toBe(true)
    expect(storage.getItem(STORAGE_KEYS.analysis('a1'))).not.toBeNull()
    expect(loadAnalysis(storage, 'a1')).toEqual({ ok: true, analysis: a })

    const index = loadIndex(storage)
    expect(index).toHaveLength(1)
    expect(index[0]).toMatchObject({ status: 'ok', summary: { ...summarize(a), approxBytes: expect.any(Number) } })
  })

  it('upserts: saving again replaces the index row instead of adding one', () => {
    saveAnalysis(storage, analysis('a1'))
    saveAnalysis(storage, { ...analysis('a1'), name: 'Renamed' })
    saveAnalysis(storage, analysis('a2', 'gadgets'))
    const index = loadIndex(storage)
    expect(index).toHaveLength(2)
    expect(index.find((e) => e.status === 'ok' && e.summary.id === 'a1')).toMatchObject({ summary: { name: 'Renamed' } })
  })

  it('reports approxBytes as the UTF-16 size of the serialized entry', () => {
    const result = saveAnalysis(storage, analysis('a1'))
    const raw = storage.getItem(STORAGE_KEYS.analysis('a1')) as string
    expect(result).toMatchObject({ ok: true, summary: { approxBytes: raw.length * 2 } })
  })

  it('returns missing for an unknown id', () => {
    expect(loadAnalysis(storage, 'nope')).toEqual({ ok: false, reason: 'missing' })
  })

  it('treats corrupt JSON as corrupt, without throwing', () => {
    storage.setItem(STORAGE_KEYS.analysis('bad'), '{not json')
    expect(loadAnalysis(storage, 'bad')).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('treats an unknown schemaVersion as corrupt', () => {
    storage.setItem(STORAGE_KEYS.analysis('v9'), JSON.stringify({ ...analysis('v9'), schemaVersion: 9 }))
    expect(loadAnalysis(storage, 'v9')).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('fills working-state fields missing from an older save with defaults', () => {
    const a = analysis('old')
    const { priorityWeights: _omit, ...legacyWorking } = a.working
    storage.setItem(STORAGE_KEYS.analysis('old'), JSON.stringify({ ...a, working: legacyWorking }))
    const loaded = loadAnalysis(storage, 'old')
    expect(loaded.ok && loaded.analysis.working.priorityWeights).toEqual({
      criticality: 40,
      relevance: 30,
      complexity: 15,
      effort: 15,
    })
  })
})

describe('quota', () => {
  it('returns {ok:false, reason:"quota"} and evicts nothing', () => {
    saveAnalysis(storage, analysis('a1'))
    const before = new Map(storage.keys().map((k) => [k, storage.getItem(k)]))
    storage.quotaBytes = usage(storage) + 10
    const result = saveAnalysis(storage, analysis('a2', 'gadgets'))
    expect(result).toEqual({ ok: false, reason: 'quota' })
    expect(new Map(storage.keys().map((k) => [k, storage.getItem(k)]))).toEqual(before)
    expect(loadAnalysis(storage, 'a1').ok).toBe(true)
  })

  it('reports quota when the entry fits but the index write does not', () => {
    const a = analysis('a1')
    const entry = JSON.stringify(a)
    storage.quotaBytes = (STORAGE_KEYS.analysis('a1').length + entry.length) * 2 + 20
    expect(saveAnalysis(storage, a)).toEqual({ ok: false, reason: 'quota' })
    // The entry that was written is recovered by the index scan, never lost.
    storage.quotaBytes = Infinity
    expect(loadIndex(storage)).toMatchObject([{ status: 'ok', summary: { id: 'a1' } }])
  })
})

describe('loadIndex', () => {
  it('is empty for an empty storage', () => {
    expect(loadIndex(storage)).toEqual([])
  })

  it('lists an orphaned corrupt entry as unreadable', () => {
    saveAnalysis(storage, analysis('a1'))
    storage.setItem(STORAGE_KEYS.analysis('bad'), 'garbage')
    const index = loadIndex(storage)
    expect(index).toHaveLength(2)
    expect(index).toContainEqual({ status: 'unreadable', id: 'bad', approxBytes: expect.any(Number) })
  })

  it('rebuilds from the entries when the index itself is corrupt', () => {
    saveAnalysis(storage, analysis('a1'))
    storage.setItem(STORAGE_KEYS.analysesIndex, '[[[')
    expect(loadIndex(storage)).toMatchObject([{ status: 'ok', summary: { id: 'a1' } }])
  })

  it('drops index rows whose entry no longer exists', () => {
    saveAnalysis(storage, analysis('a1'))
    storage.removeItem(STORAGE_KEYS.analysis('a1'))
    expect(loadIndex(storage)).toEqual([])
  })
})

describe('removeAnalysis / clearAll / usage', () => {
  it('removes the entry and its index row only', () => {
    saveAnalysis(storage, analysis('a1'))
    saveAnalysis(storage, analysis('a2', 'gadgets'))
    expect(removeAnalysis(storage, 'a1')).toEqual({ ok: true })
    expect(storage.getItem(STORAGE_KEYS.analysis('a1'))).toBeNull()
    expect(loadIndex(storage)).toMatchObject([{ status: 'ok', summary: { id: 'a2' } }])
  })

  it('removes an unreadable entry', () => {
    storage.setItem(STORAGE_KEYS.analysis('bad'), 'garbage')
    removeAnalysis(storage, 'bad')
    expect(loadIndex(storage)).toEqual([])
  })

  it('clearAll removes only keys with the app prefix', () => {
    saveAnalysis(storage, analysis('a1'))
    storage.setItem(STORAGE_KEYS.preferences, '{}')
    storage.setItem('other-app:data', 'keep')
    storage.setItem('issue-criticityX', 'keep') // no colon: not our prefix
    expect(clearAll(storage)).toEqual({ ok: true, removed: 3 })
    expect(storage.keys().sort()).toEqual(['issue-criticityX', 'other-app:data'])
  })

  it('usage counts UTF-16 bytes of prefixed keys only', () => {
    storage.setItem('other-app:data', 'x'.repeat(100))
    expect(usage(storage)).toBe(0)
    storage.setItem('issue-criticity:k', 'abc')
    expect(usage(storage)).toBe(('issue-criticity:k'.length + 3) * 2)
  })
})

describe('never throws', () => {
  it('survives a storage whose every method throws', () => {
    const broken = {
      get length(): number {
        throw new Error('denied')
      },
      key: () => {
        throw new Error('denied')
      },
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadIndex(broken)).toEqual([])
    expect(loadAnalysis(broken, 'x')).toEqual({ ok: false, reason: 'corrupt' })
    expect(saveAnalysis(broken, analysis('a1'))).toEqual({ ok: false, reason: 'unavailable' })
    expect(removeAnalysis(broken, 'a1')).toEqual({ ok: false, reason: 'unavailable' })
    expect(clearAll(broken)).toEqual({ ok: false, reason: 'unavailable' })
    expect(usage(broken)).toBe(0)
  })
})
