<script setup lang="ts">
// End-of-run summary: "N classified · F failed ·
// L low-confidence", plus skipped issues after a cancel or an auth abort.
// Retry failed re-runs only the failures.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import type { RunSummary } from '../../domain/classifyRun'

const props = defineProps<{ summary: RunSummary }>()
const emit = defineEmits<{ 'retry-failed': []; dismiss: [] }>()

const TITLES: Record<RunSummary['status'], string> = {
  completed: 'Classification finished',
  cancelled: 'Classification cancelled',
  'auth-failed': 'Classification stopped',
}

const counts = computed(() => {
  const s = props.summary
  const parts = [`${s.classified} classified`, `${s.failed} failed`, `${s.lowConfidence} low-confidence`]
  if (s.skipped > 0) parts.push(`${s.skipped} skipped`)
  return parts.join(' · ')
})
</script>

<template>
  <section class="run-summary" aria-labelledby="run-summary-title">
    <div class="run-summary__text">
      <h3 id="run-summary-title" class="run-summary__title">{{ TITLES[summary.status] }}</h3>
      <p data-test="summary-counts" class="run-summary__counts u-tabular">{{ counts }}</p>
      <p v-if="summary.status === 'auth-failed'" class="run-summary__note">
        The Jev key was rejected and has been cleared from memory. Enter it again in Settings.
      </p>
      <p v-else-if="summary.status === 'cancelled'" class="run-summary__note">
        Completed results were kept. Classify again to continue.
      </p>
    </div>
    <div class="run-summary__actions">
      <UiButton v-if="summary.failed > 0" data-test="summary-retry" variant="secondary" @click="emit('retry-failed')">
        Retry failed ({{ summary.failed }})
      </UiButton>
      <UiButton data-test="summary-dismiss" variant="ghost" @click="emit('dismiss')">Dismiss</UiButton>
    </div>
  </section>
</template>

<style scoped>
.run-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-2h);
  border-top: var(--line-thin) solid var(--color-border);
}

.run-summary__text {
  display: grid;
  gap: var(--line-thick);
}

.run-summary__title,
.run-summary__counts,
.run-summary__note {
  margin: 0;
}

.run-summary__title {
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  font-weight: var(--weight-medium);
}

.run-summary__counts {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.run-summary__note {
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.run-summary__actions {
  display: flex;
  gap: var(--space-2);
}
</style>
