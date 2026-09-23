<script setup lang="ts">
import { useAttrs } from 'vue'
import UiSpinner from './UiSpinner.vue'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ControlSize = 'compact' | 'default' | 'large'

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ControlSize
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    /** Shows an inline pixel spinner; the label stays (hidden) to keep the width. */
    loading?: boolean
    /** Square button with only the `icon` slot; requires an `aria-label`. */
    iconOnly?: boolean
  }>(),
  { variant: 'secondary', size: 'default', type: 'button' },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()
const attrs = useAttrs()

if (import.meta.env.DEV && props.iconOnly && !attrs['aria-label'] && !attrs['aria-labelledby']) {
  console.warn('[UiButton] icon-only buttons need an aria-label.')
}

function onClick(event: MouseEvent) {
  if (props.disabled || props.loading) return
  emit('click', event)
}
</script>

<template>
  <button
    :type="type"
    class="ui-button"
    :class="[
      `ui-button--${variant}`,
      `ui-button--size-${size}`,
      { 'ui-button--icon-only': iconOnly, 'ui-button--loading': loading },
    ]"
    :disabled="disabled"
    :aria-busy="loading ? 'true' : undefined"
    :aria-disabled="loading ? 'true' : undefined"
    @click="onClick"
  >
    <span class="ui-button__content">
      <slot name="icon" />
      <slot />
    </span>
    <UiSpinner v-if="loading" class="ui-button__spinner" />
  </button>
</template>

<style scoped>
.ui-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--size-default);
  padding: 0 var(--space-3);
  border: var(--line-thin) solid transparent;
  border-radius: var(--radius-md);
  font: inherit;
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}

.ui-button__content {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.ui-button--size-compact {
  height: var(--size-compact);
  padding: 0 var(--space-2);
}

.ui-button--size-large {
  height: var(--size-large);
  padding: 0 var(--space-4);
  font-size: var(--text-body-size);
}

.ui-button--icon-only {
  width: var(--size-default);
  padding: 0;
}

.ui-button--icon-only.ui-button--size-compact {
  width: var(--size-compact);
}

.ui-button--icon-only.ui-button--size-large {
  width: var(--size-large);
}

.ui-button--primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.ui-button--primary:hover:not(:disabled),
.ui-button--primary:active:not(:disabled) {
  background: var(--color-accent-hover);
}

.ui-button--secondary {
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.ui-button--secondary:hover:not(:disabled) {
  background: var(--color-surface-2);
}

.ui-button--ghost {
  background: transparent;
  color: var(--color-text);
}

.ui-button--ghost:hover:not(:disabled) {
  background: var(--color-surface-2);
}

.ui-button--secondary:active:not(:disabled),
.ui-button--ghost:active:not(:disabled) {
  background: var(--color-accent-soft);
}

.ui-button--danger {
  background: var(--color-danger);
  color: var(--color-on-danger);
}

.ui-button--danger:hover:not(:disabled),
.ui-button--danger:active:not(:disabled) {
  background: var(--color-danger-hover);
}

.ui-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-button--loading {
  cursor: progress;
}

.ui-button--loading .ui-button__content {
  visibility: hidden;
}

.ui-button__spinner {
  position: absolute;
  inset: 0;
  width: fit-content;
  height: fit-content;
  margin: auto;
}
</style>
