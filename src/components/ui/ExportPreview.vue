<script setup lang="ts">
// A read-only preview of the export text (Task 13; see docs/export-format.md).
// For 'markdown'/'html' the preview shows the raw source (still monospace, via
// export-preview__text's --font-mono), plus a short note that it is the raw
// source and not a rendered view. Presentational.
import { computed } from 'vue'
import type { ExportFormat } from '../../domain/types'

const props = withDefaults(defineProps<{ text: string; format?: ExportFormat }>(), { format: 'text' })

const noteLabel = computed(() => (props.format === 'markdown' ? 'Markdown' : 'HTML'))
</script>

<template>
  <div class="export-preview">
    <p v-if="text && format !== 'text'" data-test="export-preview-note" class="export-preview__note">
      Showing raw {{ noteLabel }} source — this is exactly what downloads.
    </p>
    <pre v-if="text" data-test="export-preview-text" class="export-preview__text">{{ text }}</pre>
    <p v-else class="export-preview__empty">Nothing to preview yet.</p>
  </div>
</template>

<style scoped>
.export-preview {
  display: grid;
}

.export-preview__text {
  max-height: calc(var(--size-row) * 6);
  margin: 0;
  padding: var(--space-2h);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.export-preview__empty {
  margin: 0;
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
}

.export-preview__note {
  margin: 0 0 var(--space-1);
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
}
</style>
