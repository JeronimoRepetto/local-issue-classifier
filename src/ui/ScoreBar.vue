<script setup lang="ts">
// 0–100 score as text plus a bar in `scale-1..5` (SPEC §10.4). The number is
// always shown next to the bar, so the color is never the only signal.
import { computed } from 'vue'
import { scaleStep } from './levels'

const props = defineProps<{ value: number | null; label: string }>()

const clamped = computed(() =>
  props.value === null ? null : Math.round(Math.min(100, Math.max(0, props.value))),
)
const ariaLabel = computed(() =>
  clamped.value === null ? `${props.label} not available` : `${props.label} ${clamped.value} of 100`,
)
</script>

<template>
  <span class="score-bar" role="img" :aria-label="ariaLabel">
    <span class="score-bar__value u-tabular" data-test="value">{{ clamped ?? '—' }}</span>
    <span class="score-bar__track">
      <span
        v-if="clamped !== null"
        class="score-bar__fill"
        :class="`score-bar__fill--scale-${scaleStep(clamped)}`"
        data-test="fill"
        :style="{ width: `${clamped}%` }"
      />
    </span>
  </span>
</template>

<style scoped>
.score-bar {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: calc(var(--space-7) + var(--space-5));
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}

.score-bar__value {
  min-width: 3ch;
  text-align: right;
}

.score-bar__track {
  flex: 1;
  height: var(--space-2);
  background: var(--color-surface-2);
  border-radius: var(--radius-pixel);
  overflow: hidden;
}

.score-bar__fill {
  display: block;
  height: 100%;
  /* Not animated: scores change with weights and must never "count up" (§10.6). */
}

.score-bar__fill--scale-1 {
  background: var(--color-scale-1);
}
.score-bar__fill--scale-2 {
  background: var(--color-scale-2);
}
.score-bar__fill--scale-3 {
  background: var(--color-scale-3);
}
.score-bar__fill--scale-4 {
  background: var(--color-scale-4);
}
.score-bar__fill--scale-5 {
  background: var(--color-scale-5);
}
</style>
