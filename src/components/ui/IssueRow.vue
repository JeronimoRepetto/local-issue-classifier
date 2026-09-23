<script setup lang="ts">
// One row of the issues table (SPEC §6.3). Presentational: props/emits only.
// The Priority cell is a named slot, left empty for Task 14 to fill in.
import { computed } from 'vue'
import LevelCell from './LevelCell.vue'
import RelevanceCell from './RelevanceCell.vue'
import StatusBadge from './StatusBadge.vue'
import ConfidenceBadge from '../../ui/ConfidenceBadge.vue'
import { dateBucket } from '../../domain/dates'
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

function onRowClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('[data-no-expand]')) return
  emit('expand', issue.value.number)
}
</script>

<template>
  <tr
    data-test="issue-row"
    class="issue-row"
    :class="{ 'issue-row--dismissed': dismissed, 'issue-row--missing': missing }"
    :tabindex="tabindex"
    @click="onRowClick"
  >
    <td class="issue-row__cell" data-no-expand>
      <input
        type="checkbox"
        data-test="row-select"
        :checked="selected"
        :aria-label="`Select issue #${issue.number}`"
        @click.stop
        @change="emit('toggle-select', issue.number)"
      />
    </td>
    <td class="issue-row__cell u-tabular">
      <a :href="issue.htmlUrl" target="_blank" rel="noopener" data-no-expand @click.stop>#{{ issue.number }}</a>
    </td>
    <td class="issue-row__cell issue-row__title">
      <span>{{ issue.title }}</span>
      <span v-if="issue.labels.length" class="issue-row__labels">
        <span v-for="label in issue.labels" :key="label" class="issue-row__label-chip">{{ label }}</span>
      </span>
    </td>
    <td class="issue-row__cell">{{ classification?.kind.choice ?? '—' }}</td>
    <td class="issue-row__cell" data-test="priority-cell">
      <slot name="priority" :row="row">—</slot>
    </td>
    <td class="issue-row__cell">
      <LevelCell dimension="Criticality" :value="classification?.criticality ?? null" :stale="stale" />
    </td>
    <td class="issue-row__cell">
      <LevelCell dimension="Complexity" :value="classification?.complexity ?? null" :stale="stale" />
    </td>
    <td class="issue-row__cell">
      <LevelCell dimension="Effort" :value="classification?.effort ?? null" :stale="stale" />
    </td>
    <td class="issue-row__cell">
      <RelevanceCell :value="classification?.relevance ?? null" />
    </td>
    <td class="issue-row__cell" data-test="confidence-cell">
      <ConfidenceBadge v-if="classification && classification.minConfidence != null" :confidence="classification.minConfidence" />
      <span v-else aria-hidden="true">—</span>
    </td>
    <td class="issue-row__cell">
      <StatusBadge :status="row.status" :missing="missing" :dismissed="dismissed" />
    </td>
    <td class="issue-row__cell u-tabular">{{ updatedLabel }}</td>
    <td class="issue-row__cell u-tabular">{{ issue.commentCount }}</td>
    <td class="issue-row__cell" data-no-expand>
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
  height: var(--size-row);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-standard);
}

.issue-row:hover {
  background: var(--color-surface-2);
}

.issue-row:focus-visible {
  outline: var(--line-thick) solid var(--color-accent);
  outline-offset: calc(var(--line-thick) * -1);
}

.issue-row--dismissed {
  opacity: 0.6;
}

.issue-row__cell {
  padding: var(--space-2);
  border-bottom: var(--line-thin) solid var(--color-border);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  vertical-align: middle;
}

.issue-row__title {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.issue-row__labels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.issue-row__label-chip {
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.issue-row__action {
  border: 0;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  font-size: var(--text-table-size);
  cursor: pointer;
}

.issue-row__action:hover {
  text-decoration: underline;
}
</style>
