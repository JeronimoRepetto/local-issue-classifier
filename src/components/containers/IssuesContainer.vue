<script setup lang="ts">
// Issues screen container (SPEC §2.5, §6.1 screen 3). Wires useAnalysis() and
// useFilters() to the presentational pieces: FilterBar, DismissToggle,
// IssueTable, the detail drawer, bulk dismiss/undo, and "Remove missing".
// Refresh/back bubble straight through as props/emits — this file, not just
// AnalysisHeader, deliberately never imports useRepo.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAnalysis } from '../../composables/useAnalysis'
import { useFilters } from '../../composables/useFilters'
import { useColumns } from '../../composables/useColumns'
import { summarize, visibleRows } from '../../domain/analysis'
import { filterRows } from '../../domain/filter'
import { sortRowsBy } from '../../domain/sort'
import { priorityOf } from '../../domain/priority'
import { defaultPriorityWeights } from '../../domain/types'
import type { ExportOrder, IssueRow as DomainIssueRow, PriorityWeights } from '../../domain/types'
import AnalysisHeader from '../ui/AnalysisHeader.vue'
import ColumnsMenu from '../ui/ColumnsMenu.vue'
import DismissToggle from '../ui/DismissToggle.vue'
import FilterBar from '../ui/FilterBar.vue'
import IssueTable from '../ui/IssueTable.vue'
import IssueDetailDrawer from '../ui/IssueDetailDrawer.vue'
import PriorityCell from '../ui/PriorityCell.vue'
import PriorityContainer from './PriorityContainer.vue'
import UiButton from '../../ui/UiButton.vue'
import UiDialog from '../../ui/UiDialog.vue'
import UiToastStack from '../../ui/UiToastStack.vue'
import type { ToastItem } from '../../ui/UiToastStack.vue'
import EmptyState from '../../ui/EmptyState.vue'

defineProps<{ refreshing?: boolean }>()
const emit = defineEmits<{ refresh: []; back: [] }>()

const analysis = useAnalysis()
const filters = useFilters()
const columns = useColumns()

const filterBarRef = ref<{ focusSearch: () => void } | null>(null)

/** The table's `RowSort`: the real multi-key sort (Task 13, SPEC.md §2.5 item 3). */
function applyTableSort(rows: DomainIssueRow[], order: ExportOrder, weights: PriorityWeights): DomainIssueRow[] {
  return sortRowsBy(rows, order, weights)
}

const visible = computed(() =>
  analysis.current.value
    ? visibleRows(analysis.current.value, { filter: filterRows, sort: applyTableSort })
    : [],
)

const summary = computed(() => (analysis.current.value ? summarize(analysis.current.value) : null))

const availableLabels = computed(() => {
  const labels = new Set<string>()
  for (const row of analysis.current.value?.rows ?? []) {
    for (const label of row.issue.labels) labels.add(label)
  }
  return [...labels].sort()
})

const hasMissing = computed(() => (analysis.current.value?.rows ?? []).some((r) => r.sourceStatus === 'missing'))

/** The current analysis's priority weights (Task 14, §4.9), for the Priority cell. */
const priorityWeights = computed<PriorityWeights>(
  () => analysis.current.value?.working.priorityWeights ?? defaultPriorityWeights(),
)

// ── Bulk selection ──────────────────────────────────────────────────────
const selected = ref<Set<number>>(new Set())

watch(
  () => analysis.current.value?.id,
  () => {
    selected.value = new Set()
  },
)

function toggleSelect(issueNumber: number): void {
  const next = new Set(selected.value)
  if (next.has(issueNumber)) next.delete(issueNumber)
  else next.add(issueNumber)
  selected.value = next
}

function clearSelection(): void {
  selected.value = new Set()
}

// ── Undo toasts ─────────────────────────────────────────────────────────
let nextToastId = 0
const toasts = ref<ToastItem[]>([])
const undoActions = new Map<number, () => void>()

function pushUndoToast(message: string, undo: () => void): void {
  const id = nextToastId++
  undoActions.set(id, undo)
  toasts.value = [...toasts.value, { id, kind: 'success', message: `${message} · Undo`, actionLabel: 'Undo' }]
}

function removeToast(id: ToastItem['id']): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
  undoActions.delete(id as number)
}

function onToastAction(id: ToastItem['id']): void {
  undoActions.get(id as number)?.()
  removeToast(id)
}

// ── Dismiss / restore (§2.5 item 4) ─────────────────────────────────────
function dismissOne(issueNumber: number): void {
  analysis.dismiss([issueNumber])
  pushUndoToast('Issue dismissed', () => analysis.restore([issueNumber]))
}

function restoreOne(issueNumber: number): void {
  analysis.restore([issueNumber])
}

function bulkDismiss(): void {
  const numbers = [...selected.value]
  if (numbers.length === 0) return
  analysis.dismiss(numbers)
  clearSelection()
  pushUndoToast(`${numbers.length} issues dismissed`, () => analysis.restore(numbers))
}

function bulkRestore(): void {
  const numbers = [...selected.value]
  if (numbers.length === 0) return
  analysis.restore(numbers)
  clearSelection()
}

// ── Remove missing (§2.5 item 5) ─────────────────────────────────────────
const removeMissingOpen = ref(false)

function confirmRemoveMissing(): void {
  analysis.removeMissing()
  removeMissingOpen.value = false
}

