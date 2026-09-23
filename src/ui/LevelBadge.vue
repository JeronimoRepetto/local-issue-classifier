<script setup lang="ts">
// Level badge (SPEC §10.2 / §10.4): color, a text label and a pixel signal glyph,
// so meaning never relies on color alone.
import { computed } from 'vue'
import IconSignal1 from '../assets/icons/IconSignal1.vue'
import IconSignal2 from '../assets/icons/IconSignal2.vue'
import IconSignal3 from '../assets/icons/IconSignal3.vue'
import { levelBars, levelLabel } from './levels'
import type { Level } from './levels'

const props = defineProps<{
  level: Level
  /** What the level measures, e.g. "Criticality"; used in the accessible name. */
  dimension: string
  /** Dashed outline: the classification is older than the issue. */
  stale?: boolean
  /** Replaces the default accessible name, e.g. to add the confidence. */
  ariaLabel?: string
}>()

const GLYPHS = { 1: IconSignal1, 2: IconSignal2, 3: IconSignal3 } as const
const bars = computed(() => levelBars(props.level))
const label = computed(
  () => props.ariaLabel ?? `${props.dimension}: ${props.level}${props.stale ? ' (stale)' : ''}`,
)
</script>

<template>
  <span
    class="level-badge"
    :class="[`level-badge--${level}`, { 'level-badge--stale': stale }]"
    role="img"
    :aria-label="label"
  >
    <span class="level-badge__glyph" data-test="glyph" :data-bars="bars">
      <component :is="GLYPHS[bars]" />
    </span>
    <span class="level-badge__text">{{ levelLabel(level) }}</span>
  </span>
</template>

<style scoped>
.level-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--space-4);
  padding: 0 var(--space-2) 0 var(--space-1);
  border: var(--line-thin) solid transparent;
  border-radius: var(--radius-sm);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  transition: opacity var(--dur-fade-base) var(--ease-out);
}

.level-badge__glyph {
  display: inline-flex;
}

.level-badge--high {
  color: var(--color-level-high-fg);
  background: var(--color-level-high-bg);
}

.level-badge--medium {
  color: var(--color-level-medium-fg);
  background: var(--color-level-medium-bg);
}

.level-badge--low {
  color: var(--color-level-low-fg);
  background: var(--color-level-low-bg);
}

.level-badge--stale {
  border-style: dashed;
  border-color: currentColor;
}
</style>
