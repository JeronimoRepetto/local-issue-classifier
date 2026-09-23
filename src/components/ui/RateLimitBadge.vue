<script setup lang="ts">
// The top-bar GitHub quota badge (SPEC §2.3 / §10.4): ok / warning (>80% used) / critical (exhausted).
import { computed } from 'vue'

const props = defineProps<{ remaining: number | null; limit: number | null }>()

const status = computed<'unknown' | 'ok' | 'warning' | 'critical'>(() => {
  if (props.remaining === null || props.limit === null || props.limit <= 0) return 'unknown'
  if (props.remaining <= 0) return 'critical'
  const usedRatio = 1 - props.remaining / props.limit
  return usedRatio > 0.8 ? 'warning' : 'ok'
})

const label = computed(() =>
  props.remaining === null ? 'GitHub quota: unknown' : `GitHub quota: ${props.remaining.toLocaleString()} left`,
)
</script>

<template>
  <span class="rate-limit-badge u-tabular" :class="`rate-limit-badge--${status}`" data-test="rate-limit-badge">
    {{ label }}
  </span>
</template>

<style scoped>
.rate-limit-badge {
  display: inline-flex;
  align-items: center;
  height: var(--size-compact);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
  background: var(--color-surface-2);
}

.rate-limit-badge--warning {
  color: var(--color-warning);
}

.rate-limit-badge--critical {
  color: var(--color-danger);
}
</style>
