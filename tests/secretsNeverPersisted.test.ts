// "Secrets never persisted, as a behaviour test", against the
// real (happy-dom) localStorage / sessionStorage / document.cookie.
//
// Task 4: the secrets now live in useSecrets() (in memory only), and the
// classification still arrives through useAnalysis().applyResult, which is
// exactly where the Task 10/11 Jev runner will write.
//
// FB-2 (2026-09-24): the default ('memory') stays the guarantee above. The
// user may opt in to 'tab' (sessionStorage) or 'device' (localStorage); the
// secrets then live under ONE dedicated key in that one storage, and never in
// preferences, analyses or the other storage.
//
// FB IndexedDB lane (2026-09-24): saved analyses moved to IndexedDB, so every
// scan below also reads every store of the (fake, per-test) database, and the
// analysis must really be in it for the scan to count.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalysis } from '../src/domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../src/domain/types'
import { fakeClassification, fakeIssue, fakeRepo } from './fakes/domainFixtures'
import { globalFactory, rawDump } from './fakes/idb'

const JEV_KEY = 'jev-secret-key-7f3a9c'
const GITHUB_TOKEN = 'github_pat_fake_secret_4b2d8e'

/** Every key and value in every IndexedDB store, as text. */
async function everyDatabaseValue(): Promise<string[]> {
  return (await rawDump(globalFactory())).flatMap((r) => [
    r.store,
    r.key,
    typeof r.value === 'string' ? r.value : JSON.stringify(r.value),
  ])
}

async function everyPersistedValue(): Promise<string[]> {
  const values: string[] = [...(await everyDatabaseValue())]
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
  sessionStorage.clear()
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
    await store.setCurrent(
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
    await store.flush()
    store.dismiss([2])
    store.updateWorking({ priorityWeights: { criticality: 50, relevance: 50, complexity: 0, effort: 0 } })
    await store.flush()

    // 2. No persisted value anywhere (localStorage, sessionStorage, cookies,
    //    every IndexedDB store) contains either secret.
    const database = await everyDatabaseValue()
    expect(database.some((value) => value.includes('"id":"a1"'))).toBe(true)
    const persisted = await everyPersistedValue()
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
    expect(await fresh.restoreLastOpened()).toBe(true)
    const restored = fresh.current.value
    expect(restored?.id).toBe('a1')
    expect(restored?.rows[0]).toMatchObject({ status: 'done', classification: fakeClassification() })
    expect(restored?.working.dismissed).toEqual([2])
    expect(restored?.working.priorityWeights).toEqual({ criticality: 50, relevance: 50, complexity: 0, effort: 0 })
  })
})

const LOCAL_KEY = 'local-provider-secret-9e1f'
const SECRETS_KEY = 'local-issue-classifier:secrets:v1'
const PREFERENCES_KEY = 'local-issue-classifier:preferences:v1'
const NO_KEYS = { jevApiKey: '', githubToken: '', localApiKey: '' }
const ALL_KEYS = { jevApiKey: JEV_KEY, githubToken: GITHUB_TOKEN, localApiKey: LOCAL_KEY }

type Level = 'memory' | 'tab' | 'device'

/** Every persisted key/value EXCEPT the dedicated secrets entry. */
async function everyNonSecretValue(): Promise<string[]> {
  const values: string[] = [...(await everyDatabaseValue())]
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i) as string
      if (key === SECRETS_KEY) continue
      values.push(key, store.getItem(key) ?? '')
    }
  }
  values.push(document.cookie)
  return values
}

function expectNoSecretIn(values: string[]): void {
  for (const value of values) {
    expect(value).not.toContain(JEV_KEY)
    expect(value).not.toContain(GITHUB_TOKEN)
    expect(value).not.toContain(LOCAL_KEY)
  }
}

async function freshSecrets() {
  const { useSecrets } = await import('../src/composables/useSecrets')
  return useSecrets()
}

async function withAllKeys(level: Level) {
  const secrets = await freshSecrets()
  secrets.setPersistence(level)
  secrets.setJevKey(JEV_KEY)
  secrets.setGitHubToken(GITHUB_TOKEN)
  secrets.setLocalApiKey(LOCAL_KEY)
  return secrets
}

