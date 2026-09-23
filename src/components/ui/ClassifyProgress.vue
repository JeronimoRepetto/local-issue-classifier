<script setup lang="ts">
// Run progress (SPEC §2.4 step 4, §10.4, §10.6, §10.7): a determinate bar with
// done / failed / pending counts and Cancel. Screen readers get a polite live
// region updated at each quarter of the run, not on every result. Numbers are
// shown as they are (never counted up); the bar width transition is dropped
// under reduced motion, which the container passes in.
import { computed, ref, watch } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import type { RunProgress } from '../../domain/classifyRun'

const MILESTONES = 4

const props = defineProps<{
  progress: RunProgress
  reducedMotion: boolean
  cancelling?: boolean
}>()

const emit = defineEmits<{ cancel: [] }>()

const pending = computed(() => Math.max(0, props.progress.total - props.progress.done))
const percent = computed(() =>
  props.progress.total === 0 ? 100 : Math.round((100 * props.progress.done) / props.progress.total),
)

const milestone = (p: RunProgress) =>
  p.total === 0 ? MILESTONES : Math.floor((MILESTONES * p.done) / p.total)

const announcement = ref(`Classifying ${props.progress.total} ${props.progress.total === 1 ? 'issue' : 'issues'}.`)

watch(
  () => props.progress,
  (next, previous) => {
    if (previous && milestone(next) === milestone(previous)) return
    announcement.value = `${next.done} of ${next.total} done, ${next.failed} failed.`
  },
)

const throttled = computed(() => props.progress.rateLimited > 0)
</script>

<template>
  <div class="classify-progress">
    <div class="classify-progress__head">
      <span data-test="progress-counts" class="classify-progress__counts u-tabular">
        {{ progress.done }} done · {{ progress.failed }} failed · {{ pending }} pending
      </span>
      <UiButton
        data-test="classify-cancel"
        variant="secondary"
        size="compact"
        :disabled="cancelling"
        @click="emit('cancel')"
      >
        {{ cancelling ? 'Cancelling…' : 'Cancel' }}
      </UiButton>
    </div>

    <div
      class="classify-progress__track"
      role="progressbar"
      aria-label="Classification progress"
      aria-valuemin="0"
      :aria-valuemax="progress.total"
      :aria-valuenow="progress.done"
      :aria-valuetext="`${progress.done} of ${progress.total} issues`"
    >
      <span
        data-test="progress-fill"
        class="classify-progress__fill"
        :class="{ 'classify-progress__fill--animated': !reducedMotion }"
        :style="{ width: `${percent}%` }"
      />
    </div>

    <p v-if="throttled" class="classify-progress__note">
      Rate limited — {{ progress.concurrency }} parallel {{ progress.concurrency === 1 ? 'request' : 'requests' }}
    </p>

    <p class="u-visually-hidden" aria-live="polite">{{ announcement }}</p>
  </div>
</template>

<style scoped>
.classify-progress {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-2h);
  border-top: var(--line-thin) solid var(--color-border);
}

.classify-progress__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.classify-progress__counts,
.classify-progress__note {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.classify-progress__track {
  height: calc(var(--line-thick) + var(--line-thin));
  background: var(--color-surface-2);
  border-radius: var(--radius-round);
  overflow: hidden;
}

.classify-progress__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
}

/* The one animated property; --dur-base is also 0 under reduced motion (§10.6). */
.classify-progress__fill--animated {
  transition: width var(--dur-base) var(--ease-standard);
}
</style>
