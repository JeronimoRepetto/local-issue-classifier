// Task 4 — the shared storage-adapter pattern applied to Preferences: pure load/save
// over an injected Storage-like. Corrupt or unreadable data falls back to
// defaultPreferences(); a write failure is typed, never thrown.
import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS, defaultPreferences } from '../../domain/types'
import { loadPreferences, savePreferences } from './preferencesStore'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

describe('loadPreferences', () => {
  it('keeps a valid hardwareOverride and drops a malformed one (docs/hardware-fit.md)', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ hardwareOverride: { gpuId: 'nvidia-rtx-5070', vramGb: 12 } }))
    expect(loadPreferences(storage).hardwareOverride).toEqual({ gpuId: 'nvidia-rtx-5070', vramGb: 12 })
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ hardwareOverride: { gpuId: 42, vramGb: 'lots' } }))
    expect(loadPreferences(storage).hardwareOverride).toBeNull()
  })

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

  it('an entry saved before batching loads with the batching defaults', () => {
    const storage = new MemoryStorage()
    const legacy: Record<string, unknown> = { ...defaultPreferences() }
    delete legacy.classifyMode
    delete legacy.trimmingFloor
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify(legacy))
    expect(loadPreferences(storage)).toMatchObject({ classifyMode: 'batched', trimmingFloor: 'minimal' })
  })

  it('an unknown classify mode or trimming floor falls back to its default', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({ ...defaultPreferences(), classifyMode: 'turbo', trimmingFloor: 'nano' }),
    )
    expect(loadPreferences(storage)).toMatchObject({ classifyMode: 'batched', trimmingFloor: 'minimal' })
  })

  it('keeps valid batching choices', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({ ...defaultPreferences(), classifyMode: 'per-issue', trimmingFloor: 'compact' }),
    )
    expect(loadPreferences(storage)).toMatchObject({ classifyMode: 'per-issue', trimmingFloor: 'compact' })
  })

  it('defaults the local state budget to 8k tokens and clamps a stored one (docs/batching.md)', () => {
    expect(defaultPreferences().localMaxStateTokens).toBe(8_000)
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...defaultPreferences(), localMaxStateTokens: 'lots' }))
    expect(loadPreferences(storage).localMaxStateTokens).toBe(8_000)
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...defaultPreferences(), localMaxStateTokens: 12_000 }))
    expect(loadPreferences(storage).localMaxStateTokens).toBe(12_000)
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

describe('Preferences.provider (T16)', () => {
  it('defaults to the TypeSafe cloud', () => {
    expect(defaultPreferences().provider).toEqual({ kind: 'typesafe' })
    expect(loadPreferences(new MemoryStorage()).provider).toEqual({ kind: 'typesafe' })
  })

  it('loads a legacy entry without a provider as TypeSafe', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ theme: 'dark' }))
    expect(loadPreferences(storage).provider).toEqual({ kind: 'typesafe' })
  })

  it('tolerates an unknown or malformed provider value', () => {
    for (const provider of ['local', 3, null, { kind: 'mystery' }]) {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ provider }))
      expect(loadPreferences(storage).provider).toEqual({ kind: 'typesafe' })
    }
  })

  it('round-trips a local provider', () => {
    const storage = new MemoryStorage()
    const provider = { kind: 'local' as const, baseUrl: 'http://localhost:8009', model: 'kev-latest' }
    savePreferences(storage, { ...defaultPreferences(), provider })
    expect(loadPreferences(storage).provider).toEqual(provider)
  })

  it('never writes a key, even if one is smuggled into the provider object', () => {
    const storage = new MemoryStorage()
    const provider = { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest', apiKey: 'local-secret-9f' }
    savePreferences(storage, { ...defaultPreferences(), provider } as never)
    expect(storage.getItem(STORAGE_KEYS.preferences)).not.toContain('local-secret-9f')
  })
})
