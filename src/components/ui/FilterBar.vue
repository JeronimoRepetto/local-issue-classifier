<script setup lang="ts">
// Filter bar (SPEC §2.5 item 1): every dimension combines with AND, applied
// by domain/filter.ts. Presentational: emits a patch per control, and a
// `reset` event for "Reset filters". `focusSearch` is exposed for the "/"
// keyboard shortcut, owned by the parent IssuesContainer.
import { computed, ref } from 'vue'
import UiInput from '../../ui/UiInput.vue'
import UiMultiSelect from '../../ui/UiMultiSelect.vue'
import UiSlider from '../../ui/UiSlider.vue'
import UiButton from '../../ui/UiButton.vue'
import IconSearch from '../../assets/icons/IconSearch.vue'
import type { ClassificationStatus, IssueFilter, IssueKind, Level } from '../../domain/types'

const props = defineProps<{ filter: IssueFilter; availableLabels: string[] }>()
const emit = defineEmits<{ update: [patch: Partial<IssueFilter>]; reset: [] }>()

const LEVEL_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]
const KIND_OPTIONS = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'question', label: 'Question' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
]
const STATUS_OPTIONS = [
  { value: 'unclassified', label: 'Unclassified' },
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Classified' },
  { value: 'error', label: 'Error' },
  { value: 'stale', label: 'Stale' },
]

const labelOptions = computed(() => props.availableLabels.map((label) => ({ value: label, label })))

const searchRoot = ref<{ $el: HTMLElement } | null>(null)

function focusSearch(): void {
  searchRoot.value?.$el?.querySelector<HTMLInputElement>('input')?.focus()
}

defineExpose({ focusSearch })

function onLevels(dimension: 'complexity' | 'criticality' | 'effort', values: string[]) {
  emit('update', { [dimension]: values as Level[] })
}

function onKinds(values: string[]) {
  emit('update', { kind: values as IssueKind[] })
}

function onStatuses(values: string[]) {
  emit('update', { statuses: values as ClassificationStatus[] })
}
</script>

<template>
  <div class="filter-bar">
    <UiInput
      ref="searchRoot"
      data-test="search-input"
      type="search"
      label="Search"
      placeholder="Number, title, body, labels, author…"
      clearable
      :model-value="filter.text"
      @update:model-value="emit('update', { text: $event })"
    >
      <template #prefix><IconSearch aria-hidden="true" /></template>
    </UiInput>

    <UiMultiSelect
      data-test="filter-criticality"
      label="Criticality"
      :options="LEVEL_OPTIONS"
      :model-value="filter.criticality"
      @update:model-value="onLevels('criticality', $event)"
    />
    <UiMultiSelect
      data-test="filter-complexity"
      label="Complexity"
      :options="LEVEL_OPTIONS"
      :model-value="filter.complexity"
      @update:model-value="onLevels('complexity', $event)"
    />
    <UiMultiSelect
      data-test="filter-effort"
      label="Effort"
      :options="LEVEL_OPTIONS"
      :model-value="filter.effort"
      @update:model-value="onLevels('effort', $event)"
    />
    <UiMultiSelect
      data-test="filter-kind"
      label="Kind"
      :options="KIND_OPTIONS"
      :model-value="filter.kind"
      @update:model-value="onKinds"
    />
    <UiMultiSelect
      data-test="filter-status"
      label="Status"
      :options="STATUS_OPTIONS"
      :model-value="filter.statuses"
      @update:model-value="onStatuses"
    />
    <UiMultiSelect
      data-test="filter-labels"
      label="Labels"
      :options="labelOptions"
      :model-value="filter.labels"
      @update:model-value="emit('update', { labels: $event })"
    />

    <UiSlider
      data-test="relevance-min"
      label="Min relevance"
      :model-value="filter.relevanceMin"
      @update:model-value="emit('update', { relevanceMin: $event })"
    />
    <UiSlider
      data-test="relevance-max"
      label="Max relevance"
      :model-value="filter.relevanceMax"
      @update:model-value="emit('update', { relevanceMax: $event })"
    />
    <UiSlider
      data-test="min-confidence"
      label="Minimum confidence"
      :min="0"
      :max="1"
      :step="0.05"
      :model-value="filter.minConfidence"
      @update:model-value="emit('update', { minConfidence: $event })"
    />

    <UiButton data-test="reset-filters" variant="ghost" @click="emit('reset')">Reset filters</UiButton>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.filter-bar :deep(.ui-slider) {
  min-width: calc(var(--space-7) * 2);
}
</style>
