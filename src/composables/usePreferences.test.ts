// Task 4 — SPEC.md §3 Preferences, persisted through preferencesStore. Each
// test re-imports the module after vi.resetModules() so the singleton reloads
// from a fresh fake Storage, the same pattern useAnalysis.test.ts uses.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import { STORAGE_KEYS, defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

type PreferencesModule = typeof import('./usePreferences')
type AnalysisModule = typeof import('./useAnalysis')

let storage: MemoryStorage

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  const { setAppStorage } = await import('../adapters/storage/appStorage')
  setAppStorage(storage)
})

describe('usePreferences singleton', () => {
  it('loads defaults when nothing is stored, and returns the same state on every call', async () => {
    const mod: PreferencesModule = await import('./usePreferences')
    expect(mod.usePreferences().state).toBe(mod.usePreferences().state)
    expect(mod.usePreferences().state.theme).toBe('system')
  })

  it('loads previously saved preferences at import time', async () => {
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ ...defaultPreferences(), theme: 'dark' }))
    const mod: PreferencesModule = await import('./usePreferences')
    expect(mod.usePreferences().state.theme).toBe('dark')
  })

  it('a corrupt stored entry loads as defaults instead of throwing', async () => {
    storage.setItem(STORAGE_KEYS.preferences, '{not json')
    const mod: PreferencesModule = await import('./usePreferences')
    expect(mod.usePreferences().state).toEqual(defaultPreferences())
  })

  it('update() persists a patch and merges it into the reactive state', async () => {
    const mod: PreferencesModule = await import('./usePreferences')
    const result = mod.usePreferences().update({ theme: 'dark' })
    expect(result).toEqual({ ok: true })
    expect(mod.usePreferences().state.theme).toBe('dark')
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).theme).toBe('dark')
  })

  it('dismissKeysBanner persists keysBannerDismissed', async () => {
    const mod: PreferencesModule = await import('./usePreferences')
    mod.usePreferences().dismissKeysBanner()
    expect(mod.usePreferences().state.keysBannerDismissed).toBe(true)
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).keysBannerDismissed).toBe(true)
  })

  it('setHardwareOverride persists only the manual override (docs/hardware-fit.md)', async () => {
    const mod: PreferencesModule = await import('./usePreferences')
    mod.usePreferences().setHardwareOverride({ gpuId: 'apple-m2-pro', vramGb: 32 })
    expect(mod.usePreferences().state.hardwareOverride).toEqual({ gpuId: 'apple-m2-pro', vramGb: 32 })
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).hardwareOverride).toEqual({
      gpuId: 'apple-m2-pro',
      vramGb: 32,
    })
    mod.usePreferences().setHardwareOverride(null)
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string).hardwareOverride).toBeNull()
  })

  it('completeOnboardingStep persists a single onboarding flag', async () => {
    const mod: PreferencesModule = await import('./usePreferences')
    mod.usePreferences().completeOnboardingStep('keys')
    expect(mod.usePreferences().state.onboarding).toEqual({ keys: true, repo: false, classify: false })
  })

  it('surfaces a quota failure through status, without losing the in-memory change', async () => {
    const mod: PreferencesModule = await import('./usePreferences')
    storage.quotaBytes = 10
    const result = mod.usePreferences().update({ theme: 'dark' })
    expect(result).toEqual({ ok: false, reason: 'quota' })
    expect(mod.usePreferences().state.theme).toBe('dark')
    expect(mod.usePreferences().status.save).toBe('failed')
    expect(mod.usePreferences().status.failure).toBe('quota')
  })

  it('retrySave recovers after the quota pressure is gone', async () => {
    const mod: PreferencesModule = await import('./usePreferences')
    storage.quotaBytes = 10
    mod.usePreferences().update({ theme: 'dark' })
    storage.quotaBytes = Infinity
    expect(mod.usePreferences().retrySave()).toEqual({ ok: true })
    expect(mod.usePreferences().status.save).toBe('saved')
  })
})

describe('lastAnalysisId sharing with useAnalysis (Task 4 wiring)', () => {
  it('configures useAnalysis to read/write through the same Preferences state, so a later preferences save never clobbers it', async () => {
    const prefsMod: PreferencesModule = await import('./usePreferences')
    const analysisMod: AnalysisModule = await import('./useAnalysis')

    analysisMod.useAnalysis().setCurrent(
      createAnalysis({
        id: 'a1',
        repo: fakeRepo(),
        stateFilter: 'open',
        now: '2026-03-01T10:00:00Z',
        prefs: defaultPreferences(),
        projectContext: defaultProjectContext('acme/widgets'),
        issues: [fakeIssue(1)],
        commentsFetched: false,
      }),
    )

    // The write went through usePreferences's own reactive state, not a
    // second, unsynchronized copy of it.
    expect(prefsMod.usePreferences().state.lastAnalysisId).toBe('a1')

    // A later, unrelated preferences save must not clobber it with a stale value.
    prefsMod.usePreferences().update({ theme: 'dark' })
    const stored = JSON.parse(storage.getItem(STORAGE_KEYS.preferences) as string)
    expect(stored.lastAnalysisId).toBe('a1')
    expect(stored.theme).toBe('dark')
  })

  it('restoreLastOpened reads Preferences.lastAnalysisId through the shared hook', async () => {
    const prefsMod: PreferencesModule = await import('./usePreferences')
    const analysisMod: AnalysisModule = await import('./useAnalysis')

    analysisMod
      .useAnalysis()
      .setCurrent(
        createAnalysis({
          id: 'a1',
          repo: fakeRepo(),
          stateFilter: 'open',
          now: '2026-03-01T10:00:00Z',
          prefs: defaultPreferences(),
          projectContext: defaultProjectContext('acme/widgets'),
          issues: [fakeIssue(1)],
          commentsFetched: false,
        }),
      )
    analysisMod.useAnalysis().discard()
    expect(prefsMod.usePreferences().state.lastAnalysisId).toBe('a1')
    expect(analysisMod.useAnalysis().restoreLastOpened()).toBe(true)
    expect(analysisMod.useAnalysis().current.value?.id).toBe('a1')
  })
})
