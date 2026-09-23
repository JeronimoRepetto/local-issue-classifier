<script setup lang="ts">
// The analysis view (SPEC §2.4, §2.5, §6.1 screen 3), replacing
// AnalysisViewPlaceholder.vue. Mounts ClassifyContainer and IssuesContainer
// over the current analysis, wires refresh/back/open-settings to
// useRepo()/useView(), computes the filtered-view issue numbers for "Classify
// filtered view", and owns the "?" shortcuts help dialog left out by Task 12.
//
// TODO(T14): mount ExportContainer in the slot below once Task 13 lands it —
// do not import it from this lane.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAnalysis } from '../../composables/useAnalysis'
import { useFilters } from '../../composables/useFilters'
import { useRepo } from '../../composables/useRepo'
import { useView } from '../../composables/useView'
import { filterRows } from '../../domain/filter'
import ClassifyContainer from './ClassifyContainer.vue'
import IssuesContainer from './IssuesContainer.vue'
import ShortcutsHelpDialog from '../ui/ShortcutsHelpDialog.vue'

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

    <div class="analysis-view__export-slot" data-test="export-slot">
      <p class="analysis-view__export-placeholder">Export lands with Task 13/14.</p>
    </div>

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

.analysis-view__export-placeholder {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
}
</style>
