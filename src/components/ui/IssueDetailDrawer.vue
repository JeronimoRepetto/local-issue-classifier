<script setup lang="ts">
// Detail drawer (SPEC §6.3): the stored, trimmed body and comments, exactly as
// Jev saw them, in plain text. Never `v-html`: issue bodies and comments are
// untrusted content (SPEC §8 "Untrusted content"), so everything below is
// plain interpolation, which Vue escapes automatically.
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import IconClose from '../../assets/icons/IconClose.vue'
import { focusFirst, trapTab } from '../../ui/focusTrap'
import type { Issue } from '../../domain/types'

const props = defineProps<{ open: boolean; issue: Issue | null }>()
const emit = defineEmits<{ close: [] }>()

const id = `issue-drawer-${useId()}`
const panel = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null

watch(
  () => props.open,
  async (open) => {
    if (open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      if (panel.value) focusFirst(panel.value)
    } else if (opener?.isConnected) {
      opener.focus()
      opener = null
    }
  },
)

onBeforeUnmount(() => {
  if (props.open && opener?.isConnected) opener.focus()
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }
  if (panel.value) trapTab(event, panel.value)
}
</script>

<template>
  <Teleport to="body" defer>
    <Transition name="issue-drawer">
      <div v-if="open && issue" class="issue-drawer__backdrop" @mousedown.self="emit('close')">
        <div
          ref="panel"
          class="issue-drawer"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`${id}-title`"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <header class="issue-drawer__header">
            <h2 :id="`${id}-title`" class="issue-drawer__title">#{{ issue.number }} {{ issue.title }}</h2>
            <UiButton
              data-test="drawer-close"
              variant="ghost"
              size="compact"
              icon-only
              aria-label="Close issue detail"
              @click="emit('close')"
            >
              <template #icon><IconClose /></template>
            </UiButton>
          </header>

          <section class="issue-drawer__section">
            <h3>Body</h3>
            <p class="issue-drawer__body">{{ issue.body || '(no description)' }}</p>
          </section>

          <section v-if="issue.comments.length > 0" class="issue-drawer__section">
            <h3>Comments ({{ issue.comments.length }})</h3>
            <ul class="issue-drawer__comments">
              <li v-for="comment in issue.comments" :key="comment.id" class="issue-drawer__comment">
                <p class="issue-drawer__comment-meta">
                  <strong>{{ comment.author }}</strong> · {{ comment.createdAt.slice(0, 10) }}
                </p>
                <p class="issue-drawer__body">{{ comment.body }}</p>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.issue-drawer__backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  display: flex;
  justify-content: flex-end;
  background: var(--color-overlay);
}

.issue-drawer {
  display: grid;
  align-content: start;
  gap: var(--space-3);
  width: min(var(--measure-dialog), 100%);
  height: 100%;
  overflow: auto;
  padding: var(--space-4);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--elev-3);
}

.issue-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.issue-drawer__title {
  margin: 0;
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
}

.issue-drawer__section h3 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-table-size);
  color: var(--color-text-muted);
}

.issue-drawer__body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.issue-drawer__comments {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.issue-drawer__comment-meta {
  margin: 0 0 var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
}

.issue-drawer-enter-active,
.issue-drawer-leave-active {
  transition: opacity var(--dur-fade-base) var(--ease-out);
}

.issue-drawer-enter-active .issue-drawer,
.issue-drawer-leave-active .issue-drawer {
  transition: transform var(--dur-base) var(--ease-out);
}

.issue-drawer-leave-active {
  transition-timing-function: var(--ease-in);
}

.issue-drawer-enter-from,
.issue-drawer-leave-to {
  opacity: 0;
}

.issue-drawer-enter-from .issue-drawer,
.issue-drawer-leave-to .issue-drawer {
  transform: translateX(var(--space-4));
}
</style>
