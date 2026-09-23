<script setup lang="ts">
// Keyboard shortcuts help (SPEC §6.1 analysis view), left out by Task 12 and
// added by the integration task. Presentational: built on the kit UiDialog,
// opened by "?" in AnalysisViewContainer.vue.
import UiDialog from '../../ui/UiDialog.vue'
import UiButton from '../../ui/UiButton.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: '/', description: 'Focus the search field' },
  { keys: '↑ / ↓', description: 'Move focus between table rows' },
  { keys: 'Enter', description: 'Expand the focused issue' },
  { keys: 'D', description: 'Dismiss or restore the focused issue' },
  { keys: '?', description: 'Show this help' },
]
</script>

<template>
  <UiDialog :open="open" title="Keyboard shortcuts" @close="emit('close')">
    <dl class="shortcuts-help__list">
      <template v-for="shortcut in SHORTCUTS" :key="shortcut.keys">
        <dt><kbd>{{ shortcut.keys }}</kbd></dt>
        <dd>{{ shortcut.description }}</dd>
      </template>
    </dl>
    <template #actions>
      <UiButton variant="secondary" data-test="shortcuts-help-close" @click="emit('close')">Close</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.shortcuts-help__list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-3);
  margin: 0;
}

.shortcuts-help__list dt {
  font-weight: var(--weight-semibold);
}

.shortcuts-help__list dd {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
