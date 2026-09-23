<script setup lang="ts">
// Export dialog (Task 13, SPEC.md §2.6). Wires useExport() to a UiDialog:
// scope, the four include toggles, the shared SortRuleList order editor,
// "Use current table sort", a live preview and Download.
import UiDialog from '../../ui/UiDialog.vue'
import UiButton from '../../ui/UiButton.vue'
import UiSelect from '../../ui/UiSelect.vue'
import SortRuleList from '../ui/SortRuleList.vue'
import ExportPreview from '../ui/ExportPreview.vue'
import { useExport } from '../../composables/useExport'
import type { ExportOptions } from '../../domain/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const exportApi = useExport()

const SCOPE_OPTIONS = [
  { value: 'filtered', label: 'Current filtered view' },
  { value: 'all', label: 'All issues' },
]

function onCheckbox(field: keyof ExportOptions, event: Event): void {
  exportApi.setOptions({ [field]: (event.target as HTMLInputElement).checked })
}
</script>

<template>
  <UiDialog
    :open="open"
    title="Export issues"
    description="Builds a plain-text report from this analysis (SPEC.md §2.6)."
    @close="emit('close')"
  >
    <div class="export-container__body">
      <UiSelect
        data-test="export-scope"
        label="Scope"
        :model-value="exportApi.options.value.scope"
        :options="SCOPE_OPTIONS"
        @update:model-value="exportApi.setOptions({ scope: $event as ExportOptions['scope'] })"
      />

      <div class="export-container__toggles">
        <label class="export-container__checkbox">
          <input
            type="checkbox"
            data-test="export-include-dismissed"
            :checked="exportApi.options.value.includeDismissed"
            @change="onCheckbox('includeDismissed', $event)"
          />
          Include dismissed
        </label>
        <label class="export-container__checkbox">
          <input
            type="checkbox"
            data-test="export-include-unclassified"
            :checked="exportApi.options.value.includeUnclassified"
            @change="onCheckbox('includeUnclassified', $event)"
          />
          Include unclassified issues
        </label>
        <label class="export-container__checkbox">
          <input
            type="checkbox"
            data-test="export-include-confidence"
            :checked="exportApi.options.value.includeConfidence"
            @change="onCheckbox('includeConfidence', $event)"
          />
          Include confidence
        </label>
        <label class="export-container__checkbox">
          <input
            type="checkbox"
            data-test="export-include-urls"
            :checked="exportApi.options.value.includeUrls"
            @change="onCheckbox('includeUrls', $event)"
          />
          Include URLs
        </label>
      </div>

      <div class="export-container__order">
        <div class="export-container__order-header">
          <h3>Order</h3>
          <UiButton data-test="export-use-table-sort" variant="ghost" @click="exportApi.useCurrentTableSort">
            Use current table sort
          </UiButton>
        </div>
        <SortRuleList :rules="exportApi.options.value.order" @update="exportApi.setOrder" />
      </div>

      <ExportPreview :text="exportApi.previewText.value" />
      <p v-if="exportApi.scopeCount.value === 0" class="export-container__empty" data-test="export-empty">
        Nothing to export.
      </p>
    </div>

    <template #actions>
      <UiButton variant="ghost" @click="emit('close')">Cancel</UiButton>
      <UiButton
        data-test="export-download"
        variant="primary"
        :disabled="exportApi.scopeCount.value === 0"
        @click="exportApi.download"
      >
        Download
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.export-container__body {
  display: grid;
  gap: var(--space-3);
}

.export-container__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.export-container__checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-table-size);
}

.export-container__order {
  display: grid;
  gap: var(--space-2);
}

.export-container__order-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.export-container__order-header h3 {
  margin: 0;
  font-size: var(--text-body-size);
  font-weight: var(--weight-semibold);
}

.export-container__empty {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
