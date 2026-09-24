<script setup lang="ts">
// Modal dialog: focus trap, Esc closes, focus returns to
// the opener, and a destructive variant gated by a typed confirmation phrase.
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import UiButton from './UiButton.vue'
import IconClose from '../assets/icons/IconClose.vue'
import { focusFirst, trapTab } from './focusTrap'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    /** Destructive variant: the user must type this phrase to enable Confirm. */
    confirmPhrase?: string
    confirmLabel?: string
    cancelLabel?: string
    /** Teleport target; the kit page uses it to keep a dialog inside its themed panel. */
    teleportTo?: string
  }>(),
  { confirmLabel: 'Delete', cancelLabel: 'Cancel', teleportTo: 'body' },
)

const emit = defineEmits<{ close: []; confirm: [] }>()

const id = `dialog-${useId()}`
const panel = ref<HTMLElement | null>(null)
const typed = ref('')
const confirmEnabled = computed(() => !props.confirmPhrase || typed.value === props.confirmPhrase)
let opener: HTMLElement | null = null

watch(
  () => props.open,
  async (open) => {
    if (open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      typed.value = ''
      await nextTick()
      if (panel.value) focusFirst(panel.value)
    } else {
      restoreFocus()
    }
  },
  { immediate: true },
)

function restoreFocus() {
  const target = opener
  opener = null
  if (target && target.isConnected) target.focus()
}

onBeforeUnmount(() => {
  if (props.open) restoreFocus()
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }
  if (panel.value) trapTab(event, panel.value)
}

function confirm() {
  if (confirmEnabled.value) emit('confirm')
}
</script>

<template>
  <Teleport :to="teleportTo" defer>
    <Transition name="ui-dialog">
      <div v-if="open" class="ui-dialog__backdrop" @mousedown.self="emit('close')">
        <div
          ref="panel"
          class="ui-dialog"
          :class="{ 'ui-dialog--destructive': confirmPhrase }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`${id}-title`"
          :aria-describedby="description ? `${id}-desc` : undefined"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <header class="ui-dialog__header">
            <h2 :id="`${id}-title`" class="ui-dialog__title">{{ title }}</h2>
            <UiButton
              data-test="dialog-close"
              variant="ghost"
              size="compact"
              icon-only
              aria-label="Close dialog"
              @click="emit('close')"
            >
              <template #icon><IconClose /></template>
            </UiButton>
          </header>
          <p v-if="description" :id="`${id}-desc`" class="ui-dialog__description">
            {{ description }}
          </p>
          <div class="ui-dialog__body"><slot /></div>
          <label v-if="confirmPhrase" class="ui-dialog__phrase">
            <span>
              Type <strong>{{ confirmPhrase }}</strong> to confirm
            </span>
            <input
              v-model="typed"
              class="ui-control ui-dialog__phrase-input"
              data-test="dialog-phrase"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <footer class="ui-dialog__actions">
            <slot name="actions">
              <UiButton v-if="confirmPhrase" variant="ghost" @click="emit('close')">
                {{ cancelLabel }}
              </UiButton>
              <UiButton
                v-if="confirmPhrase"
                data-test="dialog-confirm"
                variant="danger"
                :disabled="!confirmEnabled"
                @click="confirm"
              >
                {{ confirmLabel }}
              </UiButton>
            </slot>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: var(--color-overlay);
}

.ui-dialog {
  display: grid;
  gap: var(--space-3);
  width: 100%;
  max-width: var(--measure-dialog);
  max-height: calc(100vh - var(--space-6));
  overflow: auto;
  padding: var(--space-4);
  background: var(--color-bg);
  color: var(--color-text);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-3);
}

.ui-dialog:focus-visible {
  outline-offset: calc(var(--line-thick) * -1);
}

.ui-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.ui-dialog__title {
  margin: 0;
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
  font-weight: var(--weight-medium);
}

.ui-dialog__description {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}

.ui-dialog__phrase {
  display: grid;
  gap: var(--space-1);
  font-size: var(--text-table-size);
}

.ui-dialog__phrase-input {
  font: inherit;
}

.ui-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin: 0 calc(var(--space-4) * -1) calc(var(--space-4) * -1);
  padding: var(--space-2h) var(--space-4);
  border-top: var(--line-thin) solid var(--color-border);
  background: var(--color-surface);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

.ui-dialog__actions:empty {
  display: none;
}

/* Opacity plus scale 0.98 → 1 over dur-slow (§10.6); reduced motion keeps an 80 ms fade. */
.ui-dialog-enter-active,
.ui-dialog-leave-active {
  transition: opacity var(--dur-fade-slow) var(--ease-out);
}

.ui-dialog-enter-active .ui-dialog,
.ui-dialog-leave-active .ui-dialog {
  transition: transform var(--dur-slow) var(--ease-out);
}

.ui-dialog-leave-active {
  transition-timing-function: var(--ease-in);
}

.ui-dialog-enter-from,
.ui-dialog-leave-to {
  opacity: 0;
}

.ui-dialog-enter-from .ui-dialog,
.ui-dialog-leave-to .ui-dialog {
  transform: scale(var(--motion-scale));
}
</style>
