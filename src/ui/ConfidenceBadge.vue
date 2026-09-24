<script setup lang="ts">
// Confidence badge (user decision 2026-09-24): the badge owns its own
// visibility rule now, so callers no longer pass `hideHigh` — it renders only
// when confidence is 0.50 or below (badge means "doubt", nothing more). Color
// is a continuous gradient from the warning token (0.50) to the danger token
// (0.01), mixed via `color-mix` so no raw color ever appears outside tokens.ts.
import { computed } from 'vue'
import IconQuestion from '../assets/icons/IconQuestion.vue'
import UiTooltip from './UiTooltip.vue'

const props = defineProps<{
  /** 0–1. */
  confidence: number
  /** Per-level probabilities, listed in the tooltip. */
  probabilities?: Record<string, number>
}>()

const visible = computed(() => props.confidence <= 0.5)
const percent = (value: number) => `${Math.round(value * 100)}%`

/**
 * 0 at confidence 0.50 (all warning) to 100 at confidence 0.01 (all danger),
 * clamped to that range for any confidence outside it.
 */
const dangerMix = computed(() => {
  const raw = Math.round(((0.5 - props.confidence) / 0.49) * 100)
  return Math.min(100, Math.max(0, raw))
})
// A custom property, not `color` directly: it survives style validation in
// every environment (some don't yet recognize `color-mix()` as a valid
// value when set via the CSSOM), and the mix itself is a static rule below.
const mixStyle = computed(() => ({ '--confidence-mix': `${dangerMix.value}%` }))

const description = computed(() => {
  const breakdown = props.probabilities
    ? ` It is separate from the probabilities: ${Object.entries(props.probabilities)
        .map(([name, p]) => `${name} ${percent(p)}`)
        .join(' · ')}.`
    : ''
  return `Jev's confidence in this answer: ${percent(props.confidence)}.${breakdown} Consider reviewing this issue.`
})
</script>

<template>
  <UiTooltip v-if="visible" :text="description">
    <template #default="{ describedBy }">
      <span
        class="confidence-badge"
        :style="mixStyle"
        role="img"
        tabindex="0"
        :aria-label="description"
        :aria-describedby="describedBy"
      >
        <IconQuestion data-test="question-glyph" />
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
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  font-weight: var(--weight-medium);
  cursor: help;
  color: color-mix(in oklab, var(--color-danger) var(--confidence-mix), var(--color-warning));
}

.confidence-badge :deep(svg) {
  width: calc(var(--icon-sm) - var(--space-1));
  height: calc(var(--icon-sm) - var(--space-1));
}
</style>
