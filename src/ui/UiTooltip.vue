<script setup lang="ts">
// Tooltip (SPEC §10.4): shown on hover and focus after 300 ms, hidden on leave,
// blur or Escape. Plain text only, never interactive content.
import { onBeforeUnmount, ref, useId } from 'vue'

const props = withDefaults(
  defineProps<{ text: string; placement?: 'top' | 'bottom'; delay?: number }>(),
  { placement: 'top', delay: 300 },
)

const id = `tooltip-${useId()}`
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function show() {
  clearTimeout(timer)
  timer = setTimeout(() => (visible.value = true), props.delay)
}

function hide() {
  clearTimeout(timer)
  visible.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <span
    class="ui-tooltip"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @keydown="onKeydown"
  >
    <slot :described-by="id" />
    <span
      v-show="visible"
      :id="id"
      role="tooltip"
      class="ui-tooltip__bubble"
      :class="`ui-tooltip__bubble--${placement}`"
    >
      {{ text }}
    </span>
  </span>
</template>

<style scoped>
.ui-tooltip {
  position: relative;
  display: inline-flex;
}

.ui-tooltip__bubble {
  position: absolute;
  left: 50%;
  z-index: var(--z-popover);
  width: max-content;
  max-width: var(--measure-tooltip);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-inverse-surface);
  color: var(--color-on-inverse);
  box-shadow: var(--elev-2);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  font-weight: var(--weight-regular);
  white-space: pre-line;
  pointer-events: none;
  transform: translateX(-50%);
  animation: ui-tooltip-in var(--dur-fade-base) var(--ease-out);
}

.ui-tooltip__bubble--top {
  bottom: calc(100% + var(--space-1));
}

.ui-tooltip__bubble--bottom {
  top: calc(100% + var(--space-1));
}

@keyframes ui-tooltip-in {
  from {
    opacity: 0;
  }
}
</style>
