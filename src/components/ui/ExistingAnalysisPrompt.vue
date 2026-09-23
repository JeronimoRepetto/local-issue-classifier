<script setup lang="ts">
// SPEC §2.3 step 5: "An analysis of owner/repo (open) exists. Open it / Refresh it / Create a separate one".
import UiButton from '../../ui/UiButton.vue'

defineProps<{ repoFullName: string; stateFilter: 'open' | 'closed' | 'all' }>()
const emit = defineEmits<{ decision: [decision: 'open' | 'refresh' | 'create'] }>()
</script>

<template>
  <div class="existing-analysis-prompt" role="alertdialog" data-test="existing-analysis-prompt">
    <p class="existing-analysis-prompt__message">
      An analysis of {{ repoFullName }} ({{ stateFilter }}) exists.
    </p>
    <div class="existing-analysis-prompt__actions">
      <UiButton variant="primary" data-test="existing-open" @click="emit('decision', 'open')">Open it</UiButton>
      <UiButton variant="secondary" data-test="existing-refresh" @click="emit('decision', 'refresh')">
        Refresh it
      </UiButton>
      <UiButton variant="ghost" data-test="existing-create" @click="emit('decision', 'create')">
        Create a separate one
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.existing-analysis-prompt {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface-2);
  border-radius: var(--radius-md);
}

.existing-analysis-prompt__message {
  margin: 0;
}

.existing-analysis-prompt__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
