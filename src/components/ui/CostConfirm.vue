<script setup lang="ts">
// The comment-cost confirmation (SPEC §2.3 step 4): "Fetching comments needs ~N
// requests; you have M left. Fetch comments / Skip comments / Cancel".
import UiButton from '../../ui/UiButton.vue'

const props = defineProps<{ requests: number; remaining: number | null }>()
const emit = defineEmits<{ decision: [decision: 'fetch' | 'skip' | 'cancel'] }>()

const remainingText = () => (props.remaining === null ? 'an unknown amount' : String(props.remaining))
</script>

<template>
  <div class="cost-confirm" role="alertdialog" aria-label="Confirm fetching comments" data-test="cost-confirm">
    <p class="cost-confirm__message">
      Fetching comments needs ~{{ requests }} requests; you have {{ remainingText() }} left.
    </p>
    <div class="cost-confirm__actions">
      <UiButton variant="primary" data-test="cost-confirm-fetch" @click="emit('decision', 'fetch')">
        Fetch comments
      </UiButton>
      <UiButton variant="secondary" data-test="cost-confirm-skip" @click="emit('decision', 'skip')">
        Skip comments
      </UiButton>
      <UiButton variant="ghost" data-test="cost-confirm-cancel" @click="emit('decision', 'cancel')">Cancel</UiButton>
    </div>
  </div>
</template>

<style scoped>
.cost-confirm {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface-2);
  border-radius: var(--radius-md);
}

.cost-confirm__message {
  margin: 0;
}

.cost-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
