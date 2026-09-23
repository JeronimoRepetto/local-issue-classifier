// SPEC.md §7.3 "Secrets never persisted, as a behaviour test", against the
// real (happy-dom) localStorage / sessionStorage / document.cookie.
//
// Task 4: the secrets now live in useSecrets() (in memory only), and the
// classification still arrives through useAnalysis().applyResult, which is
// exactly where the Task 10/11 Jev runner will write.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../src/domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../src/domain/types'
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
    // 1. Keys in memory (useSecrets, Task 4), an analysis created and saved,
    //    one issue classified, working state changed.
    const { useSecrets } = await import('../src/composables/useSecrets')
    const secrets = useSecrets()
    secrets.setJevKey(JEV_KEY)
    secrets.setGitHubToken(GITHUB_TOKEN)

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
        commentsFetched: secrets.hasGitHubToken.value,
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

    // 3. Simulated reload: fresh modules. useSecrets() comes back empty, and
    //    the last analysis is restored from non-secret storage alone.
    vi.resetModules()
    const { useSecrets: useSecretsAfterReload } = await import('../src/composables/useSecrets')
    const secretsAfterReload = useSecretsAfterReload()
    expect(secretsAfterReload.state.jevApiKey).toBe('')
    expect(secretsAfterReload.state.githubToken).toBe('')
    expect(secretsAfterReload.hasJevKey.value).toBe(false)
    expect(secretsAfterReload.hasGitHubToken.value).toBe(false)

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
})
