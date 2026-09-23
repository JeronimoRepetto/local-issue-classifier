// Preferences persistence (SPEC.md §3, following the §4.8 store pattern): pure
// load/save over an injected Storage-like. Corrupt JSON, a non-object value,
// or an unreadable storage all fall back to defaultPreferences() rather than
// throwing. A write failure is typed, never thrown, and nothing is evicted.
import { STORAGE_KEYS, defaultPreferences } from '../../domain/types'
import type { Preferences } from '../../domain/types'
import type { StorageLike } from './analysisStore'

export type SavePreferencesResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' }

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: unknown; code?: unknown }
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Defaults merged with whatever the stored object actually has: a missing or
 *  legacy field falls back to its default rather than losing the rest. */
export function loadPreferences(storage: StorageLike): Preferences {
  try {
    const raw = storage.getItem(STORAGE_KEYS.preferences)
    if (raw === null) return defaultPreferences()
    const parsed: unknown = JSON.parse(raw)
    if (!isObject(parsed)) return defaultPreferences()
    return { ...defaultPreferences(), ...parsed } as Preferences
  } catch {
    return defaultPreferences()
  }
}

export function savePreferences(storage: StorageLike, prefs: Preferences): SavePreferencesResult {
  try {
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify(prefs))
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable' }
  }
}
