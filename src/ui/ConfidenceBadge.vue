<script setup lang="ts">
// Confidence badge (SPEC §10.4): high ≥ 0.8 (subtle, optionally hidden),
// medium 0.5–0.8, low < 0.5 with the warning color and a pixel "?" glyph.
import { computed } from 'vue'
import IconQuestion from '../assets/icons/IconQuestion.vue'
import UiTooltip from './UiTooltip.vue'
import { confidenceLevel } from './levels'

const props = defineProps<{
  /** 0–1. */
  confidence: number
  /** Per-level probabilities, listed in the tooltip. */
  probabilities?: Record<string, number>
  hideHigh?: boolean
}>()

const level = computed(() => confidenceLevel(props.confidence))
const percent = (value: number) => `${Math.round(value * 100)}%`
const label = computed(() => `Confidence ${props.confidence.toFixed(2)} (${level.value})`)
const tooltip = computed(() =>
  props.probabilities
    ? Object.entries(props.probabilities)
        .map(([name, p]) => `${name} ${percent(p)}`)
        .join('\n')
    : label.value,
)
</script>

<template>
  <UiTooltip v-if="!(hideHigh && level === 'high')" :text="tooltip">
    <template #default="{ describedBy }">
      <span
        class="confidence-badge"
        :class="`confidence-badge--${level}`"
        role="img"
        tabindex="0"
        :aria-label="label"
        :aria-describedby="describedBy"
      >
        <IconQuestion v-if="level === 'low'" data-test="question-glyph" />
        <span class="u-tabular">{{ percent(confidence) }}</span>
      </span>
    </template>
  </UiTooltip>
</template>

<style scoped>
.confidence-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--space-4);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

.confidence-badge--high {
  background: transparent;
}

.confidence-badge--medium {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.confidence-badge--low {
  background: var(--color-surface-2);
  color: var(--color-warning);
  font-weight: var(--weight-semibold);
}
</style>
