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

    <div class="filter-bar__facets">

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
    </div>

    <details class="filter-bar__ranges">
      <summary class="filter-bar__ranges-toggle">Relevance and confidence ranges</summary>
      <div class="filter-bar__ranges-body">
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
      </div>
    </details>

    <UiButton class="filter-bar__reset" data-test="reset-filters" variant="ghost" size="compact" @click="emit('reset')">
      Reset filters
    </UiButton>
  </div>
</template>

<style scoped>
.filter-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2h) var(--space-3);
}

.filter-bar > :first-child,
.filter-bar__facets {
  grid-column: 1 / -1;
}

.filter-bar__facets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-7) * 2 + var(--space-4)), 1fr));
  gap: var(--space-2h);
}

.filter-bar__ranges-toggle {
  width: fit-content;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--size-compact);
  cursor: pointer;
}

.filter-bar__ranges-toggle:hover {
  color: var(--color-text);
}

.filter-bar__ranges-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-7) * 3), 1fr));
  gap: var(--space-2h) var(--space-4);
  padding-top: var(--space-2);
}

.filter-bar__reset {
  align-self: start;
}
</style>
