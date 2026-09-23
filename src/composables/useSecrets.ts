// The Jev API key and the GitHub token (SPEC.md §8): a module-singleton
// reactive store, held IN MEMORY ONLY. This file must never import a storage
// adapter or any web-storage API — tests/architecture.test.ts fails the build
// if it ever does. A page reload, closing the tab, or clearKeys() is the only
// way these values are lost.
import { computed, reactive } from 'vue'

export interface SecretsState {
  jevApiKey: string // '' = absent
  githubToken: string // '' = anonymous
}

const state = reactive<SecretsState>({ jevApiKey: '', githubToken: '' })

/** Malformed input (§2.1): keys are trimmed, and an empty value counts as absent. */
function setJevKey(key: string): void {
  state.jevApiKey = key.trim()
}

function setGitHubToken(token: string): void {
  state.githubToken = token.trim()
}

/** Wipes both secrets immediately (Settings "Clear keys", a 401, or Clear all local data). */
function clearKeys(): void {
  state.jevApiKey = ''
  state.githubToken = ''
}

const hasJevKey = computed(() => state.jevApiKey !== '')
const hasGitHubToken = computed(() => state.githubToken !== '')

/** Test-only: resets the singleton without a full module reload (vi.resetModules()). */
function __resetForTests(): void {
  clearKeys()
}

export function useSecrets() {
  return { state, hasJevKey, hasGitHubToken, setJevKey, setGitHubToken, clearKeys, __resetForTests }
}
