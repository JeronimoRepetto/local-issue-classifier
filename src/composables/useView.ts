// The App shell's view state (SPEC.md §6.1): App.vue has no router, it just
// switches between Home, the current analysis (AnalysisViewContainer) and
// Settings (SettingsContainer) based on this.
import { reactive } from 'vue'
import type { LoadResult } from '../adapters/storage/analysisStore'
import { useAnalyses } from './useAnalyses'

export type ViewName = 'home' | 'analysis' | 'settings'

const state = reactive<{ view: ViewName }>({ view: 'home' })

function goHome(): void {
  state.view = 'home'
}

function openSettings(): void {
  state.view = 'settings'
}

/** Opens a saved analysis and switches to the analysis view; stays put if it fails to open. */
function openAnalysis(id: string): LoadResult {
  const result = useAnalyses().open(id)
  if (result.ok) state.view = 'analysis'
  return result
}

export function useView() {
  return { state, goHome, openSettings, openAnalysis }
}
