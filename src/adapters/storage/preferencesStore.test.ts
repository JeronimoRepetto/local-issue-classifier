// Task 4 — SPEC.md §3 / §4.8 pattern applied to Preferences: pure load/save
// over an injected Storage-like. Corrupt or unreadable data falls back to
// defaultPreferences(); a write failure is typed, never thrown.
import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS, defaultPreferences } from '../../domain/types'
import { loadPreferences, savePreferences } from './preferencesStore'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

describe('loadPreferences', () => {
  it('returns defaults when nothing is stored', () => {
    const storage = new MemoryStorage()
    expect(loadPreferences(storage)).toEqual(defaultPreferences())
  })

  it('returns defaults when the stored JSON is corrupt', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.preferences, '{not json')
    expect(loadPreferences(storage)).toEqual(defaultPreferences())
  })

  it('returns defaults when the stored value is not an object', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.preferences, '"just a string"')
    expect(loadPreferences(storage)).toEqual(defaultPreferences())
  })

  it('returns defaults when reading the storage itself throws', () => {
    const storage = new MemoryStorage()
    storage.getItem = () => {
      throw new Error('blocked')
    }
    expect(loadPreferences(storage)).toEqual(defaultPreferences())
  })

  it('merges stored fields over defaults, so a partial or legacy entry still loads', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ theme: 'dark', maxCommentsPerIssue: 3 }))
    const prefs = loadPreferences(storage)
    expect(prefs.theme).toBe('dark')
    expect(prefs.maxCommentsPerIssue).toBe(3)
    expect(prefs.concurrency).toBe(defaultPreferences().concurrency)
    expect(prefs.onboarding).toEqual(defaultPreferences().onboarding)
  })
})

describe('savePreferences', () => {
  it('round-trips through loadPreferences', () => {
    const storage = new MemoryStorage()
    const prefs = { ...defaultPreferences(), theme: 'dark' as const, lastAnalysisId: 'a1' }
    expect(savePreferences(storage, prefs)).toEqual({ ok: true })
    expect(loadPreferences(storage)).toEqual(prefs)
  })

  it('preserves lastAnalysisId across a later save of an unrelated field', () => {
    const storage = new MemoryStorage()
    savePreferences(storage, { ...defaultPreferences(), lastAnalysisId: 'a1' })

    const withTheme = { ...loadPreferences(storage), theme: 'dark' as const }
    savePreferences(storage, withTheme)

    expect(loadPreferences(storage).lastAnalysisId).toBe('a1')
    expect(loadPreferences(storage).theme).toBe('dark')
  })

  it('surfaces a quota error without throwing', () => {
    const storage = new MemoryStorage()
    storage.quotaBytes = 10
    expect(savePreferences(storage, defaultPreferences())).toEqual({ ok: false, reason: 'quota' })
  })

  it('surfaces a non-quota write failure as unavailable', () => {
    const storage = new MemoryStorage()
    storage.setItem = () => {
      throw new Error('disk error')
    }
    expect(savePreferences(storage, defaultPreferences())).toEqual({ ok: false, reason: 'unavailable' })
  })
})
