<script setup lang="ts">
// Issues screen header (screen 3). Presentational
// only: refresh/back are props/emits, never a useRepo import — App-level
// wiring (Task 8/INT) passes handlers in.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiTooltip from '../../ui/UiTooltip.vue'
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
  /** The model of every classified (done) row, in row order (T-provider-switch). */
  classifiedModels?: string[]
}>()

const emit = defineEmits<{ refresh: []; back: [] }>()

const countText = computed(() => {
  const base = `${props.visibleCount} of ${props.totalCount} issues`
  return props.showDismissed ? `${base} (${props.dismissedCount} dismissed)` : base
})

const fetchedLabel = computed(() => `${dateBucket(props.fetchedAt, props.now ?? (() => new Date()))} ago`)

/**
 * "Classified by" (T-provider-switch): a single model when every classified
 * row agrees, else "mixed (...)" with a tooltip listing each model's count.
 * Nothing shown until at least one row is classified.
 */
const classifiedBy = computed(() => {
  const models = props.classifiedModels ?? []
  if (models.length === 0) return null
  const unique = [...new Set(models)]
  if (unique.length === 1) return { text: `Classified by: ${unique[0]}`, tooltip: null as string | null }
  const counts = new Map<string, number>()
  for (const model of models) counts.set(model, (counts.get(model) ?? 0) + 1)
  return {
    text: `Classified by: mixed (${unique.join(' · ')})`,
    tooltip: [...counts.entries()].map(([model, count]) => `${model}: ${count}`).join('\n'),
  }
})
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
          <template v-if="classifiedBy">
            <span aria-hidden="true">·</span>
            <UiTooltip v-if="classifiedBy.tooltip" :text="classifiedBy.tooltip">
              <template #default="{ describedBy }">
                <span data-test="classified-by" :aria-describedby="describedBy">{{ classifiedBy.text }}</span>
              </template>
            </UiTooltip>
            <span v-else data-test="classified-by">{{ classifiedBy.text }}</span>
          </template>
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
