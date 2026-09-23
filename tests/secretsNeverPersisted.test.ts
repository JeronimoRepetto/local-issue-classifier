// SPEC.md §7.3 "Secrets never persisted, as a behaviour test", against the
// real (happy-dom) localStorage / sessionStorage / document.cookie.
//
// Task 7 scope: useSecrets (Task 4) and the Jev runner (Tasks 10/11) do not
// exist yet, so the secrets are held in a local in-memory value and the
// classification arrives through useAnalysis().applyResult, which is exactly
// where the runner will write. Task 4 should swap the local value for
// useSecrets() and turn the todo below into a real assertion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../src/domain/analysis'
import { defaultPreferences, defaultProjectContext, defaultSecrets } from '../src/domain/types'
import { fakeClassification, fakeIssue, fakeRepo } from './fakes/domainFixtures'

const JEV_KEY = 'jev-secret-key-7f3a9c'
const GITHUB_TOKEN = 'github_pat_fake_secret_4b2d8e'

function everyPersistedValue(): string[] {
  const values: string[] = []
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i) as string
      values.push(key, store.getItem(key) ?? '')
    }
  }
  values.push(document.cookie)
  return values
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  localStorage.clear()
})

describe('secrets are never persisted (§7.3)', () => {
  it('persists the analysis, classification and working state but never a secret; reload restores them', async () => {
    // 1. Keys in memory, an analysis created and saved, one issue classified, working state changed.
    const secrets = { ...defaultSecrets(), jevApiKey: JEV_KEY, githubToken: GITHUB_TOKEN }
    const { useAnalysis } = await import('../src/composables/useAnalysis')
    const store = useAnalysis()
    store.setCurrent(
      createAnalysis({
        id: 'a1',
        repo: fakeRepo(),
        stateFilter: 'open',
        now: '2026-03-01T10:00:00Z',
        prefs: defaultPreferences(),
        projectContext: defaultProjectContext('acme/widgets'),
        issues: [fakeIssue(1), fakeIssue(2)],
        commentsFetched: Boolean(secrets.githubToken),
      }),
    )
    store.applyResult(1, { ok: true, classification: fakeClassification() })
    store.flush()
    store.dismiss([2])
    store.updateWorking({ priorityWeights: { criticality: 50, relevance: 50, complexity: 0, effort: 0 } })
    store.flush()

    // 2. No persisted value anywhere contains either secret.
    const persisted = everyPersistedValue()
    expect(persisted.length).toBeGreaterThan(1)
    for (const value of persisted) {
      expect(value).not.toContain(JEV_KEY)
      expect(value).not.toContain(GITHUB_TOKEN)
    }

    // 3. Simulated reload: fresh modules, then the last analysis is restored.
    vi.resetModules()
    const reloaded = await import('../src/composables/useAnalysis')
    const fresh = reloaded.useAnalysis()
    expect(fresh.current.value).toBeNull()
    expect(fresh.restoreLastOpened()).toBe(true)
    const restored = fresh.current.value
    expect(restored?.id).toBe('a1')
    expect(restored?.rows[0]).toMatchObject({ status: 'done', classification: fakeClassification() })
    expect(restored?.working.dismissed).toEqual([2])
    expect(restored?.working.priorityWeights).toEqual({ criticality: 50, relevance: 50, complexity: 0, effort: 0 })
  })

  it.todo('useSecrets() is empty after a module reload (wire in with Task 4)')
})
