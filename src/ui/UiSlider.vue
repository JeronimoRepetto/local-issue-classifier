<script setup lang="ts">
// Range slider with a paired numeric input (SPEC §10.4), step 5 by default.
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    label: string
    min?: number
    max?: number
    step?: number
    /** Text for `aria-valuetext`, e.g. "40 percent of the priority". */
    valueText?: (value: number) => string
    disabled?: boolean
  }>(),
  { min: 0, max: 100, step: 5 },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const id = `slider-${useId()}`
const ariaValueText = computed(() => props.valueText?.(props.modelValue) ?? String(props.modelValue))

/** Clamps to [min, max] and snaps to the nearest step. */
function normalize(raw: number): number {
  if (!Number.isFinite(raw)) return props.modelValue
  const snapped = Math.round((raw - props.min) / props.step) * props.step + props.min
  return Math.min(props.max, Math.max(props.min, snapped))
}

function commit(event: Event) {
  const value = normalize(Number((event.target as HTMLInputElement).value))
  ;(event.target as HTMLInputElement).value = String(value)
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="ui-field ui-slider">
    <label class="ui-field__label" :for="id">{{ label }}</label>
    <div class="ui-slider__row">
      <input
        :id="id"
        class="ui-slider__range"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        :aria-valuetext="ariaValueText"
        @input="commit"
      />
      <input
        class="ui-control ui-slider__number u-tabular"
        type="number"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="`${label} value`"
        @change="commit"
      />
    </div>
  </div>
</template>

<style scoped>
.ui-slider__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ui-slider__range {
  flex: 1;
  height: var(--size-compact);
  margin: 0;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.ui-slider__number {
  width: calc(var(--space-7) + var(--space-3));
  height: var(--size-compact);
  padding: 0 var(--space-2);
  font: inherit;
  font-family: var(--font-mono);
  font-size: var(--text-table-size);
}
</style>
