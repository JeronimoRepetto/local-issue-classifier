<script setup lang="ts">
// Score pill (SPEC §10.4, design v2): a 0–100 mono number colored with the
// `scale-1..5` heat ramp, a quiet "/100", and an optional 3 px bar. The
// number is always shown, so color is never the only signal.
import { computed } from 'vue'
import { scaleStep } from './levels'

const props = withDefaults(defineProps<{ value: number | null; label: string; bar?: boolean }>(), {
  bar: true,
})

const clamped = computed(() =>
  props.value === null ? null : Math.round(Math.min(100, Math.max(0, props.value))),
)
const step = computed(() => (clamped.value === null ? null : scaleStep(clamped.value)))
const ariaLabel = computed(() =>
  clamped.value === null ? `${props.label} not available` : `${props.label} ${clamped.value} of 100`,
)
</script>

<template>
  <span class="score-bar" role="img" :aria-label="ariaLabel">
    <span class="score-bar__number">
      <span
        class="score-bar__value u-tabular"
        :class="step ? `score-bar__value--scale-${step}` : 'score-bar__value--empty'"
        data-test="value"
        >{{ clamped ?? '—' }}</span
      ><span v-if="clamped !== null" class="score-bar__max" data-test="max" aria-hidden="true">/100</span>
    </span>
    <span v-if="bar" class="score-bar__track">
      <span
        v-if="clamped !== null"
        class="score-bar__fill"
        :class="`score-bar__fill--scale-${step}`"
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
  font-family: var(--font-mono);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}

.score-bar__number {
  display: inline-flex;
  align-items: baseline;
  min-width: 6ch;
}

.score-bar__value {
  min-width: 3ch;
  text-align: right;
  font-weight: var(--weight-medium);
}

.score-bar__value--empty {
  color: var(--color-text-subtle);
}

.score-bar__max {
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
}

.score-bar__track {
  width: var(--space-6);
  height: calc(var(--line-thick) + var(--line-thin));
  background: var(--color-surface-2);
  border-radius: var(--radius-round);
  overflow: hidden;
}

.score-bar__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  /* Not animated: scores change with weights and must never "count up" (§10.6). */
}

.score-bar__value--scale-1 {
  color: var(--color-scale-1);
}
.score-bar__value--scale-2 {
  color: var(--color-scale-2);
}
.score-bar__value--scale-3 {
  color: var(--color-scale-3);
}
.score-bar__value--scale-4 {
  color: var(--color-scale-4);
}
.score-bar__value--scale-5 {
  color: var(--color-scale-5);
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