// ── Detail drawer ─────────────────────────────────────────────────────────
const expandedIssueNumber = computed(() => analysis.current.value?.working.expandedIssue ?? null)
const expandedIssue = computed(
  () => analysis.current.value?.rows.find((row) => row.issue.number === expandedIssueNumber.value)?.issue ?? null,
)

function openDrawer(issueNumber: number): void {
  analysis.updateWorking({ expandedIssue: issueNumber })
}

function closeDrawer(): void {
  analysis.updateWorking({ expandedIssue: null })
}

// ── "/" focuses search; D, Enter and Arrow keys are IssueTable's own ─────
function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== '/') return
  const target = event.target
  if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  event.preventDefault()
  filterBarRef.value?.focusSearch()
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<template>
  <div v-if="analysis.current.value" class="issues-container">
    <AnalysisHeader
      :name="analysis.current.value.name"
      :repo-full-name="analysis.current.value.repo.fullName"
      :fetched-at="analysis.current.value.fetchedAt"
      :visible-count="visible.length"
      :total-count="analysis.current.value.rows.length"
      :dismissed-count="summary?.counts.dismissed ?? 0"
      :show-dismissed="analysis.current.value.working.showDismissed"
      :refreshing="refreshing"
      @refresh="emit('refresh')"
      @back="emit('back')"
    >
      <template #actions><slot name="header-actions" /></template>
    </AnalysisHeader>

    <!-- The analysis view mounts the classify bar and load feedback here, under the header. -->
    <slot name="after-header" />

    <div class="issues-container__toolbar">
      <FilterBar
        ref="filterBarRef"
        :filter="filters.filter.value"
        :available-labels="availableLabels"
        @update="filters.setFilter"
        @reset="filters.resetFilters"
      />
      <DismissToggle
        :model-value="analysis.current.value.working.showDismissed"
        @update:model-value="(value: boolean) => analysis.updateWorking({ showDismissed: value })"
      />
      <span class="issues-container__spacer" />
      <UiButton v-if="hasMissing" data-test="remove-missing" variant="ghost" @click="removeMissingOpen = true">
        Remove missing
      </UiButton>
      <!--
        Task 13's "Sort" popover (SortRuleList editing the full multi-key
        order, SPEC §2.5 item 3) mounts here; `sort` and `setSort` are already
        wired below so it only needs to replace this fallback trigger.
      -->
      <slot name="sort-popover" :sort="filters.sort.value" :set-sort="filters.setSort" />
      <ColumnsMenu :visible="columns.visible.value" @toggle="columns.toggle" @reset="columns.reset" />
    </div>

    <div v-if="selected.size > 0" class="issues-container__bulk-bar" role="region" aria-label="Bulk actions">
      <span class="issues-container__bulk-count u-mono">{{ selected.size }} selected</span>
      <UiButton data-test="bulk-dismiss" variant="secondary" size="compact" @click="bulkDismiss">Dismiss selected</UiButton>
      <UiButton data-test="bulk-restore" variant="ghost" size="compact" @click="bulkRestore">Restore selected</UiButton>
      <UiButton variant="ghost" size="compact" @click="clearSelection">Clear selection</UiButton>
    </div>

    <EmptyState
      v-if="visible.length === 0"
      title="No matching issues"
      description="Try adjusting or resetting your filters."
    >
      <template #action>
        <UiButton variant="secondary" @click="filters.resetFilters">Reset filters</UiButton>
      </template>
    </EmptyState>
    <IssueTable
      v-else
      :rows="visible"
      :selected="[...selected]"
      :dismissed-numbers="analysis.current.value.working.dismissed"
      :sort="filters.sort.value"
      :columns="columns.visible.value"
      @toggle-select="toggleSelect"
      @dismiss="dismissOne"
      @restore="restoreOne"
      @expand="openDrawer"
      @sort="filters.setSort"
      @shift-sort="filters.addSortKey"
    >
      <!-- Task 14, SPEC.md §6.3 column 4: the Weights popover trigger next to the Priority header. -->
      <template #priority-header>
        <PriorityContainer />
      </template>
      <!-- Task 14: each row's Priority cell, scoped to that row's classification. -->
      <template #priority="{ row }">
        <PriorityCell :value="priorityOf(row.classification, priorityWeights)" />
      </template>
    </IssueTable>

    <IssueDetailDrawer :open="expandedIssueNumber !== null" :issue="expandedIssue" @close="closeDrawer" />

    <UiDialog
      :open="removeMissingOpen"
      title="Remove missing issues"
      description="These issues are no longer in the source repository. Removing them permanently deletes them, and their classification, from this analysis."
      @close="removeMissingOpen = false"
    >
      <template #actions>
        <UiButton variant="ghost" @click="removeMissingOpen = false">Cancel</UiButton>
        <UiButton data-test="confirm-remove-missing" variant="danger" @click="confirmRemoveMissing">
          Remove missing
        </UiButton>
      </template>
    </UiDialog>

    <UiToastStack :toasts="toasts" @dismiss="removeToast" @action="onToastAction" />
  </div>
</template>

<style scoped>
.issues-container {
  display: grid;
  gap: var(--space-3);
}

.issues-container__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2);
}

.issues-container__toolbar > :first-child {
  flex: 1 1 100%;
}

.issues-container__spacer {
  flex: 1;
}

.issues-container__bulk-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2h);
  background: var(--color-accent-soft);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
}

.issues-container__bulk-count {
  margin-right: auto;
  color: var(--color-accent);
  font-size: var(--text-caption-size);
}
</style>
