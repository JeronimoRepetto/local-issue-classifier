// Task 8 — the App shell's view state: 'home' | 'analysis' | 'settings'.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'
import { saveAnalysis } from '../adapters/storage/analysisStore'

let viewMod: typeof import('./useView')
let analysisMod: typeof import('./useAnalysis')
let storage: MemoryStorage

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../adapters/storage/appStorage')).setAppStorage(storage)
  analysisMod = await import('./useAnalysis')
  viewMod = await import('./useView')
  analysisMod.configureAnalysis({ clock: () => '2026-06-01T00:00:00Z' })
})

function seedAnalysis(id: string) {
  return saveAnalysis(
    storage,
    createAnalysis({
      id,
      repo: fakeRepo(),
      stateFilter: 'open',
      now: '2026-06-01T00:00:00Z',
      prefs: defaultPreferences(),
      projectContext: defaultProjectContext('acme/widgets'),
      issues: [fakeIssue(1)],
      commentsFetched: false,
    }),
  )
}

describe('useView', () => {
  it('is a singleton, starting on home', () => {
    expect(viewMod.useView().state).toBe(viewMod.useView().state)
    expect(viewMod.useView().state.view).toBe('home')
  })

  it('openSettings and goHome switch views', () => {
    const view = viewMod.useView()
    view.openSettings()
    expect(view.state.view).toBe('settings')
    view.goHome()
    expect(view.state.view).toBe('home')
  })

  it('openAnalysis opens the saved analysis and switches to the analysis view', () => {
    seedAnalysis('a1')
    const view = viewMod.useView()
    const result = view.openAnalysis('a1')
    expect(result).toMatchObject({ ok: true })
    expect(view.state.view).toBe('analysis')
    expect(analysisMod.useAnalysis().current.value?.id).toBe('a1')
  })

  it('openAnalysis stays on the current view when the analysis cannot be opened', () => {
    const view = viewMod.useView()
    view.openSettings()
    const result = view.openAnalysis('missing')
    expect(result).toEqual({ ok: false, reason: 'missing' })
    expect(view.state.view).toBe('settings')
  })
})
