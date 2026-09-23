<script setup lang="ts">
// A read-only preview of the export text (Task 13, SPEC.md §2.6). Presentational.
defineProps<{ text: string }>()
</script>

<template>
  <div class="export-preview">
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
</style>
