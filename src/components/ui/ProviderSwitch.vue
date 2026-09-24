<script setup lang="ts">
// Provider switcher (classification screen, docs/local-providers.md,
// docs/browser-inference.md): pick Jev (cloud), a local server or the
// in-browser model without leaving the analysis view. An accessible radio
// group; an unavailable candidate is disabled with its reason as a tooltip.
// Disabled as a whole while a run is active, so the provider cannot change
// mid-run (ClassifyContainer.vue passes useClassifier().state.phase === 'running').
import { nextTick, ref } from 'vue'
import UiTooltip from '../../ui/UiTooltip.vue'
import type { ProviderCandidate } from '../../composables/useProvider'

const props = defineProps<{
  candidates: ProviderCandidate[]
  /** The currently active candidate's id; null when the active config matches none listed. */
  modelValue: string | null
  /** True while a classify run is active: every option is disabled, available or not. */
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [id: string] }>()

const buttons = ref<(HTMLButtonElement | null)[]>([])

function canSelect(candidate: ProviderCandidate): boolean {
  return candidate.available && !props.disabled
}

function select(candidate: ProviderCandidate): void {
  if (!canSelect(candidate)) return
  if (candidate.id !== props.modelValue) emit('update:modelValue', candidate.id)
}

async function focusIndex(index: number): Promise<void> {
  await nextTick()
  buttons.value[index]?.focus()
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
  if (!(event.key in moves)) return
  event.preventDefault()
  const count = props.candidates.length
  if (count === 0) return
  let next = index
  for (let step = 0; step < count; step++) {
    next = (next + moves[event.key] + count) % count
    if (canSelect(props.candidates[next])) break
  }
  select(props.candidates[next])
  void focusIndex(next)
}
</script>

<template>
  <div
    class="provider-switch"
    role="radiogroup"
    aria-label="Classifier provider"
    :aria-disabled="disabled ? 'true' : undefined"
  >
    <template v-for="(candidate, index) in candidates" :key="candidate.id">
      <UiTooltip v-if="candidate.reason" :text="candidate.reason">
        <template #default="{ describedBy }">
          <button
            ref="buttons"
            type="button"
            role="radio"
            class="provider-switch__option"
            :aria-checked="candidate.id === modelValue ? 'true' : 'false'"
            :aria-describedby="describedBy"
            :tabindex="candidate.id === modelValue ? 0 : -1"
            :disabled="!canSelect(candidate)"
            :data-test="`provider-option-${candidate.id}`"
            @click="select(candidate)"
            @keydown="onKeydown($event, index)"
          >
            {{ candidate.label }}
          </button>
        </template>
      </UiTooltip>
      <button
        v-else
        ref="buttons"
        type="button"
        role="radio"
        class="provider-switch__option"
        :aria-checked="candidate.id === modelValue ? 'true' : 'false'"
        :tabindex="candidate.id === modelValue ? 0 : -1"
        :disabled="!canSelect(candidate)"
        :data-test="`provider-option-${candidate.id}`"
        @click="select(candidate)"
        @keydown="onKeydown($event, index)"
      >
        {{ candidate.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.provider-switch {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--line-thick);
  padding: var(--line-thick);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-round);
  background: var(--color-surface-2);
}

.provider-switch__option {
  height: var(--size-compact);
  padding: 0 var(--space-2h);
  border: 0;
  border-radius: var(--radius-round);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  cursor: pointer;
  transition:
    color var(--dur-base) var(--ease-out),
    background-color var(--dur-base) var(--ease-out);
}

.provider-switch__option:hover:not(:disabled) {
  color: var(--color-text);
}

.provider-switch__option[aria-checked='true'] {
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: 0 0 0 var(--line-thin) var(--color-border);
}

.provider-switch__option:disabled {
  color: var(--color-text-subtle);
  cursor: not-allowed;
}
</style>
