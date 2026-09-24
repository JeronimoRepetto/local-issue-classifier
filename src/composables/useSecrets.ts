// The Jev API key, the GitHub token and a local server's optional key (SPEC.md §8): a module-singleton
// reactive store. By DEFAULT the keys are held in memory only: a reload,
// closing the tab, or clearKeys() loses them.
//
// FB-2 (2026-09-24): the user may opt in, in Settings, to keep them for the
// tab ('tab') or on this device ('device'). Only the
// CHOICE lives in Preferences.secretsPersistence; the keys themselves go
// through adapters/storage/secretsStore.ts, the one module allowed to write
// them. This file must never touch a web-storage API itself, nor any other
// storage adapter — tests/architecture.test.ts fails the build if it does.
import { computed, reactive } from 'vue'
import { SECRETS_PERSISTENCE_LEVELS } from '../domain/types'
import type { SecretsPersistence } from '../domain/types'
import { restoreStoredSecrets, syncStoredSecrets, wipeStoredSecrets } from '../adapters/storage/secretsStore'
import { usePreferences } from './usePreferences'

export interface SecretsState {
  jevApiKey: string // '' = absent
  githubToken: string // '' = anonymous
  localApiKey: string // optional key of a local Jev-compatible server (T16); '' = none
}

const preferences = usePreferences()

/** The effective level; anything unknown in stored preferences counts as 'memory'. */
const persistence = computed<SecretsPersistence>(() => {
  const level = preferences.state.secretsPersistence
  return SECRETS_PERSISTENCE_LEVELS.includes(level) ? level : 'memory'
})

const state = reactive<SecretsState>({ jevApiKey: '', githubToken: '', localApiKey: '' })

function snapshot(): SecretsState {
  return { jevApiKey: state.jevApiKey, githubToken: state.githubToken, localApiKey: state.localApiKey }
}

// Boot: restore from the chosen level's storage only, and wipe any residue
// elsewhere ('memory' wipes both), so storage always matches the choice.
const restored = restoreStoredSecrets(persistence.value)
if (restored) Object.assign(state, restored)

/** Write-through after every change; an empty key is dropped from storage too (e.g. after a 401). */
function persist(): void {
  syncStoredSecrets(persistence.value, snapshot())
}

/** Malformed input (§2.1): keys are trimmed, and an empty value counts as absent. */
function setJevKey(key: string): void {
  state.jevApiKey = key.trim()
  persist()
}

function setGitHubToken(token: string): void {
  state.githubToken = token.trim()
  persist()
}

function setLocalApiKey(key: string): void {
  state.localApiKey = key.trim()
  persist()
}

/**
 * Switches the level: the current keys move to the new location and the
 * previous one is wiped. When the new storage cannot be written, nothing
 * changes and false is returned.
 */
function setPersistence(level: SecretsPersistence): boolean {
  if (!SECRETS_PERSISTENCE_LEVELS.includes(level)) return false
  if (!syncStoredSecrets(level, snapshot())) {
    persist() // put the keys back where the unchanged level keeps them
    return false
  }
  if (preferences.state.secretsPersistence !== level) preferences.update({ secretsPersistence: level })
  return true
}

/** Wipes every secret immediately, from memory AND both storages ("Forget keys", a 401 path, Clear all local data). */
function clearKeys(): void {
  state.jevApiKey = ''
  state.githubToken = ''
  state.localApiKey = ''
  wipeStoredSecrets()
}

const hasJevKey = computed(() => state.jevApiKey !== '')
const hasGitHubToken = computed(() => state.githubToken !== '')
const hasLocalApiKey = computed(() => state.localApiKey !== '')

/** Test-only: resets the singleton without a full module reload (vi.resetModules()). */
function __resetForTests(): void {
  clearKeys()
}

export function useSecrets() {
  return {
    state,
    hasJevKey,
    hasGitHubToken,
    hasLocalApiKey,
    persistence,
    setJevKey,
    setGitHubToken,
    setLocalApiKey,
    setPersistence,
    clearKeys,
    __resetForTests,
  }
}

/** Settings wiring: `level` is v-model-ready for SecretsPersistenceToggle, `forget` is "Forget keys". */
export function useSecretsPersistence() {
  const level = computed<SecretsPersistence>({
    get: () => persistence.value,
    set: (value) => {
      setPersistence(value)
    },
  })
  return { level, forget: clearKeys }
}
