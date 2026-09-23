<script setup lang="ts">
// SPEC §2.3 "Storage full": a blocking notice with a Retry save button. `quota`
// means the disk quota was hit; `unavailable` covers a blocked/disabled storage.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import IconWarning from '../../assets/icons/IconWarning.vue'

const props = defineProps<{ reason: 'quota' | 'unavailable' }>()
defineEmits<{ retry: [] }>()

const message = computed(() =>
  props.reason === 'quota'
    ? "This analysis could not be saved (browser storage is full). Delete older analyses on Home, or lower 'Max issues to load'."
    : 'This analysis could not be saved (browser storage is unavailable). It stays open for this session only.',
)
</script>

<template>
  <div class="save-failed-notice" role="alert" data-test="save-failed-notice">
    <IconWarning class="save-failed-notice__icon" />
    <div class="save-failed-notice__body">
      <p class="save-failed-notice__message">{{ message }}</p>
      <slot name="meter" />
      <UiButton variant="secondary" data-test="retry-save" @click="$emit('retry')">Retry save</UiButton>
    </div>
  </div>
</template>

<style scoped>
.save-failed-notice {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface-2);
  border: var(--line-thin) solid var(--color-danger);
  border-radius: var(--radius-md);
}

.save-failed-notice__icon {
  flex: none;
  color: var(--color-danger);
}

.save-failed-notice__body {
  display: grid;
  gap: var(--space-2);
}

.save-failed-notice__message {
  margin: 0;
}
</style>
