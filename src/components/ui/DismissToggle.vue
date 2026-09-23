<script setup lang="ts">
// "Show dismissed" toggle (SPEC §2.5 item 4): brings dismissed rows back,
// greyed out, each with Restore.
defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    class="dismiss-toggle"
    :class="{ 'dismiss-toggle--on': modelValue }"
    :aria-checked="modelValue ? 'true' : 'false'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="dismiss-toggle__track" aria-hidden="true"><span class="dismiss-toggle__thumb" /></span>
    Show dismissed
  </button>
</template>

<style scoped>
.dismiss-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--size-compact);
  padding: 0 var(--space-2);
  border: var(--line-thin) solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-table-size);
  cursor: pointer;
}

.dismiss-toggle__track {
  position: relative;
  width: calc(var(--space-4) * 1.6);
  height: var(--space-3);
  border-radius: var(--radius-round);
  background: var(--color-border-strong);
  transition: background-color var(--dur-fast) var(--ease-standard);
}

.dismiss-toggle__thumb {
  position: absolute;
  top: var(--line-thick);
  left: var(--line-thick);
  width: calc(var(--space-3) - var(--line-thick) * 2);
  height: calc(var(--space-3) - var(--line-thick) * 2);
  border-radius: var(--radius-round);
  background: var(--color-surface);
  transition: transform var(--dur-fast) var(--ease-standard);
}

.dismiss-toggle--on .dismiss-toggle__track {
  background: var(--color-accent);
}

.dismiss-toggle--on .dismiss-toggle__thumb {
  transform: translateX(calc(var(--space-4) * 0.6));
}
</style>
