<script setup lang="ts">
// One row of the issues table (SPEC §6.3). Presentational: props/emits only.
// The Priority cell is a named slot, left empty for Task 14 to fill in.
import { computed } from 'vue'
import LevelCell from './LevelCell.vue'
import RelevanceCell from './RelevanceCell.vue'
import StatusBadge from './StatusBadge.vue'
import ConfidenceBadge from '../../ui/ConfidenceBadge.vue'
import { dateBucket } from '../../domain/dates'
import type { TableColumnId } from '../../domain/columns'
import type { IssueRow as DomainIssueRow } from '../../domain/types'

// `now` is a Function-typed prop, so Vue would use a function default as-is
// rather than calling it as a factory; the fallback is applied inline below
// instead of through withDefaults.
const props = defineProps<{
  row: DomainIssueRow
  selected: boolean
  dismissed: boolean
  tabindex: number
  now?: () => Date
  /** Visible data columns (design v2); every column when omitted. */
  columns?: TableColumnId[]
}>()

const emit = defineEmits<{
  'toggle-select': [issueNumber: number]
  dismiss: [issueNumber: number]
  restore: [issueNumber: number]
  expand: [issueNumber: number]
}>()

const issue = computed(() => props.row.issue)
const classification = computed(() => props.row.classification)
const stale = computed(() => props.row.status === 'stale')
const missing = computed(() => props.row.sourceStatus === 'missing')
const updatedLabel = computed(() => `${dateBucket(issue.value.updatedAt, props.now ?? (() => new Date()))} ago`)

const show = (id: TableColumnId) => !props.columns || props.columns.includes(id)

function onRowClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('[data-no-expand]')) return
  emit('expand', issue.value.number)
}
</script>

<template>
  <tr
    data-test="issue-row"
    class="issue-row ui-table__row"
    :class="{
      'issue-row--dismissed': dismissed,
      'issue-row--missing': missing,
      'issue-row--selected': selected,
    }"
    :tabindex="tabindex"
    @click="onRowClick"
  >
    <td class="issue-row__cell issue-row__cell--select ui-table__td" data-no-expand>
      <input
        type="checkbox"
        data-test="row-select"
        :checked="selected"
        :aria-label="`Select issue #${issue.number}`"
        @click.stop
        @change="emit('toggle-select', issue.number)"
      />
    </td>
    <td v-if="show('number')" class="issue-row__cell ui-table__td ui-table__td--mono">
      <a class="issue-row__number" :href="issue.htmlUrl" target="_blank" rel="noopener" data-no-expand @click.stop
        >#{{ issue.number }}</a
      >
    </td>
    <td v-if="show('title')" class="issue-row__cell issue-row__title ui-table__td ui-table__td--title">
      <span class="issue-row__title-text">{{ issue.title }}</span>
      <span v-if="issue.labels.length" class="issue-row__labels">
        <span v-for="label in issue.labels" :key="label" class="issue-row__label-chip">{{ label }}</span>
      </span>
    </td>
    <td v-if="show('kind')" class="issue-row__cell ui-table__td ui-table__td--mono">
      {{ classification?.kind.choice ?? '—' }}
    </td>
    <td v-if="show('priority')" class="issue-row__cell ui-table__td" data-test="priority-cell">
      <slot name="priority" :row="row">—</slot>
    </td>
    <td v-if="show('criticality')" class="issue-row__cell ui-table__td">
      <LevelCell dimension="Criticality" :value="classification?.criticality ?? null" :stale="stale" />
    </td>
    <td v-if="show('complexity')" class="issue-row__cell ui-table__td">
      <LevelCell dimension="Complexity" :value="classification?.complexity ?? null" :stale="stale" />
    </td>
    <td v-if="show('effort')" class="issue-row__cell ui-table__td">
      <LevelCell dimension="Effort" :value="classification?.effort ?? null" :stale="stale" />
    </td>
    <td v-if="show('relevance')" class="issue-row__cell ui-table__td">
      <RelevanceCell :value="classification?.relevance ?? null" />
    </td>
    <td v-if="show('confidence')" class="issue-row__cell ui-table__td" data-test="confidence-cell">
      <ConfidenceBadge v-if="classification && classification.minConfidence != null" :confidence="classification.minConfidence" />
      <span v-else class="issue-row__empty" aria-hidden="true">—</span>
    </td>
    <td v-if="show('status')" class="issue-row__cell ui-table__td">
      <StatusBadge :status="row.status" :missing="missing" :dismissed="dismissed" />
    </td>
    <td v-if="show('updated')" class="issue-row__cell ui-table__td ui-table__td--mono">{{ updatedLabel }}</td>
    <td v-if="show('comments')" class="issue-row__cell ui-table__td ui-table__td--mono">{{ issue.commentCount }}</td>
    <td class="issue-row__cell issue-row__cell--actions ui-table__td" data-no-expand>
      <button
        v-if="!dismissed"
        type="button"
        data-test="row-dismiss"
        class="issue-row__action"
        @click.stop="emit('dismiss', issue.number)"
      >
        Dismiss
      </button>
      <button
        v-else
        type="button"
        data-test="row-restore"
        class="issue-row__action"
        @click.stop="emit('restore', issue.number)"
      >
        Restore
      </button>
    </td>
  </tr>
</template>

<style scoped>
.issue-row {
  cursor: pointer;
}

.issue-row:focus-visible {
  outline: var(--line-thick) solid var(--color-accent);
  outline-offset: calc(var(--line-thick) * -1);
}

.issue-row--selected {
  background: var(--color-accent-soft);
}

.issue-row--selected .issue-row__cell--select {
  box-shadow: inset var(--line-thick) 0 0 var(--color-accent);
}

.issue-row--dismissed {
  opacity: 0.55;
}

.issue-row__cell--select {
  width: var(--icon-sm);
  padding-right: 0;
}

.issue-row__number {
  color: var(--color-text-muted);
  text-decoration: none;
}

.issue-row__number:hover {
  color: var(--color-accent);
  text-decoration: underline;
}

.issue-row__title {
  line-height: var(--text-table-line);
}

.issue-row__title-text {
  color: var(--color-text);
}

.issue-row__labels {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-left: var(--space-2);
  vertical-align: middle;
}

.issue-row__label-chip {
  padding: 0 var(--space-1);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-xs);
  color: var(--color-text-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
  white-space: nowrap;
}

.issue-row__empty {
  color: var(--color-text-subtle);
}

.issue-row__cell--actions {
  text-align: right;
}

/* Row actions are quiet until the row is hovered or focused; always reachable by keyboard. */
.issue-row__action {
  height: var(--size-compact);
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-subtle);
  font: inherit;
  font-size: var(--text-caption-size);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    background-color var(--dur-fast) var(--ease-out);
}

.issue-row:hover .issue-row__action,
.issue-row:focus-within .issue-row__action {
  color: var(--color-text-muted);
}

.issue-row__action:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}
</style>
