<script setup lang="ts">
// Issues screen header (screen 3). Presentational
// only: refresh/back are props/emits, never a useRepo import — App-level
// wiring (Task 8/INT) passes handlers in.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import IconRefresh from '../../assets/icons/IconRefresh.vue'
import IconArrowLeft from '../../assets/icons/IconArrowLeft.vue'
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
    <nav class="analysis-header__crumbs" aria-label="Breadcrumb">
      <UiButton data-test="back" variant="ghost" size="compact" @click="emit('back')">
        <template #icon><IconArrowLeft /></template>
        Analyses
      </UiButton>
      <span class="analysis-header__crumb-sep" aria-hidden="true">/</span>
      <span class="analysis-header__crumb u-mono">{{ repoFullName }}</span>
    </nav>
    <div class="analysis-header__row">
      <div class="analysis-header__title">
        <h1 class="analysis-header__name">{{ name }}</h1>
        <p class="analysis-header__meta u-mono">
          <span data-test="issue-count">{{ countText }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ repoFullName }}</span>
          <span aria-hidden="true">·</span>
          <span>fetched {{ fetchedLabel }}</span>
        </p>
      </div>
      <div class="analysis-header__actions">
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
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.analysis-header {
  display: grid;
  gap: var(--space-2);
}

.analysis-header__crumbs {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: calc(var(--space-2) * -1);
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
}

.analysis-header__crumb {
  color: var(--color-text-muted);
}

.analysis-header__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
}

.analysis-header__title {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.analysis-header__name {
  margin: 0;
  overflow: hidden;
  font-size: var(--text-h2-size);
  line-height: var(--text-h2-line);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analysis-header__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.analysis-header__meta [data-test='issue-count'] {
  color: var(--color-text-muted);
}

.analysis-header__actions {
  display: flex;
  gap: var(--space-2);
}
</style>
