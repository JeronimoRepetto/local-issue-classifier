<script setup lang="ts">
// UiCallout (FB local-setup UX task): a prominent, tone-colored note for
// critical setup information — prerequisites, GPU-optional caveats, the
// --no-sync reminder, and what plainly will not work. Colors are never
// hardcoded here: the tint is `color-mix(in oklab, var(--color-<tone>)
// <pct>%, var(--color-surface))`, so it follows the live theme tokens
// instead of a second hand-picked hex per theme (see tokens.ts's `*-soft`
// roles, which hold the same OKLab mix, computed once by colorMix.ts, purely
// so tokens.test.ts can check its AA contrast in Node — there is no CSS
// engine there to evaluate a live color-mix() itself).
//
// `role="alert"` (assertive, always interrupts) is reserved for `danger` —
// something that will actively fail (docs/design.md §components). `info`
// and `warning` use the passive `role="note"` so they read along with the
// page instead of interrupting it.
import IconInfo from '../assets/icons/IconInfo.vue'
import IconWarning from '../assets/icons/IconWarning.vue'

export type CalloutTone = 'info' | 'warning' | 'danger'

defineProps<{
  tone: CalloutTone
  title?: string
}>()

// No dedicated "danger" glyph exists in design/icons/stroke/ (see
// docs/design.md "How to add an icon"); the warning triangle already reads
// as "pay attention", so danger reuses it, tone-colored red by its own CSS
// rule below instead of a redrawn icon.
const ICONS = { info: IconInfo, warning: IconWarning, danger: IconWarning } as const
</script>

<template>
  <div class="ui-callout" :class="`ui-callout--${tone}`" :role="tone === 'danger' ? 'alert' : 'note'">
    <component :is="ICONS[tone]" class="ui-callout__icon" />
    <div class="ui-callout__body">
      <p v-if="title" class="ui-callout__title">{{ title }}</p>
      <div class="ui-callout__content"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.ui-callout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2h);
  border: var(--line-thin) solid;
  border-radius: var(--radius-md);
}

.ui-callout__icon {
  flex: none;
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.ui-callout__title {
  margin: 0 0 var(--space-1);
  font-weight: var(--weight-medium);
}

.ui-callout__content {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.ui-callout--info {
  border-color: var(--color-info);
  background: color-mix(in oklab, var(--color-info) 5%, var(--color-surface));
  color: var(--color-info);
}

.ui-callout--warning {
  border-color: var(--color-warning);
  background: color-mix(in oklab, var(--color-warning) 5%, var(--color-surface));
  color: var(--color-warning);
}

.ui-callout--danger {
  border-color: var(--color-danger);
  background: color-mix(in oklab, var(--color-danger) 5%, var(--color-surface));
  color: var(--color-danger);
}
</style>
