<script setup lang="ts">
// The non-secret preferences form (SPEC §2.1 step 5, §10.1 progressive
// disclosure). Presentational: it owns no state and no persistence — it takes
// the current Preferences as modelValue and emits a partial patch per field,
// so usePreferences() stays the single place that merges and persists.
import UiSelect from '../../ui/UiSelect.vue'
import type { SelectOption } from '../../ui/UiSelect.vue'
import UiSlider from '../../ui/UiSlider.vue'
import UiInput from '../../ui/UiInput.vue'
import UiSegmented from '../../ui/UiSegmented.vue'
import type { SegmentedOption } from '../../ui/UiSegmented.vue'
import type { Preferences } from '../../domain/types'

defineProps<{ modelValue: Preferences }>()
const emit = defineEmits<{ 'update:modelValue': [patch: Partial<Preferences>] }>()

const THEME_OPTIONS: SegmentedOption[] = [
  { value: 'system', label: 'system' },
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
]

const INCLUDE_CLOSED_OPTIONS: SelectOption[] = [
  { value: 'false', label: 'Open only' },
  { value: 'true', label: 'Include closed' },
]

const FETCH_COMMENTS_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto (on with a token)' },
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' },
]

function patch(value: Partial<Preferences>): void {
  emit('update:modelValue', value)
}
</script>

<template>
  <form class="preferences-form" @submit.prevent>
    <div class="preferences-form__field" data-test="theme">
      <span id="pref-theme-label" class="ui-field__label">Theme</span>
      <UiSegmented
        label="Theme"
        :options="THEME_OPTIONS"
        :model-value="modelValue.theme"
        @update:model-value="patch({ theme: $event as Preferences['theme'] })"
      />
      <p class="ui-field__hint">Follows your system unless you pick one.</p>
    </div>

    <h3 class="preferences-form__group u-micro">Loading</h3>
    <div class="preferences-form__grid">
      <UiSelect
        data-test="include-closed"
        label="Include closed issues by default"
        :model-value="String(modelValue.includeClosedByDefault)"
        :options="INCLUDE_CLOSED_OPTIONS"
        @update:model-value="patch({ includeClosedByDefault: $event === 'true' })"
      />

      <UiSelect
        data-test="fetch-comments"
        label="Fetch comments"
        :model-value="modelValue.fetchComments"
        :options="FETCH_COMMENTS_OPTIONS"
        hint="Auto fetches comments only when a GitHub token is present."
        @update:model-value="patch({ fetchComments: $event as Preferences['fetchComments'] })"
      />

      <UiSlider
        data-test="max-comments"
        label="Max comments per issue"
        :model-value="modelValue.maxCommentsPerIssue"
        :min="0"
        :max="50"
        :step="1"
        @update:model-value="patch({ maxCommentsPerIssue: $event })"
      />

      <UiSlider
        data-test="max-issues"
        label="Max issues to load"
        :model-value="modelValue.maxIssuesToLoad"
        :min="100"
        :max="5000"
        :step="100"
        @update:model-value="patch({ maxIssuesToLoad: $event })"
      />
    </div>

    <h3 class="preferences-form__group u-micro">Classification</h3>
    <div class="preferences-form__grid">
      <!--
        TODO(RB): the batching lane's classify-mode control (Preferences.classifyMode and
        trimmingFloor) mounts in this slot; SettingsContainer fills it once that lane merges.
      -->
      <slot name="classify-mode" />

      <UiSlider
        data-test="concurrency"
        label="Classification concurrency"
        :model-value="modelValue.concurrency"
        :min="1"
        :max="8"
        :step="1"
        @update:model-value="patch({ concurrency: $event })"
      />

      <UiSlider
        data-test="low-confidence"
        label="Low-confidence threshold"
        :model-value="modelValue.lowConfidenceThreshold"
        :min="0"
        :max="1"
        :step="0.05"
        @update:model-value="patch({ lowConfidenceThreshold: Math.round($event * 100) / 100 })"
      />
    </div>

    <details class="preferences-form__advanced">
      <summary>Advanced</summary>
      <UiInput
        data-test="jev-model"
        label="Jev model"
        :model-value="modelValue.jevModel"
        hint="Defaults to jev-latest. Change only if TypeSafe AI asks you to pin a version."
        @update:model-value="patch({ jevModel: $event })"
      />
    </details>
  </form>
</template>

<style scoped>
.preferences-form {
  display: grid;
  gap: var(--space-3);
}

.preferences-form__field {
  display: grid;
  justify-items: start;
  gap: var(--space-1);
}

.preferences-form__field p {
  margin: 0;
}

.preferences-form__group {
  margin: var(--space-2) 0 0;
}

.preferences-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-7) * 4), 1fr));
  gap: var(--space-3);
}

.preferences-form__grid :deep(p) {
  margin: 0;
}

.preferences-form__advanced {
  display: grid;
  gap: var(--space-2);
}

.preferences-form__advanced summary {
  width: fit-content;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  cursor: pointer;
}

.preferences-form__advanced summary:hover {
  color: var(--color-text);
}
</style>