function storedSecrets(store: Storage): Record<string, unknown> | null {
  const raw = store.getItem(SECRETS_KEY)
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>)
}

describe('opt-in secrets persistence (FB-2)', () => {
  it("defaults to 'memory': nothing is written anywhere and a reload empties every key", async () => {
    const secrets = await freshSecrets()
    expect(secrets.persistence.value).toBe('memory')
    secrets.setJevKey(JEV_KEY)
    secrets.setGitHubToken(GITHUB_TOKEN)
    secrets.setLocalApiKey(LOCAL_KEY)
    expect(localStorage.getItem(SECRETS_KEY)).toBeNull()
    expect(sessionStorage.getItem(SECRETS_KEY)).toBeNull()
    expectNoSecretIn(await everyPersistedValue())

    vi.resetModules()
    expect((await freshSecrets()).state).toEqual(NO_KEYS)
  })

  it("'tab' writes only to sessionStorage under the dedicated key and restores after a reload", async () => {
    await withAllKeys('tab')
    expect(storedSecrets(sessionStorage)).toEqual(ALL_KEYS)
    expect(localStorage.getItem(SECRETS_KEY)).toBeNull()
    expectNoSecretIn(await everyNonSecretValue())

    vi.resetModules()
    const reloaded = await freshSecrets()
    expect(reloaded.persistence.value).toBe('tab')
    expect(reloaded.state).toEqual(ALL_KEYS)
  })

  it("'tab' keys die with the tab: a new tab (empty sessionStorage) starts with no keys", async () => {
    await withAllKeys('tab')
    sessionStorage.clear() // closing the tab
    vi.resetModules()
    const reopened = await freshSecrets()
    expect(reopened.persistence.value).toBe('tab')
    expect(reopened.state).toEqual(NO_KEYS)
  })

  it("'device' writes only to localStorage under the dedicated key and restores after a reload", async () => {
    await withAllKeys('device')
    expect(storedSecrets(localStorage)).toEqual(ALL_KEYS)
    expect(sessionStorage.getItem(SECRETS_KEY)).toBeNull()
    expectNoSecretIn(await everyNonSecretValue())

    vi.resetModules()
    const reloaded = await freshSecrets()
    expect(reloaded.persistence.value).toBe('device')
    expect(reloaded.state).toEqual(ALL_KEYS)
  })

  it('switching levels migrates the keys and wipes the previous location', async () => {
    const secrets = await withAllKeys('tab')
    secrets.setPersistence('device')
    expect(sessionStorage.getItem(SECRETS_KEY)).toBeNull()
    expect(storedSecrets(localStorage)).toEqual(ALL_KEYS)

    secrets.setPersistence('tab')
    expect(localStorage.getItem(SECRETS_KEY)).toBeNull()
    expect(storedSecrets(sessionStorage)).toEqual(ALL_KEYS)
    expect(secrets.state).toEqual(ALL_KEYS) // the in-memory copy is kept
  })

  it("'memory' after 'device' leaves no residue in any storage, even after a reload", async () => {
    const secrets = await withAllKeys('device')
    secrets.setPersistence('memory')
    expect(secrets.state).toEqual(ALL_KEYS) // still usable this session
    expectNoSecretIn(await everyPersistedValue())

    vi.resetModules()
    const reloaded = await freshSecrets()
    expect(reloaded.persistence.value).toBe('memory')
    expect(reloaded.state).toEqual(NO_KEYS)
    expectNoSecretIn(await everyPersistedValue())
  })

  it('a stale copy in a storage the chosen level does not use is wiped on load', async () => {
    await withAllKeys('device')
    sessionStorage.setItem(SECRETS_KEY, localStorage.getItem(SECRETS_KEY) as string) // e.g. an interrupted migration
    vi.resetModules()
    await freshSecrets()
    expect(sessionStorage.getItem(SECRETS_KEY)).toBeNull()
  })

  it('an unknown stored level falls back to memory and wipes both storages', async () => {
    await withAllKeys('device')
    const prefs = JSON.parse(localStorage.getItem(PREFERENCES_KEY) as string) as Record<string, unknown>
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...prefs, secretsPersistence: 'cloud' }))
    vi.resetModules()
    const reloaded = await freshSecrets()
    expect(reloaded.persistence.value).toBe('memory')
    expect(reloaded.state).toEqual(NO_KEYS)
    expectNoSecretIn(await everyPersistedValue())
  })

  it.each<Level>(['tab', 'device'])('clearKeys ("Forget keys") wipes memory and both storages (%s)', async (level) => {
    const secrets = await withAllKeys(level)
    sessionStorage.setItem(SECRETS_KEY, '{}')
    localStorage.setItem(SECRETS_KEY, '{}')
    secrets.clearKeys()
    expect(secrets.state).toEqual(NO_KEYS)
    expect(localStorage.getItem(SECRETS_KEY)).toBeNull()
    expect(sessionStorage.getItem(SECRETS_KEY)).toBeNull()
    expectNoSecretIn(await everyPersistedValue())
  })

  it.each<Level>(['tab', 'device'])('a key dropped after a 401 is dropped from storage too (%s)', async (level) => {
    const secrets = await withAllKeys(level)
    secrets.setJevKey('') // what useProvider does on a Jev 401
    secrets.setGitHubToken('') // what App.vue does on a GitHub 401
    const store = level === 'tab' ? sessionStorage : localStorage
    expect(storedSecrets(store)).toEqual({ jevApiKey: '', githubToken: '', localApiKey: LOCAL_KEY })
    secrets.setLocalApiKey('')
    expect(store.getItem(SECRETS_KEY)).toBeNull() // nothing left to keep
  })

  it('a corrupt or non-string stored entry is ignored and removed', async () => {
    await withAllKeys('device')
    localStorage.setItem(SECRETS_KEY, JSON.stringify({ jevApiKey: 42, githubToken: ['x'] }))
    vi.resetModules()
    expect((await freshSecrets()).state).toEqual(NO_KEYS)
    expect(localStorage.getItem(SECRETS_KEY)).toBeNull()
  })

  it.each<Level>(['memory', 'tab', 'device'])('preferences and analyses never contain a secret (%s)', async (level) => {
    const secrets = await withAllKeys(level)
    const { useAnalysis } = await import('../src/composables/useAnalysis')
    const { usePreferences } = await import('../src/composables/usePreferences')
    const store = useAnalysis()
    await store.setCurrent(
      createAnalysis({
        id: `a-${level}`,
        repo: fakeRepo(),
        stateFilter: 'open',
        now: '2026-03-01T10:00:00Z',
        prefs: defaultPreferences(),
        projectContext: defaultProjectContext('acme/widgets'),
        issues: [fakeIssue(1)],
        commentsFetched: secrets.hasGitHubToken.value,
      }),
    )
    store.applyResult(1, { ok: true, classification: fakeClassification() })
    await store.flush()
    usePreferences().update({ lastRepo: 'acme/widgets' })

    // The analysis really is in IndexedDB, and no store of it holds a secret.
    const database = await everyDatabaseValue()
    expect(database.some((value) => value.includes(`"id":"a-${level}"`))).toBe(true)
    expectNoSecretIn(database)

    const prefs = JSON.parse(localStorage.getItem(PREFERENCES_KEY) as string) as Record<string, unknown>
    expect(prefs.secretsPersistence).toBe(level)
    const nonSecret = await everyNonSecretValue()
    expect(nonSecret.length).toBeGreaterThan(2)
    expectNoSecretIn(nonSecret)
  })
})

describe('useSecretsPersistence (FB-2 Settings wiring helper)', () => {
  it('a v-model-ready level that migrates on write, and forget() wipes everything', async () => {
    const { useSecrets, useSecretsPersistence } = await import('../src/composables/useSecrets')
    const secrets = useSecrets()
    const { level, forget } = useSecretsPersistence()
    expect(level.value).toBe('memory')
    secrets.setJevKey(JEV_KEY)

    level.value = 'device'
    expect(secrets.persistence.value).toBe('device')
    expect(storedSecrets(localStorage)?.jevApiKey).toBe(JEV_KEY)

    forget()
    expect(secrets.state.jevApiKey).toBe('')
    expect(localStorage.getItem(SECRETS_KEY)).toBeNull()
    expect(sessionStorage.getItem(SECRETS_KEY)).toBeNull()
  })
})
