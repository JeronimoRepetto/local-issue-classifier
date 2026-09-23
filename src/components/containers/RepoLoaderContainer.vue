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
import UiButton from '../../ui/UiButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import CostConfirm from '../ui/CostConfirm.vue'
import ExistingAnalysisPrompt from '../ui/ExistingAnalysisPrompt.vue'
import LoadProgress from '../ui/LoadProgress.vue'
import RateLimitBadge from '../ui/RateLimitBadge.vue'
import RepoInput from '../ui/RepoInput.vue'
import type { StateFilter } from '../ui/RepoInput.vue'

const repo = useRepo()
const view = useView()

type Submission = { ref: RepoRef; stateFilter: StateFilter; raw: string }
type LastAction = { kind: 'new'; submission: Submission } | { kind: 'refresh'; id: string }

const existingPrompt = ref<{ summary: AnalysisSummary; submission: Submission } | null>(null)
const lastAction = ref<LastAction | null>(null)
const prefs = computed(() => readStoredPreferences())

const PROGRESS_PHASES = ['loading', 'confirm-huge-repo', 'confirm-comment-cost']
const busy = computed(() => PROGRESS_PHASES.includes(repo.state.phase))

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

const resetAtText = computed(() =>
  repo.state.rateLimitResetAt ? new Date(repo.state.rateLimitResetAt).toLocaleTimeString() : 'unknown',
)

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

    <template v-if="repo.state.phase !== 'idle'">
      <LoadProgress v-if="busy" :progress="repo.state.progress" />
      <RateLimitBadge
        v-if="busy"
        :remaining="repo.state.rateLimit?.remaining ?? null"
        :limit="repo.state.rateLimit?.limit ?? null"
      />
      <UiButton v-if="busy" variant="ghost" data-test="cancel-load" @click="repo.cancel()">Cancel</UiButton>

      <ConfirmDialog
        :open="repo.state.phase === 'confirm-huge-repo'"
        title="This is a large repository"
        :description="`It has ${repo.state.totalPages} pages of issues (over 20), which will use a lot of your GitHub quota. Load all of them, or stop with what has already loaded?`"
        confirm-label="Load all"
        cancel-label="Stop here"
        @close="repo.confirmHugeRepo(false)"
        @confirm="repo.confirmHugeRepo(true)"
      />

      <CostConfirm
        v-if="repo.state.phase === 'confirm-comment-cost' && repo.state.pendingCost"
        :requests="repo.state.pendingCost.requests"
        :remaining="repo.state.rateLimit?.remaining ?? null"
        @decision="repo.confirmCommentCost"
      />

      <div v-if="repo.state.phase === 'rate-limited'" data-test="rate-limited-notice">
        <p>GitHub's rate limit was reached. It resets at {{ resetAtText }}. What was already loaded stays usable.</p>
        <UiButton variant="primary" data-test="resume-load" @click="repo.resume()">Resume</UiButton>
        <UiButton variant="ghost" @click="repo.cancel()">Cancel</UiButton>
      </div>

      <div v-if="repo.state.phase === 'error'" data-test="repo-error">
        <p>{{ repo.state.error }}</p>
        <UiButton variant="secondary" data-test="retry-load" @click="retry">Retry</UiButton>
        <UiButton variant="ghost" @click="repo.dismiss()">Dismiss</UiButton>
      </div>

      <p v-if="repo.state.privateRepoNotice" data-test="private-repo-notice" role="status">
        Private-repo content is stored in plain text, unencrypted, in this browser's local storage until you delete
        it.
      </p>
    </template>
  </div>
</template>

<style scoped>
.repo-loader {
  display: grid;
  gap: var(--space-3);
}
</style>
