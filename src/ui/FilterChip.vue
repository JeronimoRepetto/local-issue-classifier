<script setup lang="ts">
// Filter chip (SPEC §10.4): inactive / active (aria-pressed) / removable (×).
// With `summary`, it is the "N filters" chip that opens the filter panel.
import IconClose from '../assets/icons/IconClose.vue'

withDefaults(
  defineProps<{
    label: string
    active?: boolean
    removable?: boolean
    /** Opens a panel instead of toggling: no aria-pressed, aria-haspopup="dialog". */
    summary?: boolean
    /** Plain label (not a toggle), e.g. a selected value inside UiMultiSelect. */
    labelOnly?: boolean
    disabled?: boolean
  }>(),
  { active: false },
)

const emit = defineEmits<{ toggle: []; remove: [] }>()
</script>

<template>
  <span
    class="filter-chip"
    :class="{
      'filter-chip--active': active,
      'filter-chip--removable': removable,
      'filter-chip--summary': summary,
    }"
  >
    <span v-if="labelOnly" class="filter-chip__label">
      <slot name="icon" />
      <span>{{ label }}</span>
    </span>
    <button
      v-else
      type="button"
      class="filter-chip__toggle"
      data-test="chip-toggle"
      :aria-pressed="summary ? undefined : active ? 'true' : 'false'"
      :aria-haspopup="summary ? 'dialog' : undefined"
      :disabled="disabled"
      @click="emit('toggle')"
    >
      <slot name="icon" />
      <span>{{ label }}</span>
    </button>
    <button
      v-if="removable"
      type="button"
      class="filter-chip__remove"
      data-test="chip-remove"
      :aria-label="`Remove filter ${label}`"
      :disabled="disabled"
      @click="emit('remove')"
    >
      <IconClose />
    </button>
  </span>
</template>

<style scoped>
.filter-chip {
  display: inline-flex;
  align-items: stretch;
  height: var(--size-compact);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-round);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  transition:
    background-color var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease-out),
    color var(--dur-base) var(--ease-out);
}

.filter-chip:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.filter-chip button,
.filter-chip__label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2h);
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.filter-chip__label {
  cursor: default;
}

.filter-chip button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.filter-chip--active,
.filter-chip--active:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.filter-chip--removable .filter-chip__toggle,
.filter-chip--removable .filter-chip__label {
  padding-right: var(--space-1);
}

.filter-chip__remove {
  padding: 0 var(--space-2) 0 var(--space-1);
  opacity: 0.7;
}

.filter-chip__remove:hover:not(:disabled) {
  opacity: 1;
}

.filter-chip__remove :deep(svg) {
  width: calc(var(--icon-sm) - var(--space-1));
  height: calc(var(--icon-sm) - var(--space-1));
}

.filter-chip--summary {
  border-style: dashed;
}
</style>
