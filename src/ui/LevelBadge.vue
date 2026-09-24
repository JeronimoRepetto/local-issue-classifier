<script setup lang="ts">
// Level chip (design v2): a tinted chip with a mono text
// label and a three-bar meter, so meaning never relies on color alone.
import { computed } from 'vue'
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
    <span class="level-badge__meter" data-test="glyph" :data-bars="bars" aria-hidden="true">
      <span
        v-for="n in 3"
        :key="n"
        class="level-badge__bar"
        :class="{ 'level-badge__bar--on': n <= bars }"
      />
    </span>
    <span class="level-badge__text">{{ levelLabel(level) }}</span>
  </span>
</template>

<style scoped>
.level-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: calc(var(--space-4) - var(--space-1));
  padding: 0 var(--space-2) 0 calc(var(--space-1) + var(--line-thick));
  border: var(--line-thin) solid transparent;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  font-weight: var(--weight-medium);
  text-transform: lowercase;
  white-space: nowrap;
  transition: opacity var(--dur-fade-base) var(--ease-out);
}

/* Three bars of rising height, bottom-aligned, like a signal meter. */
.level-badge__meter {
  display: inline-flex;
  align-items: flex-end;
  gap: var(--line-thin);
  height: calc(var(--space-2) + var(--line-thick));
}

.level-badge__bar {
  width: var(--line-thick);
  height: calc(var(--space-1) + var(--line-thin));
  border-radius: var(--line-thin);
  background: currentColor;
  opacity: 0.3;
}

.level-badge__bar:nth-child(2) {
  height: calc(var(--space-1) + var(--line-thick) + var(--line-thin));
}

.level-badge__bar:nth-child(3) {
  height: calc(var(--space-2) + var(--line-thick));
}

.level-badge__bar--on {
  opacity: 1;
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
  background: transparent;
}
</style>
