<script setup lang="ts">
// A read-only preview of the export text (Task 13, SPEC.md §2.6). Presentational.
defineProps<{ text: string }>()
</script>

<template>
  <div class="export-preview">
    <h3 class="export-preview__title">Preview</h3>
    <pre v-if="text" data-test="export-preview-text" class="export-preview__text">{{ text }}</pre>
    <p v-else class="export-preview__empty">Nothing to preview yet.</p>
  </div>
</template>

<style scoped>
.export-preview {
  display: grid;
  gap: var(--space-2);
}

.export-preview__title {
  margin: 0;
  font-size: var(--text-body-size);
  font-weight: var(--weight-semibold);
}

.export-preview__text {
  max-height: calc(var(--size-row) * 10);
  margin: 0;
  padding: var(--space-2);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--color-surface-2);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono, monospace);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.export-preview__empty {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
