<script setup lang="ts">
// The Home list (SPEC §2.2): newest-updated first, with the empty state when
// there are no saved analyses yet.
import type { IndexEntry } from '../../adapters/storage/analysisStore'
import EmptyState from '../../ui/EmptyState.vue'
import AnalysisCard from './AnalysisCard.vue'

defineProps<{ entries: IndexEntry[] }>()
const emit = defineEmits<{
  open: [id: string]
  rename: [id: string, name: string]
  refresh: [id: string]
  delete: [id: string]
}>()
</script>

<template>
  <EmptyState
    v-if="entries.length === 0"
    title="No saved analyses yet"
    description="Paste a GitHub repository URL to start."
  />
  <div v-else class="analysis-list" data-test="analysis-list">
    <AnalysisCard
      v-for="entry in entries"
      :key="entry.status === 'ok' ? entry.summary.id : entry.id"
      :entry="entry"
      @open="emit('open', $event)"
      @rename="(id, name) => emit('rename', id, name)"
      @refresh="emit('refresh', $event)"
      @delete="emit('delete', $event)"
    />
  </div>
</template>

<style scoped>
.analysis-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
}
</style>
