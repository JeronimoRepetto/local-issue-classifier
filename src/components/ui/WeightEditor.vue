<script setup lang="ts">
// Weights popover content: four sliders (step 5)
// with a paired numeric input each — every slider is keyboard-operable, and
// its numeric input is always keyboard-focusable regardless of pointer
// support. A live preview is emitted 150 ms after the last change so a drag
// does not recompute and re-sort on every intermediate tick. Reset restores
// the defaults, and an all-zero warning shows immediately (never debounced),
// since it describes the current draft, not the emitted preview.
//
// Each row is wrapped in `.weight-editor__row`, which pins the range input's
// `min-width` to 0 (`:deep`, since UiSlider itself is out of this file's
// scope): a flex/grid item's automatic minimum size defaults to its content
// size, and an `<input type="range">` refuses to shrink below that unless
// told otherwise — the row (and its numeric input) then overflows the
// popover instead of fitting beside it. Presentational: props/emits only,
// no composables.
import { computed, onBeforeUnmount, reactive, useId, watch } from 'vue'
import UiSlider from '../../ui/UiSlider.vue'
import UiButton from '../../ui/UiButton.vue'
import { clampWeights, priorityOf } from '../../domain/priority'
import { defaultPriorityWeights } from '../../domain/types'
import type { Classification, PriorityWeights } from '../../domain/types'

const LIVE_PREVIEW_DELAY_MS = 150
const DEFAULTS = defaultPriorityWeights()

/** A row usable as the live example: an issue number plus its classification. */
export interface WeightExampleRow {
  number: number
  classification: Classification
}

/**
 * The docs/jev-questions.md §Priority worked example (criticality 1.8,
 * relevance 3.5, complexity 0.9, effort 0.4 → 83/100 with the default
 * weights; see `domain/priority.test.ts`), used as the live example's
 * fallback when no real row is available yet.
 */
const WORKED_EXAMPLE_CLASSIFICATION: Classification = {
  criticality: { level: 'high', score: 1.8, probabilities: [0, 0.1, 0.9] },
  relevance: { value: 88, score: 3.5, probabilities: [0, 0, 0, 0.8, 0.2] },
  complexity: { level: 'medium', score: 0.9, probabilities: [0.2, 0.7, 0.1] },
  effort: { level: 'low', score: 0.4, probabilities: [0.8, 0.2, 0] },
  kind: { choice: 'bug' },
  model: 'jev-1.13.0',
  questionsVersion: 1,
  issueUpdatedAt: '2026-01-01T00:00:00Z',
  classifiedAt: '2026-01-01T00:00:00Z',
  inputTokens: 0,
}

const props = defineProps<{ weights: PriorityWeights; exampleRow?: WeightExampleRow | null }>()
const emit = defineEmits<{ update: [weights: PriorityWeights] }>()

const titleId = `weight-editor-title-${useId()}`

/** Local draft, seeded and clamped from `weights` ("applied on load"). */
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

const total = computed(() => draft.criticality + draft.relevance + draft.complexity + draft.effort)

/** Rounded percentage share of `value` within the current draft's total (0 when the total is 0). */
function shareOf(value: number): number {
  return total.value > 0 ? Math.round((value / total.value) * 100) : 0
}

const criticalityLabel = computed(() => `Criticality · ${draft.criticality} (${shareOf(draft.criticality)}%)`)
const relevanceLabel = computed(() => `Relevance · ${draft.relevance} (${shareOf(draft.relevance)}%)`)
const complexityLabel = computed(() => `Complexity · ${draft.complexity} (${shareOf(draft.complexity)}%)`)
const effortLabel = computed(() => `Effort · ${draft.effort} (${shareOf(draft.effort)}%)`)

const resetLabel = `Reset to defaults (${DEFAULTS.criticality}/${DEFAULTS.relevance}/${DEFAULTS.complexity}/${DEFAULTS.effort})`

/**
 * The live example line: the row's own priority recomputed against the
 * current draft (not the debounced preview, so it tracks every drag tick),
 * using `exampleRow` when the caller has a real one, else the worked example.
 */
const exampleClassification = computed(() => props.exampleRow?.classification ?? WORKED_EXAMPLE_CLASSIFICATION)
const examplePriority = computed(() => priorityOf(exampleClassification.value, draft))
const exampleScoreText = computed(() => (examplePriority.value === null ? '—' : `${examplePriority.value}/100`))
const exampleLabel = computed(() =>
  props.exampleRow ? `#${props.exampleRow.number} → ${exampleScoreText.value}` : `Example → ${exampleScoreText.value}`,
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
  <div class="weight-editor" role="group" :aria-labelledby="titleId">
    <h2 :id="titleId" class="weight-editor__title" data-test="weight-editor-title">Priority weights</h2>
    <p class="weight-editor__subtitle" data-test="weight-editor-subtitle">
      How much each Jev dimension counts in the 0–100 Priority score. Complexity and effort are inverted: simpler,
      cheaper issues rank higher.
    </p>

    <div class="weight-editor__row">
      <UiSlider
        data-test="weight-criticality"
        :label="criticalityLabel"
        :model-value="draft.criticality"
        @update:model-value="setWeight('criticality', $event)"
      />
    </div>
    <div class="weight-editor__row">
      <UiSlider
        data-test="weight-relevance"
        :label="relevanceLabel"
        :model-value="draft.relevance"
        @update:model-value="setWeight('relevance', $event)"
      />
    </div>
    <div class="weight-editor__row">
      <UiSlider
        data-test="weight-complexity"
        :label="complexityLabel"
        :model-value="draft.complexity"
        @update:model-value="setWeight('complexity', $event)"
      />
    </div>
    <div class="weight-editor__row">
      <UiSlider
        data-test="weight-effort"
        :label="effortLabel"
        :model-value="draft.effort"
        @update:model-value="setWeight('effort', $event)"
      />
    </div>

    <p class="weight-editor__example" data-test="weight-example">{{ exampleLabel }}</p>

    <p class="weight-editor__caption">
      Lower complexity and lower effort raise priority. Priority is a ranking aid, not a measurement.
    </p>
    <p v-if="isAllZero" class="weight-editor__warning" data-test="weight-all-zero-warning" role="status">
      Set at least one weight above 0
    </p>

    <UiButton data-test="weight-reset" variant="ghost" @click="reset">{{ resetLabel }}</UiButton>
  </div>
</template>

<style scoped>
.weight-editor {
  display: grid;
  gap: var(--space-3);
  min-width: calc(var(--space-7) * 4);
  max-width: 100%;
}

.weight-editor__title {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  font-weight: var(--weight-semibold);
}

.weight-editor__subtitle {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

/*
 * The overflow fix: `.ui-field` (UiSlider's own wrapper) is already
 * `min-width: 0` (base.css), but `.ui-slider__row`'s flex item
 * `.ui-slider__range` is not — its automatic minimum size falls back to its
 * content size, which for a range input is wide enough to push the row (and
 * the numeric input riding along with it) past the popover's right edge.
 * `min-width: 0` lets it shrink to the space actually available.
 */
.weight-editor__row {
  min-width: 0;
}

.weight-editor__row :deep(.ui-slider__range) {
  min-width: 0;
}

.weight-editor__example {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-mono);
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
