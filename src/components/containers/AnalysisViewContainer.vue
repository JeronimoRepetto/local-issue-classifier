<script setup lang="ts">
// The analysis view (SPEC §2.4, §2.5, §2.6, §6.1 screen 3), replacing
// AnalysisViewPlaceholder.vue. Mounts ClassifyContainer and IssuesContainer
// over the current analysis, wires refresh/back/open-settings to
// useRepo()/useView(), computes the filtered-view issue numbers for "Classify
// filtered view", and owns the "?" shortcuts help dialog left out by Task 12.
//
// Task FU: mounts ExportContainer from the Export button in the export slot
// below, and RepoLoadFeedback (the huge-repo/comment-cost confirmations,
// progress+Cancel, rate-limit/error recovery and save-failed notices,
// extracted out of RepoLoaderContainer) so refreshing from here shows the
// same feedback as refreshing from Home.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAnalysis } from '../../composables/useAnalysis'
import { useFilters } from '../../composables/useFilters'
import { useRepo } from '../../composables/useRepo'
import { useView } from '../../composables/useView'
import { filterRows } from '../../domain/filter'
import ClassifyContainer from './ClassifyContainer.vue'
import ExportContainer from './ExportContainer.vue'
import IssuesContainer from './IssuesContainer.vue'
import RepoLoadFeedback from './RepoLoadFeedback.vue'
import ShortcutsHelpDialog from '../ui/ShortcutsHelpDialog.vue'
import UiButton from '../../ui/UiButton.vue'
import UiTooltip from '../../ui/UiTooltip.vue'

const analysis = useAnalysis()
const filters = useFilters()
const repo = useRepo()
const view = useView()

/** A refresh started from this view is "in progress" through these load phases. */
const REFRESH_BUSY_PHASES = new Set(['loading', 'confirm-huge-repo', 'confirm-comment-cost'])
const refreshing = computed(() => repo.state.mode === 'refresh' && REFRESH_BUSY_PHASES.has(repo.state.phase))

function onRefresh(): void {
  const id = analysis.current.value?.id
  if (id) repo.refresh(id)
}

function onBack(): void {
  view.goHome()
}

function onOpenSettings(): void {
  view.openSettings()
}

/**
 * The currently visible, non-dismissed issue numbers, for "Classify filtered
 * view" (§2.4: dismissed issues are skipped by every Classify scope, so this
 * always excludes them, even while "Show dismissed" is on).
 */
const filteredNumbers = computed<number[]>(() => {
  const current = analysis.current.value
  if (!current) return []
  const dismissed = new Set(current.working.dismissed)
  const remaining = current.rows.filter((row) => !dismissed.has(row.issue.number))
  return filterRows(remaining, filters.filter.value).map((row) => row.issue.number)
})

/** Reuses the same "visible, non-dismissed" set as Classify to gate the Export entry point. */
const hasVisibleRows = computed(() => filteredNumbers.value.length > 0)

// ── Export (§2.6) ─────────────────────────────────────────────────────────
const exportOpen = ref(false)

// "?" opens the shortcuts help dialog; ignored while typing, like IssuesContainer's "/".
const helpOpen = ref(false)

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== '?') return
  if (isTypingTarget(event.target)) return
  event.preventDefault()
  helpOpen.value = true
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<template>
  <div class="analysis-view" data-test="analysis-view-container">
    <ClassifyContainer :filtered-numbers="filteredNumbers" @open-settings="onOpenSettings" />

    <IssuesContainer :refreshing="refreshing" @refresh="onRefresh" @back="onBack" />

    <RepoLoadFeedback show-save-failed @retry="onRefresh" />

    <div class="analysis-view__export-slot" data-test="export-slot">
      <UiTooltip v-if="!hasVisibleRows" text="No visible issues to export.">
        <template #default="{ describedBy }">
          <UiButton
            data-test="export-open"
            variant="secondary"
            disabled
            :aria-describedby="describedBy"
            @click="exportOpen = true"
          >
            Export
          </UiButton>
        </template>
      </UiTooltip>
      <UiButton v-else data-test="export-open" variant="secondary" @click="exportOpen = true">Export</UiButton>
    </div>

    <ExportContainer :open="exportOpen" @close="exportOpen = false" />

    <ShortcutsHelpDialog :open="helpOpen" @close="helpOpen = false" />
  </div>
</template>

<style scoped>
.analysis-view {
  display: grid;
  gap: var(--space-3);
}

.analysis-view__export-slot {
  display: flex;
  justify-content: flex-end;
}
</style>
