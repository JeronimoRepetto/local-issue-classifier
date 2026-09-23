<script setup lang="ts">
// Drives useRepo() for the New-analysis / refresh flow (SPEC §2.2 / §2.3):
// the repo input, the existing-analysis prompt, progress, the huge-repo and
// comment-cost confirmations, rate-limit / error recovery and the one-time
// private-repo notice. Rendered once by HomeContainer; a "Refresh" click on
// any AnalysisCard calls useRepo().refresh(id) directly (see HomeContainer),
// and this container reacts to the same singleton state either way.
import { computed, ref, watch } from 'vue'
import type { RepoRef } from '../../domain/types'
import type { AnalysisSummary } from '../../domain/types'
import { readStoredPreferences, useRepo } from '../../composables/useRepo'
import { useView } from '../../composables/useView'
import ExistingAnalysisPrompt from '../ui/ExistingAnalysisPrompt.vue'
import RepoInput from '../ui/RepoInput.vue'
import type { StateFilter } from '../ui/RepoInput.vue'
import RepoLoadFeedback from './RepoLoadFeedback.vue'

const repo = useRepo()
const view = useView()

type Submission = { ref: RepoRef; stateFilter: StateFilter; raw: string }
type LastAction = { kind: 'new'; submission: Submission } | { kind: 'refresh'; id: string }

const existingPrompt = ref<{ summary: AnalysisSummary; submission: Submission } | null>(null)
const lastAction = ref<LastAction | null>(null)
const prefs = computed(() => readStoredPreferences())

function onSubmit(ref: RepoRef, stateFilter: StateFilter, raw: string): void {
  const submission: Submission = { ref, stateFilter, raw }
  const existing = repo.findExisting(ref, stateFilter)
  if (existing) {
    existingPrompt.value = { summary: existing, submission }
    return
  }
  lastAction.value = { kind: 'new', submission }
  repo.startNew(ref, stateFilter, raw)
}

function onExistingDecision(decision: 'open' | 'refresh' | 'create'): void {
  const prompt = existingPrompt.value
  existingPrompt.value = null
  if (!prompt) return
  if (decision === 'open') {
    view.openAnalysis(prompt.summary.id)
  } else if (decision === 'refresh') {
    lastAction.value = { kind: 'refresh', id: prompt.summary.id }
    repo.refresh(prompt.summary.id)
  } else {
    lastAction.value = { kind: 'new', submission: prompt.submission }
    repo.startNew(prompt.submission.ref, prompt.submission.stateFilter, prompt.submission.raw)
  }
}

function retry(): void {
  const action = lastAction.value
  if (!action) return
  if (action.kind === 'new') repo.startNew(action.submission.ref, action.submission.stateFilter, action.submission.raw)
  else repo.refresh(action.id)
}

// Switches to the analysis view on completion, but does NOT dismiss() the
// repo state here: that would wipe the one-time private-repo notice before
// anyone could read it, since the view switch happens immediately. Home
// clears any leftover 'done'/'error' state itself when it is (re)shown.
watch(
  () => repo.state.phase,
  (phase) => {
    if (phase === 'done' && repo.state.analysisId) {
      view.openAnalysis(repo.state.analysisId)
    }
  },
)
</script>

<template>
  <div class="repo-loader" data-test="repo-loader">
    <RepoInput
      :initial-text="prefs.lastRepo"
      :default-state-filter="prefs.includeClosedByDefault ? 'all' : 'open'"
      @submit="onSubmit"
    />

    <ExistingAnalysisPrompt
      v-if="existingPrompt"
      :repo-full-name="existingPrompt.summary.repoFullName"
      :state-filter="existingPrompt.summary.stateFilter"
      @decision="onExistingDecision"
    />

    <RepoLoadFeedback @retry="retry" />
  </div>
</template>

<style scoped>
.repo-loader {
  display: grid;
  gap: var(--space-3);
}
</style>
