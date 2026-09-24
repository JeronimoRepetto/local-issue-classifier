<script setup lang="ts">
// Toast: auto-dismiss after 5 s except errors, pause on hover or
// focus, role="status" (or role="alert" for errors).
import { computed, onBeforeUnmount, onMounted } from 'vue'
import UiButton from './UiButton.vue'
import IconCheck from '../assets/icons/IconCheck.vue'
import IconInfo from '../assets/icons/IconInfo.vue'
import IconWarning from '../assets/icons/IconWarning.vue'
import IconClose from '../assets/icons/IconClose.vue'

export type ToastKind = 'success' | 'info' | 'warning' | 'error'

const props = withDefaults(
  defineProps<{
    kind: ToastKind
    message: string
    actionLabel?: string
    /** Milliseconds before auto-dismiss; errors never auto-dismiss. */
    duration?: number
  }>(),
  { duration: 5000 },
)

const emit = defineEmits<{ dismiss: []; action: [] }>()

const ICONS = { success: IconCheck, info: IconInfo, warning: IconWarning, error: IconWarning }
const role = computed(() => (props.kind === 'error' ? 'alert' : 'status'))
const autoDismiss = computed(() => props.kind !== 'error' && props.duration > 0)

let timer: ReturnType<typeof setTimeout> | undefined
let remaining = props.duration
let startedAt = 0

function start() {
  if (!autoDismiss.value || remaining <= 0) return
  startedAt = Date.now()
  timer = setTimeout(() => emit('dismiss'), remaining)
}

function pause() {
  if (timer === undefined) return
  clearTimeout(timer)
  timer = undefined
  remaining -= Date.now() - startedAt
}

onMounted(start)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    class="ui-toast"
    :class="`ui-toast--${kind}`"
    :role="role"
    @mouseenter="pause"
    @mouseleave="start"
    @focusin="pause"
    @focusout="start"
  >
    <component :is="ICONS[kind]" class="ui-toast__icon" />
    <p class="ui-toast__message">{{ message }}</p>
    <UiButton
      v-if="actionLabel"
      data-test="toast-action"
      variant="ghost"
      size="compact"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </UiButton>
    <UiButton
      data-test="toast-close"
      variant="ghost"
      size="compact"
      icon-only
      aria-label="Dismiss notification"
      @click="emit('dismiss')"
    >
      <template #icon><IconClose /></template>
    </UiButton>
  </div>
</template>

<style scoped>
.ui-toast {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  max-width: var(--measure-toast);
  min-height: var(--size-large);
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2h);
  background: var(--color-bg);
  color: var(--color-text);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-2);
}

.ui-toast__icon {
  flex: none;
}

.ui-toast__message {
  flex: 1;
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}

.ui-toast--success {
  color: var(--color-success);
}
.ui-toast--info {
  color: var(--color-info);
}
.ui-toast--warning {
  color: var(--color-warning);
}
.ui-toast--error {
  color: var(--color-danger);
}
</style>
