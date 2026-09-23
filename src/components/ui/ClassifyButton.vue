<script setup lang="ts">
// The Classify control (SPEC §2.4, §6.2): a scope picker, the primary action
// with the count it will send, and the pre-run estimate (§4.7). Disabled
// without a Jev key, when the scope is empty, or while a run is active.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiSelect from '../../ui/UiSelect.vue'
import type { SelectOption } from '../../ui/UiSelect.vue'
import type { ScopeCounts } from '../../domain/classifyRun'

export type ClassifyButtonScope = 'unclassified' | 'all' | 'filtered'

export interface ClassifyButtonEstimate {
  requests: number
  inputTokens: number
  costUsd: number
  seconds: number
  tooLarge: number
}

const props = defineProps<{
  hasKey: boolean
  counts: ScopeCounts
  scope: ClassifyButtonScope
  estimate: ClassifyButtonEstimate | null
  running: boolean
}>()

const emit = defineEmits<{
  start: [scope: ClassifyButtonScope]
  'update:scope': [scope: ClassifyButtonScope]
  'open-settings': []
}>()

const LABELS: Record<ClassifyButtonScope, string> = {
  unclassified: 'Classify unclassified',
  all: 'Re-classify all',
  filtered: 'Classify filtered view',
}

const countFor = (scope: ClassifyButtonScope) =>
  scope === 'filtered' ? (props.counts.filtered ?? 0) : props.counts[scope]

const options = computed<SelectOption[]>(() => {
  const scopes: ClassifyButtonScope[] =
    props.counts.filtered === null ? ['unclassified', 'all'] : ['unclassified', 'all', 'filtered']
  return scopes.map((scope) => ({ value: scope, label: `${LABELS[scope]} (${countFor(scope)})` }))
})

const count = computed(() => countFor(props.scope))
const disabled = computed(() => !props.hasKey || props.running || count.value === 0)

function formatCost(usd: number): string {
  return usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)
}

const estimateText = computed(() => {
  const e = props.estimate
  if (!e) return ''
  const calls = `≈ ${e.requests} ${e.requests === 1 ? 'call' : 'calls'}`
  const tokens = `≈ ${(e.inputTokens / 1000).toFixed(1)} k input tokens`
  return `${calls} · ${tokens} · ≈ $${formatCost(e.costUsd)} · ≈ ${e.seconds} s`
})
</script>

<template>
  <div class="classify-button">
    <div class="classify-button__row">
      <UiSelect
        class="classify-button__scope"
        label="Classify scope"
        :model-value="scope"
        :options="options"
        :disabled="running"
        @update:model-value="emit('update:scope', $event as ClassifyButtonScope)"
      />
      <UiButton data-test="classify-start" variant="primary" :disabled="disabled" @click="emit('start', scope)">
        {{ LABELS[scope] }} ({{ count }})
      </UiButton>
    </div>

    <p v-if="!hasKey" class="classify-button__hint">
      Add a Jev key in Settings to classify.
      <UiButton data-test="classify-open-settings" variant="ghost" size="compact" @click="emit('open-settings')">
        Open Settings
      </UiButton>
    </p>
    <p v-else-if="estimate && count > 0" class="classify-button__hint">
      <span data-test="classify-estimate" class="u-tabular">{{ estimateText }}</span>
      <span v-if="estimate.tooLarge > 0"> · {{ estimate.tooLarge }} too large to send</span>
    </p>
  </div>
</template>

<style scoped>
.classify-button {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
}

.classify-button__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2);
}

.classify-button__hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--size-default);
  margin: 0;
  color: var(--color-text-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}
</style>
