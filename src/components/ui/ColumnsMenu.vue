<script setup lang="ts">
// "Columns" menu (design v2): shows or hides the issues-table columns. The
// number and title are always shown. Presentational: the container owns the
// persisted choice (useColumns) and handles `toggle` and `reset`.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiPopover from '../../ui/UiPopover.vue'
import IconColumns from '../../assets/icons/IconColumns.vue'
import { COLUMN_LABELS, REQUIRED_COLUMNS, TABLE_COLUMN_IDS } from '../../domain/columns'
import type { TableColumnId } from '../../domain/columns'

const props = defineProps<{ visible: TableColumnId[] }>()
const emit = defineEmits<{ toggle: [id: TableColumnId]; reset: [] }>()

const summary = computed(() => `Columns: ${props.visible.length} of ${TABLE_COLUMN_IDS.length} shown`)
const options = computed(() =>
  TABLE_COLUMN_IDS.map((id) => ({
    id,
    label: COLUMN_LABELS[id],
    checked: props.visible.includes(id),
    required: REQUIRED_COLUMNS.includes(id),
  })),
)
</script>

<template>
  <UiPopover label="Columns" align="end">
    <template #trigger="{ toggle, attrs }">
      <UiButton v-bind="attrs" data-test="columns-trigger" :aria-label="summary" @click="toggle">
        <template #icon><IconColumns /></template>
        Columns
      </UiButton>
    </template>
    <fieldset class="columns-menu">
      <legend class="columns-menu__legend u-micro">Show columns</legend>
      <label v-for="option in options" :key="option.id" class="columns-menu__option">
        <input
          type="checkbox"
          :data-test="`column-toggle-${option.id}`"
          :checked="option.checked"
          :disabled="option.required"
          @change="emit('toggle', option.id)"
        />
        <span>{{ option.label === '#' ? 'Number' : option.label }}</span>
      </label>
    </fieldset>
    <div class="columns-menu__footer">
      <UiButton data-test="columns-reset" variant="ghost" size="compact" @click="emit('reset')">
        Reset to default
      </UiButton>
    </div>
  </UiPopover>
</template>

<style scoped>
.columns-menu {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1) var(--space-3);
  min-width: calc(var(--space-7) * 4);
  margin: 0;
  padding: 0;
  border: 0;
}

.columns-menu__legend {
  grid-column: 1 / -1;
  margin-bottom: var(--space-2);
  padding: 0;
}

.columns-menu__option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--size-compact);
  font-size: var(--text-table-size);
  cursor: pointer;
}

.columns-menu__option:has(input:disabled) {
  color: var(--color-text-subtle);
  cursor: default;
}

.columns-menu__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: var(--line-thin) solid var(--color-border);
}
</style>
