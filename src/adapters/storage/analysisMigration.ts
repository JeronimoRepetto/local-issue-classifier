// One-time move of saved analyses from the legacy localStorage layout
// (`local-issue-classifier:analyses:v1` + `local-issue-classifier:analysis:v1:<id>`)
// into IndexedDB (analysisDb.ts). Runs on every boot and is idempotent: once the
// legacy keys are gone there is nothing left to move.
//
// Nothing is lost on the way: each entry is written, read back and compared
// BEFORE its legacy key is deleted. A readable entry becomes a normal record;
// an unreadable one is copied as-is so Home still lists it as unreadable
// (Delete only). A failed copy keeps the legacy key for the next boot.
// Preferences, lastAnalysisId and the secrets entry are never touched.
import { STORAGE_KEYS } from '../../domain/types'
import type { AnalysisDb } from './analysisDb'
import { parseAnalysis } from './analysisStore'
import type { StorageLike } from './analysisStore'

export interface MigrationResult {
  /** Entries now in IndexedDB whose legacy key was deleted (readable or not). */
  moved: number
  /** Of `moved`, how many were unreadable and are listed as such. */
  unreadable: number
  /** Entries that could not be copied; their legacy keys stay for a later retry. */
  failed: number
}

const LEGACY_PREFIX = STORAGE_KEYS.analysis('')

function legacyIds(storage: StorageLike): string[] {
  const ids: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key !== null && key.startsWith(LEGACY_PREFIX)) ids.push(key.slice(LEGACY_PREFIX.length))
  }
  return ids
}

/** Copy one legacy entry and confirm the database now holds it. */
async function copyVerified(db: AnalysisDb, id: string, raw: string): Promise<'readable' | 'unreadable' | 'failed'> {
  const legacy = parseAnalysis(raw, id)
  const existing = await db.loadAnalysis(id)
  if (existing.ok) return 'readable' // An interrupted earlier run already moved it: keep the database copy.

  if (legacy) {
    const saved = await db.saveAnalysis(legacy)
    if (!saved.ok) return 'failed'
    const back = await db.loadAnalysis(id)
    return back.ok && JSON.stringify(back.analysis) === JSON.stringify(legacy) ? 'readable' : 'failed'
  }
  const put = await db.putRaw(id, raw)
  if (!put.ok) return 'failed'
  return (await db.loadRaw(id)) === raw ? 'unreadable' : 'failed'
}

export async function migrateLegacyAnalyses(storage: StorageLike, db: AnalysisDb): Promise<MigrationResult> {
  const result: MigrationResult = { moved: 0, unreadable: 0, failed: 0 }
  try {
    for (const id of legacyIds(storage)) {
      const raw = storage.getItem(STORAGE_KEYS.analysis(id))
      if (raw === null) continue
      const outcome = await copyVerified(db, id, raw)
      if (outcome === 'failed') {
        result.failed++
        continue
      }
      storage.removeItem(STORAGE_KEYS.analysis(id))
      result.moved++
      if (outcome === 'unreadable') result.unreadable++
    }
    if (legacyIds(storage).length === 0 && storage.getItem(STORAGE_KEYS.analysesIndex) !== null) {
      storage.removeItem(STORAGE_KEYS.analysesIndex)
    }
  } catch {
    // A blocked localStorage: nothing can be read or deleted, so nothing moved.
  }
  return result
}
