// Preferences persistence (SPEC.md §3, following the §4.8 store pattern): pure
// load/save over an injected Storage-like. Corrupt JSON, a non-object value,
// or an unreadable storage all fall back to defaultPreferences() rather than
// throwing. A write failure is typed, never thrown, and nothing is evicted.
import { STORAGE_KEYS, defaultPreferences } from '../../domain/types'
import type { Preferences } from '../../domain/types'
import { TRIMMING_PROFILE_IDS } from '../../domain/jevBatchState'
import { sanitizeHardwareOverride } from '../../domain/hardware'
import type { StorageLike } from './analysisStore'

const CLASSIFY_MODES: readonly string[] = ['batched', 'per-issue']

/** Enumerated fields read from storage must still be one of their values. */
function sanitize(prefs: Preferences): Preferences {
  const defaults = defaultPreferences()
  return {
    ...prefs,
    classifyMode: CLASSIFY_MODES.includes(prefs.classifyMode) ? prefs.classifyMode : defaults.classifyMode,
    trimmingFloor: (TRIMMING_PROFILE_IDS as readonly string[]).includes(prefs.trimmingFloor)
      ? prefs.trimmingFloor
      : defaults.trimmingFloor,
    hardwareOverride: sanitizeHardwareOverride(prefs.hardwareOverride),
  }
}

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
    return sanitize({ ...defaultPreferences(), ...parsed } as Preferences)
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
