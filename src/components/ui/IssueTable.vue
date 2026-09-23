<script setup lang="ts">
// The issues table (SPEC §6.3, §10.7): sticky header, virtual scrolling above
// 200 rows via @tanstack/vue-virtual, roving-tabindex keyboard navigation
// (Arrow keys, Enter, D — "/" to focus search is owned by IssuesContainer,
// since the search input lives in a sibling, FilterBar).
// Native <table> markup throughout, including while virtualized: the window
// is rendered as real <tr> rows plus two spacer rows, so table semantics
// (§10.7) survive virtualization.
import { computed, nextTick, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import IssueRow from './IssueRow.vue'
import { tokens } from '../../ui/tokens'
import type { IssueRow as DomainIssueRow, SortKey, SortRule } from '../../domain/types'

const VIRTUALIZE_THRESHOLD = 200
const ROW_HEIGHT = tokens.size.row
const VISIBLE_ROWS_ESTIMATE = 12

interface ColumnDef {
  key?: SortKey
  label: string
  hiddenLabel?: boolean
}

const COLUMNS: ColumnDef[] = [
  { label: 'Select', hiddenLabel: true },
  { key: 'number', label: '#' },
  { label: 'Title' },
  { label: 'Kind' },
  { key: 'priority', label: 'Priority' },
  { key: 'criticality', label: 'Criticality' },
  { key: 'complexity', label: 'Complexity' },
  { key: 'effort', label: 'Effort' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'minConfidence', label: 'Confidence' },
  { label: 'Status' },
  { key: 'updatedAt', label: 'Updated' },
  { key: 'commentCount', label: 'Comments' },
  { label: 'Actions' },
]
const COLUMN_COUNT = COLUMNS.length

const props = defineProps<{
  rows: DomainIssueRow[]
  /** Issue numbers currently selected for bulk actions. */
  selected: number[]
  /** Issue numbers currently dismissed; only relevant while these rows are visible (Show dismissed). */
  dismissedNumbers?: number[]
  sort: SortRule | null
  now?: () => Date
}>()

const emit = defineEmits<{
  'toggle-select': [issueNumber: number]
  dismiss: [issueNumber: number]
  restore: [issueNumber: number]
  expand: [issueNumber: number]
  sort: [key: SortKey]
  /** Shift-click (Task 13, SPEC.md §2.5 item 3): adds the column as the next sort key. */
  'shift-sort': [key: SortKey]
}>()

const scrollRef = ref<HTMLElement | null>(null)
const focusedIndex = ref(0)

watch(
  () => props.rows.length,
  (length) => {
    if (focusedIndex.value > length - 1) focusedIndex.value = Math.max(0, length - 1)
  },
)

const selectedSet = computed(() => new Set(props.selected))
const dismissedSet = computed(() => new Set(props.dismissedNumbers ?? []))
const isVirtualized = computed(() => props.rows.length > VIRTUALIZE_THRESHOLD)

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.rows.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    // A deterministic viewport for environments without real layout (tests, SSR).
    initialRect: { width: 0, height: ROW_HEIGHT * VISIBLE_ROWS_ESTIMATE },
  })),
)

const virtualItems = computed(() => (isVirtualized.value ? virtualizer.value.getVirtualItems() : []))
const totalSize = computed(() => virtualizer.value.getTotalSize())
const paddingTop = computed(() => virtualItems.value[0]?.start ?? 0)
const paddingBottom = computed(() => {
  const last = virtualItems.value[virtualItems.value.length - 1]
  return Math.max(0, totalSize.value - (last?.end ?? 0))
})

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (!props.sort || props.sort.key !== key) return 'none'
  return props.sort.direction === 'asc' ? 'ascending' : 'descending'
}

function onHeaderClick(column: ColumnDef, event: MouseEvent) {
  if (!column.key) return
  if (event.shiftKey) emit('shift-sort', column.key)
  else emit('sort', column.key)
}

function isDismissed(row: DomainIssueRow): boolean {
  return dismissedSet.value.has(row.issue.number)
}

