// Non-secret preferences (SPEC.md §3): a module singleton, persisted through
// preferencesStore. It also owns Preferences.lastAnalysisId (§2.2): useAnalysis
// is configured to read/write it through this same reactive state (rather than
// its own default, storage-only hook), so a preferences save and a "last
// opened" write share one source of truth and never clobber each other.
import { reactive } from 'vue'
import type { Preferences } from '../domain/types'
import { getAppStorage } from '../adapters/storage/appStorage'
import { loadPreferences, savePreferences } from '../adapters/storage/preferencesStore'
import type { SavePreferencesResult } from '../adapters/storage/preferencesStore'
import { configureAnalysis } from './useAnalysis'
import type { LastOpenedHook } from './useAnalysis'

export type PreferencesSaveStatus = 'idle' | 'saved' | 'failed'

const state = reactive<Preferences>(loadPreferences(getAppStorage()))
const status = reactive<{ save: PreferencesSaveStatus; failure: 'quota' | 'unavailable' | null }>({
  save: 'idle',
  failure: null,
})

function persist(): SavePreferencesResult {
  const result = savePreferences(getAppStorage(), { ...state })
  if (result.ok) {
    status.save = 'saved'
    status.failure = null
  } else {
    status.save = 'failed'
    status.failure = result.reason
  }
  return result
}

/** Merge a patch into the reactive state, then persist it. The in-memory
 *  change stands even when the write itself fails (§2.3 "Storage full"). */
function update(patch: Partial<Preferences>): SavePreferencesResult {
  Object.assign(state, patch)
  return persist()
}

function dismissKeysBanner(): SavePreferencesResult {
  return update({ keysBannerDismissed: true })
}

function completeOnboardingStep(step: keyof Preferences['onboarding']): SavePreferencesResult {
  return update({ onboarding: { ...state.onboarding, [step]: true } })
}

/** Shares one source of truth with useAnalysis's Preferences.lastAnalysisId
 *  (Task 4 wiring): both reads and writes go through this module's own
 *  reactive `state`, so useAnalysis never has to write raw storage behind
 *  usePreferences's back. */
const lastOpened: LastOpenedHook = {
  read: () => state.lastAnalysisId,
  write(id) {
    state.lastAnalysisId = id
    persist()
  },
}
configureAnalysis({ lastOpened })

export function usePreferences() {
  return {
    state,
    status,
    update,
    dismissKeysBanner,
    completeOnboardingStep,
    retrySave: persist,
  }
}
