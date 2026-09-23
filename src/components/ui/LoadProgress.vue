<script setup lang="ts">
// The New-analysis / refresh progress line (SPEC §2.3 step 3): "Issues: 300 / ~420 · Comments: 120 / 260".
import { computed } from 'vue'
import UiSpinner from '../../ui/UiSpinner.vue'

export interface LoadProgressLike {
  phase: 'issues' | 'comments'
  loaded?: number
  pagesFetched?: number
  totalPages?: number | null
  done?: number
  total?: number
}

const props = defineProps<{ progress: LoadProgressLike | null }>()

const label = computed(() => {
  const p = props.progress
  if (!p) return 'Preparing…'
  if (p.phase === 'issues') {
    const pages = p.totalPages != null ? ` (page ${p.pagesFetched} of ${p.totalPages})` : ''
    return `Issues: ${p.loaded} loaded${pages}`
  }
  return `Comments: ${p.done} / ${p.total}`
})
</script>

<template>
  <p class="load-progress u-tabular" data-test="load-progress" aria-live="polite">
    <UiSpinner />
    <span>{{ label }}</span>
  </p>
</template>

<style scoped>
.load-progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}
</style>
