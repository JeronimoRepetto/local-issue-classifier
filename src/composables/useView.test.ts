// Task 8 — the App shell's view state: 'home' | 'analysis' | 'settings'.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../domain/types'
import { fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../tests/fakes/memoryStorage'

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

/** Saved analyses live in IndexedDB (the per-test fake from tests/setup/indexedDb.ts). */
async function seedAnalysis(id: string) {
  const { getAnalysisDb } = await import('../adapters/storage/analysisDb')
  return getAnalysisDb().saveAnalysis(
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

  it('openAnalysis opens the saved analysis and switches to the analysis view', async () => {
    await seedAnalysis('a1')
    const view = viewMod.useView()
    const result = await view.openAnalysis('a1')
    expect(result).toMatchObject({ ok: true })
    expect(view.state.view).toBe('analysis')
    expect(analysisMod.useAnalysis().current.value?.id).toBe('a1')
  })

  it('openAnalysis stays on the current view when the analysis cannot be opened', async () => {
    const view = viewMod.useView()
    view.openSettings()
    const result = await view.openAnalysis('missing')
    expect(result).toEqual({ ok: false, reason: 'missing' })
    expect(view.state.view).toBe('settings')
  })

  it('openAnalysis switches synchronously when the analysis is already current', async () => {
    await analysisMod.useAnalysis().setCurrent(
      createAnalysis({
        id: 'a1',
        repo: fakeRepo(),
        stateFilter: 'open',
        now: '2026-06-01T00:00:00Z',
        prefs: defaultPreferences(),
        projectContext: defaultProjectContext('acme/widgets'),
        issues: [fakeIssue(1)],
        commentsFetched: false,
      }),
    )
    const view = viewMod.useView()
    const opening = view.openAnalysis('a1')
    expect(view.state.view).toBe('analysis')
    expect(await opening).toMatchObject({ ok: true })
  })

  it('openAnalysis does not switch when another analysis became current while it loaded', async () => {
    await seedAnalysis('a1')
    const view = viewMod.useView()
    const opening = view.openAnalysis('a1')
    analysisMod.useAnalysis().setCurrent(
      createAnalysis({
        id: 'a2',
        repo: fakeRepo(),
        stateFilter: 'open',
        now: '2026-06-01T00:00:00Z',
        prefs: defaultPreferences(),
        projectContext: defaultProjectContext('acme/widgets'),
        issues: [fakeIssue(1)],
        commentsFetched: false,
      }),
    )
    await opening
    expect(view.state.view).toBe('home')
    expect(analysisMod.useAnalysis().current.value?.id).toBe('a2')
  })
})
