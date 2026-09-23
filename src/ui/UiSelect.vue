<script setup lang="ts">
// Single select. A native <select> keeps keyboard type-ahead, platform
// accessibility and mobile pickers for free; only the chrome is styled.
import { computed, useId } from 'vue'
import IconChevronDown from '../assets/icons/IconChevronDown.vue'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

const props = defineProps<{
  modelValue: string
  label: string
  options: SelectOption[]
  hint?: string
  disabled?: boolean
  id?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const autoId = useId()
const selectId = computed(() => props.id ?? `select-${autoId}`)
</script>

<template>
  <div class="ui-field">
    <label class="ui-field__label" :for="selectId">{{ label }}</label>
    <div class="ui-control ui-select">
      <select
        :id="selectId"
        class="ui-control__input ui-select__native"
        :value="modelValue"
        :disabled="disabled"
        :aria-describedby="hint ? `${selectId}-hint` : undefined"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">
          {{ o.label }}
        </option>
      </select>
      <IconChevronDown class="ui-select__chevron" />
    </div>
    <p v-if="hint" :id="`${selectId}-hint`" class="ui-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
p {
  margin: 0;
}

.ui-select {
  position: relative;
  padding-right: var(--space-2);
}

.ui-select__native {
  appearance: none;
  padding-right: var(--space-5);
  cursor: pointer;
}

.ui-select__native option {
  background: var(--color-surface);
  color: var(--color-text);
}

.ui-select__chevron {
  position: absolute;
  right: var(--space-2);
  color: var(--color-text-muted);
  pointer-events: none;
}
</style>
