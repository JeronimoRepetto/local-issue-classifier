<script setup lang="ts">
// The ordered sort-rule editor (Task 13, SPEC.md §2.5 item 3, §7.1): shared
// by the table's Sort popover (editing `working.tableSort`) and the export
// dialog's order editor (editing `exportOptions.order`) — both just pass
// `rules` and listen for `update`. Presentational: no composables.
import { computed, ref } from 'vue'
import UiSelect from '../../ui/UiSelect.vue'
import UiButton from '../../ui/UiButton.vue'
import IconTrash from '../../assets/icons/IconTrash.vue'
import type { SortDirection, SortKey, SortRule } from '../../domain/types'

const KEY_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'criticality', label: 'Criticality' },
  { value: 'complexity', label: 'Complexity' },
  { value: 'effort', label: 'Effort' },
  { value: 'relevance', label: 'Relevance' },
  { value: 'minConfidence', label: 'Confidence' },
  { value: 'createdAt', label: 'Created' },
  { value: 'updatedAt', label: 'Updated' },
  { value: 'commentCount', label: 'Comments' },
  { value: 'number', label: 'Issue number' },
]

function labelFor(key: SortKey): string {
  return KEY_OPTIONS.find((option) => option.value === key)?.label ?? key
}

const props = defineProps<{ rules: SortRule[] }>()
const emit = defineEmits<{ update: [rules: SortRule[]] }>()

const usedKeys = computed(() => new Set(props.rules.map((rule) => rule.key)))
const availableKeys = computed(() => KEY_OPTIONS.filter((option) => !usedKeys.value.has(option.value)))
const pendingKey = ref<SortKey | ''>('')

function addRule(): void {
  if (!pendingKey.value) return
  emit('update', [...props.rules, { key: pendingKey.value, direction: 'desc' }])
  pendingKey.value = ''
}

function removeRule(index: number): void {
  emit(
    'update',
    props.rules.filter((_, i) => i !== index),
  )
}

function toggleDirection(index: number): void {
  const next = props.rules.map((rule, i) =>
    i === index ? { ...rule, direction: (rule.direction === 'asc' ? 'desc' : 'asc') as SortDirection } : rule,
  )
  emit('update', next)
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= props.rules.length) return
  const next = props.rules.slice()
  const [rule] = next.splice(index, 1)
  next.splice(target, 0, rule)
  emit('update', next)
}

function onItemKeydown(index: number, event: KeyboardEvent): void {
  if (!event.altKey) return
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(index, -1)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(index, 1)
  }
}
</script>

<template>
  <div class="sort-rule-list">
    <ul class="sort-rule-list__items">
      <li
        v-for="(rule, index) in rules"
        :key="rule.key"
        data-test="sort-rule"
        class="sort-rule-list__item"
        tabindex="0"
        @keydown="onItemKeydown(index, $event)"
      >
        <span class="sort-rule-list__index" aria-hidden="true">{{ index + 1 }}</span>
        <span class="sort-rule-list__label">{{ labelFor(rule.key) }}</span>
        <button
          type="button"
          data-test="sort-rule-direction"
          class="sort-rule-list__direction"
          :aria-label="`Toggle direction for ${labelFor(rule.key)}`"
          @click="toggleDirection(index)"
        >
          {{ rule.direction === 'asc' ? '↑ Asc' : '↓ Desc' }}
        </button>
        <button
          type="button"
          data-test="sort-rule-remove"
          class="sort-rule-list__remove"
          :aria-label="`Remove ${labelFor(rule.key)} from the sort order`"
          @click="removeRule(index)"
        >
          <IconTrash aria-hidden="true" />
        </button>
      </li>
    </ul>
    <div v-if="availableKeys.length > 0" class="sort-rule-list__add" data-test="sort-rule-add-select">
      <UiSelect
        label="Add sort key"
        :model-value="pendingKey"
        :options="[{ value: '', label: 'Choose a key…', disabled: true }, ...availableKeys]"
        @update:model-value="pendingKey = $event as SortKey | ''"
      />
      <UiButton data-test="sort-rule-add" variant="secondary" :disabled="!pendingKey" @click="addRule">
        Add
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.sort-rule-list {
  display: grid;
  gap: var(--space-2);
}

.sort-rule-list__items {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sort-rule-list__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.sort-rule-list__item:focus-visible {
  outline: var(--line-thick) solid var(--color-accent);
  outline-offset: calc(var(--line-thick) * -1);
}

.sort-rule-list__index {
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
}

.sort-rule-list__label {
  flex: 1;
  font-size: var(--text-table-size);
}

.sort-rule-list__direction,
.sort-rule-list__remove {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--size-compact);
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-caption-size);
  cursor: pointer;
}

.sort-rule-list__direction:hover,
.sort-rule-list__remove:hover {
  background: var(--color-surface-2);
}

.sort-rule-list__add {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}
</style>
