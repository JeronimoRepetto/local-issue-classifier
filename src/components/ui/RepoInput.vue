<script setup lang="ts">
// The Home "New analysis" input: a repo URL/shorthand field,
// the Open/Closed/All state picker, and the screen's one primary action.
import { ref, watch } from 'vue'
import { parseRepoRef } from '../../domain/repoRef'
import type { RepoRefError } from '../../domain/repoRef'
import type { RepoRef } from '../../domain/types'
import UiButton from '../../ui/UiButton.vue'
import UiInput from '../../ui/UiInput.vue'
import UiSelect from '../../ui/UiSelect.vue'
import type { SelectOption } from '../../ui/UiSelect.vue'
import IconRepo from '../../assets/icons/IconRepo.vue'

export type StateFilter = 'open' | 'closed' | 'all'

const props = withDefaults(defineProps<{ initialText?: string; defaultStateFilter?: StateFilter }>(), {
  initialText: '',
  defaultStateFilter: 'open',
})

const emit = defineEmits<{ submit: [ref: RepoRef, stateFilter: StateFilter, raw: string] }>()

const text = ref(props.initialText)
const stateFilter = ref<StateFilter>(props.defaultStateFilter)
const error = ref<string | null>(null)

watch(
  () => props.initialText,
  (next) => {
    if (!text.value) text.value = next
  },
)

const STATE_OPTIONS: SelectOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

function describeError(error: RepoRefError): string {
  switch (error.kind) {
    case 'invalid-host':
      return 'Only github.com repository links are supported.'
    case 'missing-repo':
      return 'Enter a repository, e.g. owner/repo or a GitHub URL.'
    case 'invalid-characters':
      return "That doesn't look like a valid repository reference."
  }
}

function onSubmit(): void {
  const parsed = parseRepoRef(text.value)
  if (!parsed.ok) {
    error.value = describeError(parsed.error)
    return
  }
  error.value = null
  emit('submit', parsed.ref, stateFilter.value, text.value)
}
</script>

<template>
  <form class="repo-input" data-test="repo-input" @submit.prevent="onSubmit">
    <UiInput
      v-model="text"
      label="GitHub repository"
      placeholder="owner/repo or https://github.com/owner/repo"
      :error="error ?? undefined"
      clearable
      @update:model-value="error = null"
    >
      <template #prefix><IconRepo /></template>
    </UiInput>
    <UiSelect v-model="stateFilter" label="Issue state" :options="STATE_OPTIONS" />
    <UiButton type="submit" variant="primary" data-test="repo-input-submit">New analysis</UiButton>
  </form>
</template>

<style scoped>
.repo-input {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2);
}

.repo-input > :first-child {
  flex: 1 1 calc(var(--space-7) * 5);
}
</style>
