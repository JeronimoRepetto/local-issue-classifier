<script setup lang="ts">
// Home's storage meter (SPEC §2.2 / §10.4): "Local storage used: 12.3 MB of 48.2 GB available".
// Saved analyses live in IndexedDB, so the quota is the browser's own figure
// (navigator.storage.estimate(), passed in by the container). When the browser
// cannot tell, `quotaBytes` is null and only the usage is shown, with no bar.
import { computed } from 'vue'

const props = defineProps<{ usedBytes: number; quotaBytes: number | null }>()

const MB = 1024 * 1024
const GB = 1024 * MB

const ratio = computed(() => (props.quotaBytes && props.quotaBytes > 0 ? props.usedBytes / props.quotaBytes : 0))
const status = computed<'ok' | 'warning' | 'critical'>(() => {
  if (ratio.value >= 0.95) return 'critical'
  if (ratio.value > 0.8) return 'warning'
  return 'ok'
})
const formatSize = (bytes: number) => (bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${(bytes / MB).toFixed(1)} MB`)
const label = computed(() =>
  props.quotaBytes && props.quotaBytes > 0
    ? `Local storage used: ${formatSize(props.usedBytes)} of ${formatSize(props.quotaBytes)} available`
    : `Local storage used: ${formatSize(props.usedBytes)} (browser quota unknown)`,
)
</script>

<template>
  <div class="storage-meter" :class="`storage-meter--${status}`" data-test="storage-meter">
    <p class="storage-meter__label u-tabular">{{ label }}</p>
    <div
      v-if="quotaBytes"
      class="storage-meter__track"
      role="progressbar"
      :aria-valuenow="Math.round(ratio * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="label"
    >
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
