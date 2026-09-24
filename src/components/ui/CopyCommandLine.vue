<script setup lang="ts">
// Shared copy-pasteable command line for LocalSetupGuide.vue (Settings) and
// ProviderOnboardingCard.vue (Home) — one implementation so both surfaces
// behave identically (FB local-setup UX task, item 3: icon-only copy button,
// never textual "Copy"/"Copied"). `useClipboardCopy` per instance (it is a
// plain factory, not a module singleton — see its own file), so each command
// line owns its own "Copied" state independently.
//
// Layout bugfix (2026-09-24): the home page's provider cards clipped long
// commands. This is a flex row that can shrink below its content's natural
// width (`min-width: 0` on both itself and the `<code>`), with the command
// scrolling horizontally inside its own box instead of overflowing the card,
// and the copy button pinned at the right edge (`flex: none`).
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiTooltip from '../../ui/UiTooltip.vue'
import IconCopy from '../../assets/icons/IconCopy.vue'
import IconCheck from '../../assets/icons/IconCheck.vue'
import { useClipboardCopy } from '../../composables/useClipboardCopy'

const props = defineProps<{
  /** Step id — used only for the `data-test` hooks below. */
  id: string
  command: string
}>()

const { copiedId, copy } = useClipboardCopy()
const copied = computed(() => copiedId.value === props.id)

function onCopy(): Promise<void> {
  return copy(props.id, props.command)
}
</script>

<template>
  <div class="copy-command-line">
    <code class="copy-command-line__code" :data-test="`command-${id}`">{{ command }}</code>
    <UiTooltip text="Copy command">
      <template #default="{ describedBy }">
        <UiButton
          icon-only
          variant="ghost"
          size="compact"
          aria-label="Copy command"
          :aria-describedby="describedBy"
          :data-test="`copy-${id}`"
          @click="onCopy"
        >
          <template #icon>
            <IconCheck v-if="copied" />
            <IconCopy v-else />
          </template>
        </UiButton>
      </template>
    </UiTooltip>
    <span class="u-visually-hidden" role="status" aria-live="polite" :data-test="`copied-${id}`">
      {{ copied ? 'Copied' : '' }}
    </span>
  </div>
</template>

<style scoped>
.copy-command-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.copy-command-line__code {
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  padding: var(--space-2);
  overflow-x: auto;
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  white-space: pre;
}

.copy-command-line :deep(.ui-button) {
  flex: none;
}
</style>
