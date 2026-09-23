<script setup lang="ts">
// The Home screen (SPEC §2.2): the saved-analyses list, New analysis
// (RepoLoaderContainer), the storage meter, Clear all local data and the
// first-run checklist. The single primary action on this screen is New
// analysis, inside RepoLoaderContainer's RepoInput.
import { computed, onMounted, ref, watch } from 'vue'
import { readStoredPreferences, useRepo } from '../../composables/useRepo'
import { useAnalyses } from '../../composables/useAnalyses'
import { useAnalysis } from '../../composables/useAnalysis'
import { useView } from '../../composables/useView'
import UiButton from '../../ui/UiButton.vue'
import AnalysisList from '../ui/AnalysisList.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import OnboardingChecklist from '../ui/OnboardingChecklist.vue'
import type { OnboardingSteps } from '../ui/OnboardingChecklist.vue'
import RepoLoaderContainer from './RepoLoaderContainer.vue'
import SaveFailedNotice from '../ui/SaveFailedNotice.vue'
import StorageMeter from '../ui/StorageMeter.vue'

/** Task 4's useSecrets clears the in-memory keys on Clear all (SPEC §8); wired by the integration task. */
const props = withDefaults(defineProps<{ onClearAll?: () => void }>(), { onClearAll: () => {} })

const analyses = useAnalyses()
const analysis = useAnalysis()
const repo = useRepo()
const view = useView()

const onboarding = ref<OnboardingSteps>(readStoredPreferences().onboarding)
const clearingAll = ref(false)

function refreshOnboarding(): void {
  onboarding.value = readStoredPreferences().onboarding
}

onMounted(() => {
  analyses.refresh()
  // A finished ('done' or 'error') load from a previous visit should not
  // linger (incl. the one-time private-repo notice) once Home is shown again.
  repo.dismiss()
  refreshOnboarding()
})

// The "2 Repository" step is marked done by useRepo right before a new
// analysis is saved (SPEC §10.1); pick that up as soon as a load finishes.
watch(
  () => repo.state.phase,
  (phase) => {
    if (phase === 'done') refreshOnboarding()
  },
)

function onOpen(id: string): void {
  view.openAnalysis(id)
}

function onRename(id: string, name: string): void {
  analyses.rename(id, name)
}

function onRefresh(id: string): void {
  repo.refresh(id)
}

function onDelete(id: string): void {
  analyses.remove(id)
}

function confirmClearAll(): void {
  clearingAll.value = false
  analyses.clearAll()
  props.onClearAll()
  refreshOnboarding()
}

const saveFailed = computed(() => (analysis.status.save === 'failed' ? analysis.status.failure : null))
</script>

<template>
  <div class="home" data-test="home-container">
    <header class="home__hero">
      <h1 class="home__title u-pixel-font">Triage issues locally.</h1>
      <p class="home__lede" data-test="home-lede">
        Score criticality, effort and relevance for any GitHub repository. Keys stay in memory;
        results stay in this browser.
      </p>
    </header>

    <OnboardingChecklist :steps="onboarding" />

    <SaveFailedNotice v-if="saveFailed" :reason="saveFailed" @retry="analysis.retrySave()">
      <template #meter>
        <StorageMeter :used-bytes="analyses.state.usageBytes" />
      </template>
    </SaveFailedNotice>

    <RepoLoaderContainer />

    <section class="home__saved" aria-labelledby="home-saved-title">
      <div class="home__kicker" data-test="saved-kicker">
        <h2 id="home-saved-title" class="u-micro home__kicker-title">Saved analyses</h2>
        <StorageMeter :used-bytes="analyses.state.usageBytes" />
      </div>

      <AnalysisList
        :entries="analyses.state.entries"
        @open="onOpen"
        @rename="onRename"
        @refresh="onRefresh"
        @delete="onDelete"
      />
    </section>

    <footer class="home__footer">
      <UiButton variant="ghost" size="compact" data-test="clear-all" @click="clearingAll = true">
        Clear all local data
      </UiButton>
    </footer>

    <ConfirmDialog
      :open="clearingAll"
      title="Clear all local data?"
      description="This removes every saved analysis and preference from this browser, and clears your keys from memory. This cannot be undone."
      confirm-phrase="delete"
      confirm-label="Clear all local data"
      @close="clearingAll = false"
      @confirm="confirmClearAll"
    />
  </div>
</template>

<style scoped>
.home {
  display: grid;
  gap: var(--space-4);
  max-width: var(--measure-page);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-5);
}

.home__hero {
  display: grid;
  gap: var(--space-2h);
}

.home__title {
  margin: 0;
  font-size: var(--text-h1-size);
  line-height: var(--text-h1-line);
}

.home__lede {
  max-width: calc(var(--measure-narrow) - var(--space-6));
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-body-size);
  line-height: var(--text-body-line);
}

.home__saved {
  display: grid;
  gap: var(--space-2h);
  margin-top: var(--space-3);
}

.home__kicker {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: var(--line-thin) solid var(--color-border);
}

.home__kicker-title {
  margin: 0;
}

.home__kicker :deep(.storage-meter) {
  width: calc(var(--space-7) * 4);
}

.home__kicker :deep(.storage-meter__label) {
  white-space: nowrap;
}

.home__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
