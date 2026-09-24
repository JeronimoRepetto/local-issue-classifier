// Legacy analysis persistence: pure functions over an injected
// Storage, following the house style of load/save/upsert/remove keyed by id.
// Saved analyses now live in IndexedDB (analysisDb.ts); this module remains the
// reader of the old localStorage layout for the one-time migration
// (analysisMigration.ts), and owns the shared parsing, result types and the
// app-prefixed localStorage sweep used by "Clear all local data".
// One Analysis per key plus a small AnalysisSummary[] index. No function throws:
// every result is typed, and nothing is ever evicted to make room.
import { summarize } from '../../domain/analysis'
import type { Analysis, AnalysisSummary } from '../../domain/types'
import { STORAGE_KEYS, STORAGE_PREFIX, defaultPreferences, defaultWorkingState } from '../../domain/types'

export type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>

/** The only schema this build can read. Bump it (and add a migration) when the stored shape changes. */
export const ANALYSIS_SCHEMA_VERSION = 1

/** A Home list entry: a readable summary, or an entry that can only be deleted. */
export type IndexEntry =
  | { status: 'ok'; summary: AnalysisSummary }
  | { status: 'unreadable'; id: string; approxBytes: number }

export type LoadResult = { ok: true; analysis: Analysis } | { ok: false; reason: 'missing' | 'corrupt' }

export type WriteFailure = { ok: false; reason: 'quota' | 'unavailable' }
export type SaveResult = { ok: true; summary: AnalysisSummary } | WriteFailure
export type RemoveResult = { ok: true } | WriteFailure
export type ClearResult = { ok: true; removed: number } | WriteFailure

const ANALYSIS_KEY_PREFIX = STORAGE_KEYS.analysis('')

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: unknown; code?: unknown }
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014
}

function writeFailure(error: unknown): WriteFailure {
  return { ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable' }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Snapshot of all keys first: removing while iterating shifts indices. */
function allKeys(storage: StorageLike): string[] {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key !== null) keys.push(key)
  }
  return keys
}

/** The stored JSON text back to an Analysis, or null when it is not one this build can read. */
export function parseAnalysis(raw: string, id: string): Analysis | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(parsed)) return null
  if (parsed.schemaVersion !== ANALYSIS_SCHEMA_VERSION || parsed.id !== id) return null
  if (!Array.isArray(parsed.rows) || !isObject(parsed.repo) || typeof parsed.repo.fullName !== 'string') return null
  // Backward compatibility: working-state fields added later fall back to defaults.
  const working = { ...defaultWorkingState(defaultPreferences()), ...(isObject(parsed.working) ? parsed.working : {}) }
  return { ...(parsed as unknown as Analysis), working }
}

function isSummary(value: unknown): value is AnalysisSummary {
  return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' && isObject(value.counts)
}

/** The stored index, or null when it is absent or corrupt. */
function readStoredIndex(storage: StorageLike): AnalysisSummary[] | null {
  const raw = storage.getItem(STORAGE_KEYS.analysesIndex)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every(isSummary) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The Home list. Index rows whose entry is gone are dropped; entries missing
 * from the index (a failed index write, or a corrupt index) are recovered by
 * parsing them, and listed as unreadable when that fails. Newest first.
 */
export function loadIndex(storage: StorageLike): IndexEntry[] {
  try {
    const entryIds = allKeys(storage)
      .filter((k) => k.startsWith(ANALYSIS_KEY_PREFIX))
      .map((k) => k.slice(ANALYSIS_KEY_PREFIX.length))
    const present = new Set(entryIds)
    const indexed = (readStoredIndex(storage) ?? []).filter((s) => present.has(s.id))
    const indexedIds = new Set(indexed.map((s) => s.id))

    const ok: IndexEntry[] = indexed.map((summary) => ({ status: 'ok', summary }))
    const unreadable: IndexEntry[] = []
    for (const id of entryIds) {
      if (indexedIds.has(id)) continue
      const raw = storage.getItem(STORAGE_KEYS.analysis(id)) ?? ''
      const analysis = parseAnalysis(raw, id)
      if (analysis) ok.push({ status: 'ok', summary: summarize(analysis, raw.length * 2) })
      else unreadable.push({ status: 'unreadable', id, approxBytes: raw.length * 2 })
    }
    ok.sort((a, b) =>
      a.status === 'ok' && b.status === 'ok' ? b.summary.updatedAt.localeCompare(a.summary.updatedAt) : 0,
    )
    return [...ok, ...unreadable]
  } catch {
    return []
  }
}

function summariesOf(entries: IndexEntry[]): AnalysisSummary[] {
  return entries.flatMap((e) => (e.status === 'ok' ? [e.summary] : []))
}

export function loadAnalysis(storage: StorageLike, id: string): LoadResult {
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEYS.analysis(id))
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (raw === null) return { ok: false, reason: 'missing' }
  const analysis = parseAnalysis(raw, id)
  return analysis ? { ok: true, analysis } : { ok: false, reason: 'corrupt' }
}

/** Write the entry, then upsert its summary into the index. */
export function saveAnalysis(storage: StorageLike, analysis: Analysis): SaveResult {
  try {
    const raw = JSON.stringify(analysis)
    storage.setItem(STORAGE_KEYS.analysis(analysis.id), raw)
    const summary = summarize(analysis, raw.length * 2)
    const summaries = summariesOf(loadIndex(storage))
    const i = summaries.findIndex((s) => s.id === summary.id)
    if (i >= 0) summaries[i] = summary
    else summaries.push(summary)
    storage.setItem(STORAGE_KEYS.analysesIndex, JSON.stringify(summaries))
    return { ok: true, summary }
  } catch (error) {
    return writeFailure(error)
  }
}

/** Delete the entry (readable or not) and its index row. */
export function removeAnalysis(storage: StorageLike, id: string): RemoveResult {
  try {
    storage.removeItem(STORAGE_KEYS.analysis(id))
    const summaries = summariesOf(loadIndex(storage)).filter((s) => s.id !== id)
    storage.setItem(STORAGE_KEYS.analysesIndex, JSON.stringify(summaries))
    return { ok: true }
  } catch (error) {
    return writeFailure(error)
  }
}

/** Remove every key starting with STORAGE_PREFIX (preferences and analyses); nothing else. */
export function clearAll(storage: StorageLike): ClearResult {
  try {
    const keys = allKeys(storage).filter((k) => k.startsWith(STORAGE_PREFIX))
    for (const key of keys) storage.removeItem(key)
    return { ok: true, removed: keys.length }
  } catch (error) {
    return writeFailure(error)
  }
}

/** Bytes used under the prefix, counted as UTF-16 (2 bytes per code unit) for key and value. */
export function usage(storage: StorageLike): number {
  try {
    let bytes = 0
    for (const key of allKeys(storage)) {
      if (!key.startsWith(STORAGE_PREFIX)) continue
      bytes += (key.length + (storage.getItem(key) ?? '').length) * 2
    }
    return bytes
  } catch {
    return 0
  }
}
