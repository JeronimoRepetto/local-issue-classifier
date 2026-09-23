<script setup lang="ts">
// Weights popover content (SPEC §2.5 item 3, §4.9): four sliders (step 5)
// with a paired numeric input each — every slider is keyboard-operable, and
// its numeric input is always keyboard-focusable regardless of pointer
// support. A live preview is emitted 150 ms after the last change so a drag
// does not recompute and re-sort on every intermediate tick. Reset restores
// the defaults, and an all-zero warning shows immediately (never debounced),
// since it describes the current draft, not the emitted preview.
// Presentational: props/emits only, no composables.
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import UiSlider from '../../ui/UiSlider.vue'
import UiButton from '../../ui/UiButton.vue'
import { clampWeights } from '../../domain/priority'
import { defaultPriorityWeights } from '../../domain/types'
import type { PriorityWeights } from '../../domain/types'

const LIVE_PREVIEW_DELAY_MS = 150

const props = defineProps<{ weights: PriorityWeights }>()
const emit = defineEmits<{ update: [weights: PriorityWeights] }>()

/** Local draft, seeded and clamped from `weights` (SPEC.md §4.9 "applied on load"). */
const draft = reactive<PriorityWeights>(clampWeights(props.weights))

watch(
  () => props.weights,
  (next) => {
    const clamped = clampWeights(next)
    draft.criticality = clamped.criticality
    draft.relevance = clamped.relevance
    draft.complexity = clamped.complexity
    draft.effort = clamped.effort
  },
)

const isAllZero = computed(
  () => draft.criticality === 0 && draft.relevance === 0 && draft.complexity === 0 && draft.effort === 0,
)

let timer: ReturnType<typeof setTimeout> | undefined

function scheduleEmit(): void {
  clearTimeout(timer)
  timer = setTimeout(() => {
    emit('update', clampWeights({ ...draft }))
  }, LIVE_PREVIEW_DELAY_MS)
}

function setWeight(key: keyof PriorityWeights, value: number): void {
  draft[key] = value
  scheduleEmit()
}

function reset(): void {
  const defaults = defaultPriorityWeights()
  draft.criticality = defaults.criticality
  draft.relevance = defaults.relevance
  draft.complexity = defaults.complexity
  draft.effort = defaults.effort
  scheduleEmit()
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="weight-editor">
    <UiSlider
      data-test="weight-criticality"
      label="Criticality"
      :model-value="draft.criticality"
      @update:model-value="setWeight('criticality', $event)"
    />
    <UiSlider
      data-test="weight-relevance"
      label="Relevance"
      :model-value="draft.relevance"
      @update:model-value="setWeight('relevance', $event)"
    />
    <UiSlider
      data-test="weight-complexity"
      label="Complexity"
      :model-value="draft.complexity"
      @update:model-value="setWeight('complexity', $event)"
    />
    <UiSlider
      data-test="weight-effort"
      label="Effort"
      :model-value="draft.effort"
      @update:model-value="setWeight('effort', $event)"
    />

    <p class="weight-editor__caption">
      Lower complexity and lower effort raise priority. Priority is a ranking aid, not a measurement.
    </p>
    <p v-if="isAllZero" class="weight-editor__warning" data-test="weight-all-zero-warning" role="status">
      Set at least one weight above 0
    </p>

    <UiButton data-test="weight-reset" variant="ghost" @click="reset">Reset to defaults</UiButton>
  </div>
</template>

<style scoped>
.weight-editor {
  display: grid;
  gap: var(--space-3);
  min-width: calc(var(--space-7) * 4);
}

.weight-editor__caption {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.weight-editor__warning {
  margin: 0;
  color: var(--color-warning);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  font-weight: var(--weight-semibold);
}
</style>
