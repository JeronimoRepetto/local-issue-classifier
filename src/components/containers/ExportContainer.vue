<script setup lang="ts">
// Export dialog (Task 13; see docs/export-format.md). Wires useExport() to a UiDialog:
// scope, the four include toggles, the Order segmented control (FB export:
// "Same as table" (default) vs "Custom" — the shared SortRuleList order
// editor and "Use current table sort" only show in Custom), a live preview
// and Download.
import UiDialog from '../../ui/UiDialog.vue'
import UiButton from '../../ui/UiButton.vue'
import UiSegmented from '../../ui/UiSegmented.vue'
import IconDownload from '../../assets/icons/IconDownload.vue'
import SortRuleList from '../ui/SortRuleList.vue'
import ExportPreview from '../ui/ExportPreview.vue'
import { useExport } from '../../composables/useExport'
import type { ExportOptions } from '../../domain/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const exportApi = useExport()

const SCOPE_OPTIONS = [
  { value: 'filtered', label: 'filtered view' },
  { value: 'all', label: 'all issues' },
]

const ORDER_MODE_OPTIONS = [
  { value: 'table', label: 'Same as table (default)' },
  { value: 'custom', label: 'Custom' },
]

const FORMAT_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
]

function onCheckbox(field: keyof ExportOptions, event: Event): void {
  exportApi.setOptions({ [field]: (event.target as HTMLInputElement).checked })
}
</script>

<template>
  <UiDialog
    :open="open"
    title="Export issues"
    description="Builds a plain-text report from this analysis. See docs/export-format.md."
    @close="emit('close')"
  >
    <div class="export-container__body">
      <div class="export-container__row">
        <span class="export-container__key u-micro">Scope</span>
        <div class="export-container__value">
          <UiSegmented
            data-test="export-scope"
            label="Export scope"
            size="compact"
            :model-value="exportApi.options.value.scope"
            :options="SCOPE_OPTIONS"
            @update:model-value="exportApi.setOptions({ scope: $event as ExportOptions['scope'] })"
          />
          <span class="export-container__count u-mono">{{ exportApi.scopeCount.value }} issues</span>
        </div>
      </div>

      <div class="export-container__row">
        <span class="export-container__key u-micro">Include</span>
        <div class="export-container__toggles">
          <label class="export-container__checkbox">
            <input
              type="checkbox"
              data-test="export-include-dismissed"
              :checked="exportApi.options.value.includeDismissed"
              @change="onCheckbox('includeDismissed', $event)"
            />
            Dismissed
          </label>
          <label class="export-container__checkbox">
            <input
              type="checkbox"
              data-test="export-include-unclassified"
              :checked="exportApi.options.value.includeUnclassified"
              @change="onCheckbox('includeUnclassified', $event)"
            />
            Unclassified issues
          </label>
          <label class="export-container__checkbox">
            <input
              type="checkbox"
              data-test="export-include-confidence"
              :checked="exportApi.options.value.includeConfidence"
              @change="onCheckbox('includeConfidence', $event)"
            />
            Confidence
          </label>
          <label class="export-container__checkbox">
            <input
              type="checkbox"
              data-test="export-include-urls"
              :checked="exportApi.options.value.includeUrls"
              @change="onCheckbox('includeUrls', $event)"
            />
            URLs
          </label>
        </div>
      </div>

      <div class="export-container__row">
        <span class="export-container__key u-micro">Format</span>
        <UiSegmented
          data-test="export-format"
          label="Export format"
          size="compact"
          :model-value="exportApi.options.value.format"
          :options="FORMAT_OPTIONS"
          @update:model-value="exportApi.setOptions({ format: $event as ExportOptions['format'] })"
        />
      </div>

      <div class="export-container__row">
        <span class="export-container__key u-micro">Order</span>
        <div class="export-container__order">
          <UiSegmented
            data-test="export-order-mode"
            label="Export order"
            size="compact"
            :model-value="exportApi.options.value.orderMode"
            :options="ORDER_MODE_OPTIONS"
            @update:model-value="exportApi.setOptions({ orderMode: $event as ExportOptions['orderMode'] })"
          />
          <template v-if="exportApi.options.value.orderMode === 'custom'">
            <SortRuleList :rules="exportApi.options.value.order" @update="exportApi.setOrder" />
            <UiButton data-test="export-use-table-sort" variant="ghost" size="compact" @click="exportApi.useCurrentTableSort">
              Use current table sort
            </UiButton>
          </template>
        </div>
      </div>

      <div class="export-container__row export-container__row--stacked">
        <span class="export-container__key u-micro">Preview</span>
        <div>
          <ExportPreview :text="exportApi.previewText.value" :format="exportApi.options.value.format" />
          <p v-if="exportApi.scopeCount.value === 0" class="export-container__empty" data-test="export-empty">
            Nothing to export.
          </p>
        </div>
      </div>
    </div>

    <template #actions>
      <UiButton variant="ghost" @click="emit('close')">Cancel</UiButton>
      <UiButton
        data-test="export-download"
        variant="primary"
        :disabled="exportApi.scopeCount.value === 0"
        @click="exportApi.download"
      >
        <template #icon><IconDownload /></template>
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

/* Key/value rows: a micro key column and the controls. */
.export-container__row {
  display: grid;
  grid-template-columns: calc(var(--space-7) + var(--space-3)) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-2) var(--space-3);
}

.export-container__row--stacked {
  grid-template-columns: minmax(0, 1fr);
}

.export-container__key {
  padding-top: var(--space-1);
}

.export-container__value {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2h);
}

.export-container__count {
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
}

.export-container__toggles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2) var(--space-3);
}

.export-container__checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  cursor: pointer;
}

.export-container__order {
  display: grid;
  justify-items: start;
  gap: var(--space-2);
}

.export-container__order :deep(.sort-rule-list) {
  width: 100%;
}

.export-container__empty {
  margin: var(--space-2) 0 0;
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
}
</style>
