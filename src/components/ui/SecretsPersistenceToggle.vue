<script setup lang="ts">
// FB-2: where the Jev API key, the GitHub token and a local server's key are
// kept. Presentational: the container binds v-model to the preference (see
// useSecretsPersistence()) and handles `forget`.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiSegmented from '../../ui/UiSegmented.vue'
import { SECRETS_PERSISTENCE_LEVELS } from '../../domain/types'
import type { SecretsPersistence } from '../../domain/types'

const props = defineProps<{ modelValue: SecretsPersistence }>()
const emit = defineEmits<{ 'update:modelValue': [value: SecretsPersistence]; forget: [] }>()

const options = [
  { value: 'memory', label: 'Memory only' },
  { value: 'tab', label: 'This tab' },
  { value: 'device', label: 'This device' },
]

const RISK =
  'Keys stored in the browser can be read by anyone with access to this Windows user profile, or by malware running as you. This app runs on localhost only. Use “Forget keys” to wipe them from this browser at any time.'

const notes: Record<SecretsPersistence, string> = {
  memory: 'Keys are kept in memory only: they vanish when you reload or close the tab. Nothing is written to the browser.',
  tab: `Keys survive a reload, and are deleted when closing the tab. ${RISK}`,
  device: `Keys stay on this device, in this browser, until you forget them. ${RISK}`,
}

const note = computed(() => notes[props.modelValue] ?? notes.memory)

function onSelect(value: string): void {
  const level = SECRETS_PERSISTENCE_LEVELS.find((candidate) => candidate === value)
  if (level) emit('update:modelValue', level)
}
</script>

<template>
  <div class="secrets-persistence">
    <UiSegmented label="Remember keys" :options="options" :model-value="modelValue" @update:model-value="onSelect" />
    <p class="secrets-persistence__note" data-test="secrets-note" aria-live="polite">{{ note }}</p>
    <UiButton data-test="forget-keys" variant="secondary" @click="emit('forget')">Forget keys</UiButton>
  </div>
</template>

<style scoped>
.secrets-persistence {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.secrets-persistence__note {
  margin: 0;
  max-width: 60ch;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}
</style>
