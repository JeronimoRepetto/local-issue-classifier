<script setup lang="ts">
// Multi-select (SPEC §10.4): selected values as removable chips, a listbox with
// aria-multiselectable, arrow keys, Enter/Space to toggle and type-ahead.
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import FilterChip from './FilterChip.vue'
import IconChevronDown from '../assets/icons/IconChevronDown.vue'
import IconCheck from '../assets/icons/IconCheck.vue'

export interface MultiSelectOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    label: string
    options: MultiSelectOption[]
    placeholder?: string
    disabled?: boolean
  }>(),
  { placeholder: 'Any' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const id = `multiselect-${useId()}`
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const listbox = ref<HTMLElement | null>(null)
const open = ref(false)
const active = ref(0)
let typeahead = ''
let typeaheadTimer: ReturnType<typeof setTimeout> | undefined

const selected = computed(() =>
  props.options.filter((o) => props.modelValue.includes(o.value)),
)
const optionId = (index: number) => `${id}-option-${index}`

function toggleValue(value: string) {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter((v) => v !== value)
    : [...props.modelValue, value]
  emit('update:modelValue', next)
}

async function openList() {
  if (props.disabled || props.options.length === 0) return
  open.value = true
  const firstSelected = props.options.findIndex((o) => props.modelValue.includes(o.value))
  active.value = Math.max(0, firstSelected)
  await nextTick()
  listbox.value?.focus()
}

function closeList(returnFocus = true) {
  open.value = false
  if (returnFocus) trigger.value?.focus()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    openList()
  }
}

function move(to: number) {
  const last = props.options.length - 1
  active.value = Math.min(last, Math.max(0, to))
  listbox.value?.querySelector(`#${CSS.escape(optionId(active.value))}`)?.scrollIntoView?.({
    block: 'nearest',
  })
}

function onTypeahead(char: string) {
  clearTimeout(typeaheadTimer)
  typeahead += char.toLowerCase()
  typeaheadTimer = setTimeout(() => (typeahead = ''), 500)
  const count = props.options.length
  // A single key cycles from the next option; a longer prefix may stay on the current one.
  const offset = typeahead.length === 1 ? 1 : 0
  for (let i = 0; i < count; i++) {
    const index = (active.value + offset + i) % count
    if (props.options[index].label.toLowerCase().startsWith(typeahead)) {
      move(index)
      return
    }
  }
}

function onListKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      move(active.value + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(active.value - 1)
      break
    case 'Home':
      event.preventDefault()
      move(0)
      break
    case 'End':
      event.preventDefault()
      move(props.options.length - 1)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      toggleValue(props.options[active.value].value)
      break
    case 'Escape':
      event.preventDefault()
      closeList()
      break
    case 'Tab':
      closeList(false)
      break
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        onTypeahead(event.key)
      }
  }
}

function onDocumentMousedown(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) closeList(false)
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onDocumentMousedown)
  else document.removeEventListener('mousedown', onDocumentMousedown)
})

onBeforeUnmount(() => {
  clearTimeout(typeaheadTimer)
  document.removeEventListener('mousedown', onDocumentMousedown)
})
</script>

<template>
  <div ref="root" class="ui-field ui-multiselect">
    <span :id="`${id}-label`" class="ui-field__label">{{ label }}</span>
    <div class="ui-control ui-multiselect__control">
      <FilterChip
        v-for="option in selected"
        :key="option.value"
        :label="option.label"
        label-only
        removable
        :disabled="disabled"
        @remove="toggleValue(option.value)"
      />
      <button
        ref="trigger"
        type="button"
        class="ui-multiselect__trigger"
        data-test="multiselect-trigger"
        aria-haspopup="listbox"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="`${id}-listbox`"
        :aria-labelledby="`${id}-label ${id}-summary`"
        :disabled="disabled"
        @click="open ? closeList() : openList()"
        @keydown="onTriggerKeydown"
      >
        <span :id="`${id}-summary`" class="ui-multiselect__summary">
          {{ selected.length ? `${selected.length} selected` : placeholder }}
        </span>
        <IconChevronDown />
      </button>
    </div>
    <ul
      v-if="open"
      :id="`${id}-listbox`"
      ref="listbox"
      class="ui-multiselect__list"
      role="listbox"
      tabindex="-1"
      aria-multiselectable="true"
      :aria-labelledby="`${id}-label`"
      :aria-activedescendant="optionId(active)"
      @keydown="onListKeydown"
    >
      <li
        v-for="(option, index) in options"
        :id="optionId(index)"
        :key="option.value"
        role="option"
        class="ui-multiselect__option"
        :class="{ 'ui-multiselect__option--active': index === active }"
        :aria-selected="modelValue.includes(option.value) ? 'true' : 'false'"
        @mousedown.prevent
        @mousemove="active = index"
        @click="toggleValue(option.value)"
      >
        <span class="ui-multiselect__check" aria-hidden="true">
          <IconCheck v-if="modelValue.includes(option.value)" />
        </span>
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ui-multiselect {
  position: relative;
}

.ui-multiselect__control {
  flex-wrap: wrap;
  height: auto;
  min-height: var(--size-default);
  padding: 0 var(--line-thick);
  gap: var(--space-1);
}

.ui-multiselect__control :deep(.filter-chip) {
  height: calc(var(--size-compact) - var(--space-1));
  margin: var(--line-thick) 0;
}

.ui-multiselect__trigger {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: calc(var(--space-7) + var(--space-5));
  height: calc(var(--size-default) - var(--line-thin) * 2);
  padding: 0 var(--space-1) 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--text-table-size);
  cursor: pointer;
}

.ui-multiselect__list {
  position: absolute;
  top: calc(100% + var(--space-1));
  left: 0;
  z-index: var(--z-popover);
  width: 100%;
  max-height: calc(var(--size-default) * 6);
  margin: 0;
  padding: var(--space-1);
  overflow: auto;
  list-style: none;
  background: var(--color-bg);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-2);
  animation: ui-multiselect-in var(--dur-fade-base) var(--ease-out);
}

.ui-multiselect__option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--size-compact);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-table-size);
  cursor: pointer;
}

.ui-multiselect__option--active {
  background: var(--color-surface-2);
}

.ui-multiselect__option[aria-selected='true'] {
  color: var(--color-accent);
  font-weight: var(--weight-medium);
}

.ui-multiselect__check {
  display: inline-flex;
  width: var(--icon-sm);
  height: var(--icon-sm);
}

@keyframes ui-multiselect-in {
  from {
    opacity: 0;
    transform: translateY(calc(var(--motion-shift) * -1));
  }
}
</style>
