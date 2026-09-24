<script setup lang="ts">
// Task FU — SPEC.md §2.3 edge cases and "Storage full": the refresh-time
// confirmations and notices, extracted out of RepoLoaderContainer so the
// analysis view can show the same feedback while a refresh is in progress.
// Driven by useRepo().state: progress + Cancel, the huge-repo and
// comment-cost confirmations, the rate-limit and error recovery notices, and
// the once-per-session private-repo notice. "Retry" on the error notice is
// host-specific (a brand-new "New analysis" submission vs. re-running
// refresh(id)), so it is emitted rather than hardcoded here.
//
// `showSaveFailed` additionally renders the "Storage full" save-failed
// notice (driven by useAnalysis().status) with its own Retry save button.
// It defaults to off because HomeContainer already renders its own
// SaveFailedNotice next to the storage meter; only the analysis view (which
// has no other save-failed surface) turns it on, so exactly one instance is
// ever visible at a time.
import { computed } from 'vue'
import { useAnalyses } from '../../composables/useAnalyses'
import { useAnalysis } from '../../composables/useAnalysis'
import { useRepo } from '../../composables/useRepo'
import UiButton from '../../ui/UiButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import CostConfirm from '../ui/CostConfirm.vue'
import LoadProgress from '../ui/LoadProgress.vue'
import RateLimitBadge from '../ui/RateLimitBadge.vue'
import SaveFailedNotice from '../ui/SaveFailedNotice.vue'
import StorageMeter from '../ui/StorageMeter.vue'

withDefaults(defineProps<{ showSaveFailed?: boolean }>(), { showSaveFailed: false })
const emit = defineEmits<{ retry: [] }>()

const repo = useRepo()
const analysis = useAnalysis()
const analyses = useAnalyses()

const PROGRESS_PHASES = ['loading', 'confirm-huge-repo', 'confirm-comment-cost']
const busy = computed(() => PROGRESS_PHASES.includes(repo.state.phase))

const saveFailed = computed(() => (analysis.status.save === 'failed' ? analysis.status.failure : null))

// GitHub's cursor-paginated issues list reports no total, so the count can be unknown.
const hugeRepoText = computed(() => {
  const size =
    repo.state.totalPages != null
      ? `It has ${repo.state.totalPages} pages of issues (over 20)`
      : 'Your "Max issues to load" limit could need more than 20 pages of issues (GitHub does not report the total)'
  return `${size}, which will use a lot of your GitHub quota. Load all of them, or stop with what has already loaded?`
})

const resetAtText = computed(() =>
  repo.state.rateLimitResetAt ? new Date(repo.state.rateLimitResetAt).toLocaleTimeString() : 'unknown',
)
</script>

<template>
  <div class="repo-load-feedback">
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
        :description="hugeRepoText"
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
        <UiButton variant="secondary" data-test="retry-load" @click="emit('retry')">Retry</UiButton>
        <UiButton variant="ghost" data-test="dismiss-error" @click="repo.dismiss()">Dismiss</UiButton>
      </div>

      <p v-if="repo.state.privateRepoNotice" data-test="private-repo-notice" role="status">
        Private-repo content is stored in plain text, unencrypted, in this browser's local storage until you delete
        it.
      </p>
    </template>

    <SaveFailedNotice v-if="showSaveFailed && saveFailed" :reason="saveFailed" @retry="analysis.retrySave()">
      <template #meter>
        <StorageMeter :used-bytes="analyses.state.usageBytes" :quota-bytes="analyses.state.quotaBytes" />
      </template>
    </SaveFailedNotice>
  </div>
</template>

<style scoped>
.repo-load-feedback {
  display: grid;
  gap: var(--space-3);
}
</style>
