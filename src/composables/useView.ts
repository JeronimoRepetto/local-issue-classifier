// The App shell's view state: App.vue has no router, it just
// switches between Home, the current analysis (AnalysisViewContainer) and
// Settings (SettingsContainer) based on this.
import { reactive } from 'vue'
import type { LoadResult } from '../adapters/storage/analysisStore'
import { useAnalyses } from './useAnalyses'
import { useAnalysis } from './useAnalysis'

export type ViewName = 'home' | 'analysis' | 'settings'

const state = reactive<{ view: ViewName }>({ view: 'home' })

function goHome(): void {
  state.view = 'home'
}

function openSettings(): void {
  state.view = 'settings'
}

/**
 * Opens a saved analysis and switches to the analysis view; stays put if it
 * fails to open, or if another analysis became current while it was loading.
 * The already-current case switches synchronously (no database read).
 */
async function openAnalysis(id: string): Promise<LoadResult> {
  if (useAnalysis().current.value?.id === id) state.view = 'analysis'
  const result = await useAnalyses().open(id)
  if (result.ok && useAnalysis().current.value?.id === id) state.view = 'analysis'
  return result
}

export function useView() {
  return { state, goHome, openSettings, openAnalysis }
}
