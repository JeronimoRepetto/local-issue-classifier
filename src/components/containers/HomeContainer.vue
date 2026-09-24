<script setup lang="ts">
// The Home screen (SPEC §2.2): the saved-analyses list, New analysis
// (RepoLoaderContainer), the storage meter, Clear all local data and the
// first-run checklist. The single primary action on this screen is New
// analysis, inside RepoLoaderContainer's RepoInput.
//
// The first-run checklist is now derived from live state instead of persisted
// flags (see fb-checklist branch): keys come from the provider actually being
// usable (see onboarding's own comment below), repo from saved/current
// analyses, and classify from actual classified issues. The onboarding
// preference and completeOnboardingStep() remain (unused) for backward
// compatibility with stored data; the checklist never persists state.
import { computed, onMounted, ref } from 'vue'
import { useRepo } from '../../composables/useRepo'
import { useAnalyses } from '../../composables/useAnalyses'
import { useAnalysis } from '../../composables/useAnalysis'
import { useView } from '../../composables/useView'
import { useProvider } from '../../composables/useProvider'
import { useSecrets } from '../../composables/useSecrets'
import { useHardwareDetection } from '../../composables/useHardwareDetection'
import { detectHardware } from '../../adapters/hardware/detect'
import UiButton from '../../ui/UiButton.vue'
import AnalysisList from '../ui/AnalysisList.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import OnboardingChecklist from '../ui/OnboardingChecklist.vue'
import type { OnboardingSteps } from '../ui/OnboardingChecklist.vue'
import HardwareSummaryPanel from '../ui/HardwareSummaryPanel.vue'
import ProviderOnboardingCard from './ProviderOnboardingCard.vue'
import RepoLoaderContainer from './RepoLoaderContainer.vue'
import SaveFailedNotice from '../ui/SaveFailedNotice.vue'
import StorageMeter from '../ui/StorageMeter.vue'

/** Task 4's useSecrets clears the in-memory keys on Clear all (SPEC §8); wired by the integration task. */
const props = withDefaults(defineProps<{ onClearAll?: () => void }>(), { onClearAll: () => {} })

const analyses = useAnalyses()
const analysis = useAnalysis()
const repo = useRepo()
const view = useView()
const provider = useProvider()
const secrets = useSecrets()

// "Your computer" sibling panel (layout change, user decisions 2026-09-24):
// this container owns the passive, cached detection trigger and passes the
// shared report down to HardwareSummaryPanel. ProviderOnboardingCard reads
// the very same module-scope cache for its own fit line, so mount order
// never causes a second independent scan (see useHardwareDetection.ts).
const hw = useHardwareDetection()
onMounted(() => {
  if (!hw.hasStarted()) void hw.run(() => detectHardware())
})

const clearingAll = ref(false)

/** Derive the onboarding checklist from live state:
 * - keys: cloud (TypeSafe) is done only once a Jev key is actually present;
 *   local is done only once the provider probe has actually succeeded
 *   (status 'direct'/'proxied'), not merely once a base URL is configured —
 *   a configured-but-unprobed local server is not yet "ready" (user report,
 *   2026-09-24: this used to read provider.ready, which only checks the
 *   base URL's shape).
 * - repo: at least one saved analysis exists OR a current analysis is loaded
 * - classify: at least one saved analysis has classified issues OR current has a classification
 */
const onboarding = computed<OnboardingSteps>(() => {
  const providerConfig = provider.config.value
  const keys =
    providerConfig.kind === 'typesafe'
      ? secrets.hasJevKey.value
      : provider.status.value === 'direct' || provider.status.value === 'proxied'

  // Repo: check for saved analyses or current analysis
  const repo = analyses.state.entries.length > 0 || analysis.current.value !== null

  // Classify: check for classified issues in saved analyses or current analysis
  let classify = false
  if (analyses.state.entries.length > 0) {
    // At least one saved analysis with classified issues
    classify = analyses.state.entries.some((entry) => {
      if (entry.status === 'ok') return entry.summary.counts.classified > 0
      return false
    })
  }
  if (!classify && analysis.current.value) {
    // Current analysis has at least one classified issue
    classify = analysis.current.value.rows.some((row) => row.classification !== null)
  }

  return { keys, repo, classify }
})

onMounted(() => {
  void analyses.refresh()
  // A finished ('done' or 'error') load from a previous visit should not
  // linger (incl. the one-time private-repo notice) once Home is shown again.
  repo.dismiss()
})

function onOpen(id: string): void {
  void view.openAnalysis(id)
}

function onRename(id: string, name: string): void {
  void analyses.rename(id, name)
}

// useRepo().refresh(id) finds its target among the current analysis first;
// saved analyses now live in IndexedDB (async), so load it as current before
// refreshing. The merged result becomes current on completion anyway.
async function onRefresh(id: string): Promise<void> {
  await analyses.open(id)
  await repo.refresh(id)
}

function onDelete(id: string): void {
  void analyses.remove(id)
}

function confirmClearAll(): void {
  clearingAll.value = false
  // Preferences are cleared synchronously; the database finishes in the background.
  void analyses.clearAll()
  props.onClearAll()
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
        <StorageMeter :used-bytes="analyses.state.usageBytes" :quota-bytes="analyses.state.quotaBytes" />
      </template>
    </SaveFailedNotice>

    <div class="home__provider-row">
      <ProviderOnboardingCard />
      <HardwareSummaryPanel :report="hw.report.value" @open-settings="view.openSettings()" />
    </div>

    <RepoLoaderContainer />

    <section class="home__saved" aria-labelledby="home-saved-title">
      <div class="home__kicker" data-test="saved-kicker">
        <h2 id="home-saved-title" class="u-micro home__kicker-title">Saved analyses</h2>
        <StorageMeter :used-bytes="analyses.state.usageBytes" :quota-bytes="analyses.state.quotaBytes" />
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
      description="This removes every saved analysis (the browser's local database) and preference from this browser, and clears your keys from memory. This cannot be undone."
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

/* Home row (layout change, user decisions 2026-09-24): "Your computer" is a
   sibling of the provider card, not nested inside it — a wider 2fr column
   for the card, 1fr for the hardware panel, at >= 1024 px; stacked below
   (card first) on narrower widths. Both start-aligned so neither stretches
   to match a taller neighbor. */
.home__provider-row {
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
  gap: var(--space-3);
}

@media (min-width: 64em) {
  .home__provider-row {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }
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
