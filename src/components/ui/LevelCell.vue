<script setup lang="ts">
// Level cell (SPEC §6.3): a level chip for one dimension (criticality,
// complexity or effort), the raw score, confidence and per-level
// probabilities available on hover/focus via ConfidenceBadge's tooltip.
import { computed } from 'vue'
import LevelBadge from '../../ui/LevelBadge.vue'
import ConfidenceBadge from '../../ui/ConfidenceBadge.vue'
import type { ScoreDimension } from '../../domain/types'

const props = defineProps<{
  /** Accessible dimension name, e.g. "Criticality". */
  dimension: string
  value: ScoreDimension | null
  stale?: boolean
}>()

const probabilities = computed(() =>
  props.value ? { low: props.value.probabilities[0], medium: props.value.probabilities[1], high: props.value.probabilities[2] } : undefined,
)
// `confidence` is optional upstream (a later schema may omit it); render the
// level chip on its own rather than crash ConfidenceBadge on a missing number.
const hasConfidence = computed(() => props.value != null && props.value.confidence != null)
</script>

<template>
  <span class="level-cell">
    <template v-if="value">
      <LevelBadge :level="value.level" :dimension="dimension" :stale="stale" />
      <ConfidenceBadge v-if="hasConfidence" :confidence="value.confidence!" :probabilities="probabilities" />
      <span v-else class="level-cell__empty" aria-hidden="true">—</span>
    </template>
    <span v-else class="level-cell__empty" aria-hidden="true">—</span>
  </span>
</template>

<style scoped>
.level-cell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.level-cell__empty {
  color: var(--color-text-muted);
}
</style>