async function moveFocus(delta: number) {
  const next = Math.min(props.rows.length - 1, Math.max(0, focusedIndex.value + delta))
  if (next === focusedIndex.value || next < 0) return
  focusedIndex.value = next
  if (isVirtualized.value) virtualizer.value.scrollToIndex(next, { align: 'auto' })
  await nextTick()
  scrollRef.value?.querySelector<HTMLElement>(`[data-row-index="${next}"]`)?.focus()
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function onKeydown(event: KeyboardEvent) {
  if (isTypingTarget(event.target)) return
  const focusedRow = props.rows[focusedIndex.value]
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveFocus(1)
      return
    case 'ArrowUp':
      event.preventDefault()
      moveFocus(-1)
      return
    case 'Enter':
      if (focusedRow) emit('expand', focusedRow.issue.number)
      return
    case 'd':
    case 'D':
      if (!focusedRow) return
      if (isDismissed(focusedRow)) emit('restore', focusedRow.issue.number)
      else emit('dismiss', focusedRow.issue.number)
  }
}
</script>

<template>
  <div ref="scrollRef" class="issue-table__scroll">
    <table class="issue-table" @keydown="onKeydown">
      <thead>
        <tr>
          <th
            v-for="column in COLUMNS"
            :key="column.label"
            scope="col"
            class="issue-table__th"
            :class="{ 'issue-table__th--sortable': column.key }"
            :aria-sort="column.key ? ariaSort(column.key) : undefined"
            :data-test="column.key ? `sort-${column.key}` : undefined"
            @click="onHeaderClick(column, $event)"
          >
            <!--
              Task 14's Weights popover button lands next to this label
              (SPEC §2.5 item 3), without changing the column's sort wiring.
            -->
            <slot v-if="column.key === 'priority'" name="priority-header">
              <span>{{ column.label }}</span>
            </slot>
            <span v-else :class="{ 'u-visually-hidden': column.hiddenLabel }">{{ column.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody v-if="!isVirtualized">
        <IssueRow
          v-for="(row, index) in rows"
          :key="row.issue.number"
          :data-row-index="index"
          :row="row"
          :selected="selectedSet.has(row.issue.number)"
          :dismissed="isDismissed(row)"
          :tabindex="index === focusedIndex ? 0 : -1"
          :now="now"
          @toggle-select="emit('toggle-select', $event)"
          @dismiss="emit('dismiss', $event)"
          @restore="emit('restore', $event)"
          @expand="emit('expand', $event)"
        >
          <!--
            Task 14's Priority cell (SPEC §6.3 column 4) lands here, scoped
            to each row: `<template #priority="{ row }">…</template>`.
          -->
          <template #priority>
            <slot name="priority" :row="row">—</slot>
          </template>
        </IssueRow>
      </tbody>
      <tbody v-else>
        <tr v-if="paddingTop > 0" class="issue-table__spacer" aria-hidden="true">
          <td :colspan="COLUMN_COUNT" :style="{ height: `${paddingTop}px` }" />
        </tr>
        <IssueRow
          v-for="item in virtualItems"
          :key="String(item.key)"
          :data-row-index="item.index"
          :row="rows[item.index]"
          :selected="selectedSet.has(rows[item.index].issue.number)"
          :dismissed="isDismissed(rows[item.index])"
          :tabindex="item.index === focusedIndex ? 0 : -1"
          :now="now"
          @toggle-select="emit('toggle-select', $event)"
          @dismiss="emit('dismiss', $event)"
          @restore="emit('restore', $event)"
          @expand="emit('expand', $event)"
        >
          <template #priority>
            <slot name="priority" :row="rows[item.index]">—</slot>
          </template>
        </IssueRow>
        <tr v-if="paddingBottom > 0" class="issue-table__spacer" aria-hidden="true">
          <td :colspan="COLUMN_COUNT" :style="{ height: `${paddingBottom}px` }" />
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.issue-table__scroll {
  overflow: auto;
  max-height: calc(var(--size-row) * 12);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
}

.issue-table {
  width: 100%;
  border-collapse: collapse;
}

.issue-table__th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--space-2);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  text-align: left;
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  box-shadow: 0 var(--line-thin) 0 var(--color-border);
}

.issue-table__th--sortable {
  cursor: pointer;
  user-select: none;
}

.issue-table__spacer td {
  padding: 0;
  border: 0;
}
</style>
