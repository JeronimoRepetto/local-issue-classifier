<script setup lang="ts">
// Bottom-right toast region. Shows at most 3 toasts, newest last.
import { computed } from 'vue'
import UiToast from './UiToast.vue'
import type { ToastKind } from './UiToast.vue'

export interface ToastItem {
  id: string | number
  kind: ToastKind
  message: string
  actionLabel?: string
}

const MAX_VISIBLE_TOASTS = 3

const props = defineProps<{ toasts: ToastItem[] }>()
const emit = defineEmits<{ dismiss: [id: ToastItem['id']]; action: [id: ToastItem['id']] }>()

const visible = computed(() => props.toasts.slice(-MAX_VISIBLE_TOASTS))
</script>

<template>
  <div class="ui-toast-stack">
    <TransitionGroup name="ui-toast">
      <UiToast
        v-for="toast in visible"
        :key="toast.id"
        :kind="toast.kind"
        :message="toast.message"
        :action-label="toast.actionLabel"
        @dismiss="emit('dismiss', toast.id)"
        @action="emit('action', toast.id)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ui-toast-stack {
  position: fixed;
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: var(--z-toast);
  display: grid;
  justify-items: end;
  gap: var(--space-2);
  pointer-events: none;
}

.ui-toast-stack > * {
  pointer-events: auto;
}

.ui-toast-enter-active {
  transition:
    opacity var(--dur-fade-slow) var(--ease-out),
    transform var(--dur-slow) var(--ease-out);
}

.ui-toast-leave-active {
  transition:
    opacity var(--dur-fade-base) var(--ease-in),
    transform var(--dur-base) var(--ease-in);
}

.ui-toast-enter-from,
.ui-toast-leave-to {
  opacity: 0;
  transform: scale(var(--motion-scale));
}
</style>
