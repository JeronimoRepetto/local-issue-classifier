<script setup lang="ts">
// Segmented control (design v2): a pill track of mutually exclusive options,
// exposed as a radio group with a roving tabindex. Arrow keys move and select,
// wrapping at both ends, like native radio buttons.
import { nextTick, ref } from 'vue'

export interface SegmentedOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{ label: string; options: SegmentedOption[]; modelValue: string; size?: 'compact' | 'default' }>(),
  { size: 'default' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const buttons = ref<HTMLButtonElement[]>([])

async function select(index: number, focus = false): Promise<void> {
  const option = props.options[index]
  if (!option) return
  if (option.value !== props.modelValue) emit('update:modelValue', option.value)
  if (focus) {
    await nextTick()
    buttons.value[index]?.focus()
  }
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const count = props.options.length
  const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
  if (event.key in moves) {
    event.preventDefault()
    void select((index + moves[event.key] + count) % count, true)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    void select(event.key === 'Home' ? 0 : count - 1, true)
  }
}
</script>

<template>
  <div class="ui-segmented" :class="`ui-segmented--${size}`" role="radiogroup" :aria-label="label">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      ref="buttons"
      type="button"
      role="radio"
      class="ui-segmented__option"
      :aria-checked="option.value === modelValue ? 'true' : 'false'"
      :tabindex="option.value === modelValue ? 0 : -1"
      :data-test="`segment-${option.value}`"
      @click="select(index)"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.ui-segmented {
  display: inline-flex;
  align-items: center;
  gap: var(--line-thick);
  height: var(--size-default);
  padding: var(--line-thick);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-round);
  background: var(--color-surface-2);
}

.ui-segmented--compact {
  height: var(--size-compact);
}

.ui-segmented__option {
  height: 100%;
  padding: 0 var(--space-2h);
  border: 0;
  border-radius: var(--radius-round);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  cursor: pointer;
  transition:
    color var(--dur-base) var(--ease-out),
    background-color var(--dur-base) var(--ease-out);
}

.ui-segmented__option:hover {
  color: var(--color-text);
}

.ui-segmented__option[aria-checked='true'] {
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: 0 0 0 var(--line-thin) var(--color-border);
}
</style>
