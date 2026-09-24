<script setup lang="ts">
// Click-toggled popover with a focus trap; Esc or an outside click
// closes it and returns focus to the trigger. Opacity plus a 4 px shift.
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { focusFirst, trapTab } from './focusTrap'

const props = withDefaults(
  defineProps<{ label: string; align?: 'start' | 'end' }>(),
  { align: 'start' },
)

const id = `popover-${useId()}`
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)

function triggerEl(): HTMLElement | null {
  return root.value?.querySelector<HTMLElement>('[data-popover-trigger]') ?? null
}

async function show() {
  open.value = true
  await nextTick()
  if (panel.value) focusFirst(panel.value)
}

function hide(returnFocus = true) {
  if (!open.value) return
  open.value = false
  if (returnFocus) triggerEl()?.focus()
}

function toggle() {
  if (open.value) hide()
  else show()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    hide()
  } else if (panel.value) {
    trapTab(event, panel.value)
  }
}

function onDocumentMousedown(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) hide(false)
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onDocumentMousedown)
  else document.removeEventListener('mousedown', onDocumentMousedown)
})

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentMousedown))

defineExpose({ show, hide, toggle })
</script>

<template>
  <div ref="root" class="ui-popover">
    <slot
      name="trigger"
      :toggle="toggle"
      :open="open"
      :attrs="{
        'data-popover-trigger': '',
        'aria-haspopup': 'dialog',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': id,
      }"
    />
    <Transition name="ui-popover">
      <div
        v-if="open"
        :id="id"
        ref="panel"
        class="ui-popover__panel"
        :class="`ui-popover__panel--${props.align}`"
        role="dialog"
        :aria-label="label"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <slot :close="hide" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ui-popover {
  position: relative;
  display: inline-flex;
}

.ui-popover__panel {
  position: absolute;
  top: calc(100% + var(--space-1));
  z-index: var(--z-popover);
  min-width: calc(var(--space-7) * 3);
  max-width: var(--measure-popover);
  padding: var(--space-2h);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-2);
}

.ui-popover__panel--start {
  left: 0;
}

.ui-popover__panel--end {
  right: 0;
}

.ui-popover-enter-active,
.ui-popover-leave-active {
  transition:
    opacity var(--dur-fade-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.ui-popover-leave-active {
  transition-timing-function: var(--ease-in);
}

.ui-popover-enter-from,
.ui-popover-leave-to {
  opacity: 0;
  transform: translateY(calc(var(--motion-shift) * -1));
}
</style>
