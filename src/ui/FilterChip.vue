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
  border: var(--line-thin) solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}

.filter-chip button,
.filter-chip__label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.filter-chip button:hover:not(:disabled) {
  background: var(--color-surface-2);
}

.filter-chip button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.filter-chip--active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: var(--weight-medium);
}

.filter-chip--active button:hover:not(:disabled) {
  background: transparent;
}

.filter-chip--removable .filter-chip__toggle,
.filter-chip--removable .filter-chip__label {
  padding-right: var(--space-1);
}

.filter-chip__remove {
  padding: 0 var(--space-1);
}

.filter-chip--summary {
  border-style: dashed;
}
</style>
