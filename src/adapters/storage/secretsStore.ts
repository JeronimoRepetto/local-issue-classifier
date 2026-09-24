// FB-2: the ONLY place secrets may touch browser storage, and only when the
// user opted in (Preferences.secretsPersistence 'tab' or 'device'; the default
// 'memory' writes nothing). tests/architecture.test.ts allowlists this file,
// and only this file, for sessionStorage, and allows only useSecrets.ts to
// import it. Secrets live under ONE dedicated key, never in preferences or
// analyses. The key shares STORAGE_PREFIX, so "Clear all local data" also
// removes a device-stored copy.
import { STORAGE_PREFIX } from '../../domain/types'
import type { SecretsPersistence } from '../../domain/types'
import type { StorageLike } from './analysisStore'

export const SECRETS_STORAGE_KEY = `${STORAGE_PREFIX}secrets:v1`

export interface StoredSecrets {
  jevApiKey: string
  githubToken: string
  localApiKey: string
}

type StoredLevel = Exclude<SecretsPersistence, 'memory'>
const STORED_LEVELS: readonly StoredLevel[] = ['tab', 'device']

/** The browser storage behind a level; null when it is blocked or absent. */
function storageFor(level: StoredLevel): StorageLike | null {
  try {
    return (level === 'tab' ? globalThis.sessionStorage : globalThis.localStorage) ?? null
  } catch {
    return null // accessing web storage throws when site data is blocked
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function field(record: Record<string, unknown>, name: keyof StoredSecrets): string | null {
  const value = record[name] ?? ''
  return typeof value === 'string' ? value.trim() : null
}

/** Never throws: a failed removal leaves nothing we could do better. */
export function removeStoredSecrets(storage: StorageLike): void {
  try {
    storage.removeItem(SECRETS_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** The stored secrets, or null. A corrupt entry is removed rather than trusted. */
export function loadStoredSecrets(storage: StorageLike): StoredSecrets | null {
  let raw: string | null
  try {
    raw = storage.getItem(SECRETS_STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isObject(parsed)) {
      const jevApiKey = field(parsed, 'jevApiKey')
      const githubToken = field(parsed, 'githubToken')
      const localApiKey = field(parsed, 'localApiKey')
      if (jevApiKey !== null && githubToken !== null && localApiKey !== null) {
        return { jevApiKey, githubToken, localApiKey }
      }
    }
  } catch {
    // fall through: corrupt JSON
  }
  removeStoredSecrets(storage)
  return null
}

/** Writes the secrets; an all-empty value removes the entry instead. False when the write failed. */
export function saveStoredSecrets(storage: StorageLike, secrets: StoredSecrets): boolean {
  const { jevApiKey, githubToken, localApiKey } = secrets
  if (jevApiKey === '' && githubToken === '' && localApiKey === '') {
    removeStoredSecrets(storage)
    return true
  }
  try {
    storage.setItem(SECRETS_STORAGE_KEY, JSON.stringify({ jevApiKey, githubToken, localApiKey }))
    return true
  } catch {
    return false
  }
}

/**
 * Makes storage match the level: the secrets are written to the level's own
 * storage (if any) and removed from every other one. 'memory' removes them
 * everywhere. False when the level's own write failed.
 */
export function syncStoredSecrets(level: SecretsPersistence, secrets: StoredSecrets): boolean {
  let ok = true
  for (const stored of STORED_LEVELS) {
    const storage = storageFor(stored)
    if (!storage) {
      if (stored === level) ok = false
      continue
    }
    if (stored === level) ok = saveStoredSecrets(storage, secrets)
    else removeStoredSecrets(storage)
  }
  return ok
}

/** The secrets stored for this level ('memory' has none), after wiping every other location. */
export function restoreStoredSecrets(level: SecretsPersistence): StoredSecrets | null {
  let restored: StoredSecrets | null = null
  for (const stored of STORED_LEVELS) {
    const storage = storageFor(stored)
    if (!storage) continue
    if (stored === level) restored = loadStoredSecrets(storage)
    else removeStoredSecrets(storage)
  }
  return restored
}

/** "Forget keys": removes the dedicated entry from both storages, whatever the level. */
export function wipeStoredSecrets(): void {
  for (const stored of STORED_LEVELS) {
    const storage = storageFor(stored)
    if (storage) removeStoredSecrets(storage)
  }
}
