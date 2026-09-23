<script setup lang="ts">
import { computed, useId } from 'vue'
import UiButton from './UiButton.vue'
import IconClose from '../assets/icons/IconClose.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    type?: 'text' | 'search' | 'url' | 'email' | 'number'
    placeholder?: string
    hint?: string
    error?: string
    clearable?: boolean
    disabled?: boolean
    id?: string
  }>(),
  { type: 'text' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; clear: [] }>()

const autoId = useId()
const inputId = computed(() => props.id ?? `input-${autoId}`)
const hintId = computed(() => `${inputId.value}-hint`)
const errorId = computed(() => `${inputId.value}-error`)
const describedBy = computed(
  () =>
    [props.hint ? hintId.value : '', props.error ? errorId.value : ''].filter(Boolean).join(' ') ||
    undefined,
)

function clear() {
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<template>
  <div class="ui-field">
    <label class="ui-field__label" :for="inputId">{{ label }}</label>
    <div class="ui-control" :class="{ 'ui-control--invalid': error }">
      <span v-if="$slots.prefix" class="ui-control__prefix"><slot name="prefix" /></span>
      <input
        :id="inputId"
        class="ui-control__input"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <UiButton
        v-if="clearable && modelValue"
        data-test="clear"
        variant="ghost"
        size="compact"
        icon-only
        :aria-label="`Clear ${label}`"
        @click="clear"
      >
        <template #icon><IconClose /></template>
      </UiButton>
    </div>
    <p v-if="hint" :id="hintId" class="ui-field__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="ui-field__error" data-test="error">{{ error }}</p>
  </div>
</template>

<style scoped>
p {
  margin: 0;
}

.ui-control .ui-button--size-compact {
  height: var(--size-compact);
  width: var(--size-compact);
}
</style>
