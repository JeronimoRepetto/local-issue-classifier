<script setup lang="ts">
// Issues screen header (SPEC §6.1 screen 3, §2.5 items 2 and 4). Presentational
// only: refresh/back are props/emits, never a useRepo import — App-level
// wiring (Task 8/INT) passes handlers in.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import IconRefresh from '../../assets/icons/IconRefresh.vue'
import { dateBucket } from '../../domain/dates'

const props = defineProps<{
  name: string
  repoFullName: string
  fetchedAt: string
  visibleCount: number
  totalCount: number
  dismissedCount: number
  showDismissed: boolean
  refreshing?: boolean
  now?: () => Date
}>()

const emit = defineEmits<{ refresh: []; back: [] }>()

const countText = computed(() => {
  const base = `${props.visibleCount} of ${props.totalCount} issues`
  return props.showDismissed ? `${base} (${props.dismissedCount} dismissed)` : base
})

const fetchedLabel = computed(() => `${dateBucket(props.fetchedAt, props.now ?? (() => new Date()))} ago`)
</script>

<template>
  <header class="analysis-header">
    <div class="analysis-header__nav">
      <UiButton data-test="back" variant="ghost" size="compact" @click="emit('back')">Analyses</UiButton>
    </div>
    <div class="analysis-header__title">
      <h1 class="analysis-header__name">{{ name }}</h1>
      <p class="analysis-header__meta">
        <span>{{ repoFullName }}</span>
        <span aria-hidden="true"> · </span>
        <span>Fetched {{ fetchedLabel }}</span>
      </p>
    </div>
    <p class="analysis-header__count" data-test="issue-count">{{ countText }}</p>
    <UiButton
      data-test="refresh"
      variant="secondary"
      :loading="refreshing"
      :disabled="refreshing"
      @click="emit('refresh')"
    >
      <template #icon><IconRefresh /></template>
      Refresh
    </UiButton>
  </header>
</template>

<style scoped>
.analysis-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
}

.analysis-header__title {
  flex: 1;
  min-width: 0;
}

.analysis-header__name {
  margin: 0;
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
}

.analysis-header__meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.analysis-header__count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-table-size);
  white-space: nowrap;
}
</style>
