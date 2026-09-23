<script setup lang="ts">
// Home's storage meter (SPEC §2.2 / §10.4): "Local storage used: 2.1 MB of ~5 MB".
// Browsers give no reliable localStorage quota API, so ~5 MB is a stated
// assumption (the tilde in the copy above is part of the spec's own example).
import { computed } from 'vue'

const ASSUMED_BUDGET_BYTES = 5 * 1024 * 1024

const props = withDefaults(defineProps<{ usedBytes: number; budgetBytes?: number }>(), {
  budgetBytes: ASSUMED_BUDGET_BYTES,
})

const ratio = computed(() => (props.budgetBytes > 0 ? props.usedBytes / props.budgetBytes : 0))
const status = computed<'ok' | 'warning' | 'critical'>(() => {
  if (ratio.value >= 0.95) return 'critical'
  if (ratio.value > 0.8) return 'warning'
  return 'ok'
})
const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const label = computed(() => `Local storage used: ${formatMb(props.usedBytes)} of ~${formatMb(props.budgetBytes)}`)
</script>

<template>
  <div class="storage-meter" :class="`storage-meter--${status}`" data-test="storage-meter">
    <p class="storage-meter__label u-tabular">{{ label }}</p>
    <div class="storage-meter__track" role="progressbar" :aria-valuenow="Math.round(ratio * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="label">
      <div class="storage-meter__fill" :style="{ width: `${Math.min(100, ratio * 100)}%` }" />
    </div>
  </div>
</template>

<style scoped>
.storage-meter {
  display: grid;
  gap: var(--space-1);
}

.storage-meter__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
  color: var(--color-text-subtle);
  text-align: right;
}

.storage-meter__track {
  height: calc(var(--line-thick) + var(--line-thin));
  background: var(--color-surface-2);
  border-radius: var(--radius-round);
  overflow: hidden;
}

.storage-meter__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
  transition: width var(--dur-base) var(--ease-standard);
}

.storage-meter--warning .storage-meter__fill {
  background: var(--color-warning);
}

.storage-meter--critical .storage-meter__fill {
  background: var(--color-danger);
}
</style>
