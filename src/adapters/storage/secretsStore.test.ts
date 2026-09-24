// FB-2: the dedicated secrets store, exercised against an in-memory fake
// Storage-like. The level-to-storage wiring is covered end to end by
// tests/secretsNeverPersisted.test.ts against the real (happy-dom) storages.
import { describe, expect, it } from 'vitest'
import { SECRETS_STORAGE_KEY, loadStoredSecrets, removeStoredSecrets, saveStoredSecrets } from './secretsStore'
import type { StorageLike } from './analysisStore'

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get length() {
      return data.size
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const KEYS = { jevApiKey: 'jev-test', githubToken: 'ghp_test', localApiKey: 'local-test' }

describe('secretsStore', () => {
  it('uses one dedicated, prefixed key', () => {
    expect(SECRETS_STORAGE_KEY).toBe('local-issue-classifier:secrets:v1')
  })

  it('saves and loads the three secrets under the dedicated key only', () => {
    const storage = fakeStorage()
    expect(saveStoredSecrets(storage, KEYS)).toBe(true)
    expect([...storage.data.keys()]).toEqual([SECRETS_STORAGE_KEY])
    expect(loadStoredSecrets(storage)).toEqual(KEYS)
  })

  it('removes the entry instead of storing an all-empty value', () => {
    const storage = fakeStorage({ [SECRETS_STORAGE_KEY]: JSON.stringify(KEYS) })
    expect(saveStoredSecrets(storage, { jevApiKey: '', githubToken: '', localApiKey: '' })).toBe(true)
    expect(storage.data.size).toBe(0)
  })

  it('returns null when nothing is stored', () => {
    expect(loadStoredSecrets(fakeStorage())).toBeNull()
  })

  it.each([['not json'], ['[1,2]'], ['"a string"'], [JSON.stringify({ jevApiKey: 42 })]])(
    'drops a corrupt entry (%s) and removes it',
    (raw) => {
      const storage = fakeStorage({ [SECRETS_STORAGE_KEY]: raw })
      expect(loadStoredSecrets(storage)).toBeNull()
      expect(storage.data.size).toBe(0)
    },
  )

  it('trims values and treats missing fields as absent', () => {
    const storage = fakeStorage({ [SECRETS_STORAGE_KEY]: JSON.stringify({ jevApiKey: '  jev-test ' }) })
    expect(loadStoredSecrets(storage)).toEqual({ jevApiKey: 'jev-test', githubToken: '', localApiKey: '' })
  })

  it('reports a failed write without throwing', () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new Error('quota')
    }
    expect(saveStoredSecrets(storage, KEYS)).toBe(false)
  })

  it('removeStoredSecrets deletes only the dedicated key', () => {
    const storage = fakeStorage({ [SECRETS_STORAGE_KEY]: '{}', 'local-issue-classifier:preferences:v1': '{}' })
    removeStoredSecrets(storage)
    expect([...storage.data.keys()]).toEqual(['local-issue-classifier:preferences:v1'])
  })
})
