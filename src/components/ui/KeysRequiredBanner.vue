<script setup lang="ts">
// The "Keys required" banner (SPEC §2.1 step 2). Presentational: no store
// access, it just announces the state and offers to dismiss itself. Home and
// every saved analysis stay fully usable without keys, which the copy below
// says explicitly.
import UiButton from '../../ui/UiButton.vue'
import IconInfo from '../../assets/icons/IconInfo.vue'
import IconClose from '../../assets/icons/IconClose.vue'

defineEmits<{ dismiss: [] }>()
</script>

<template>
  <div class="keys-banner" role="status">
    <IconInfo class="keys-banner__icon" aria-hidden="true" />
    <p class="keys-banner__text">
      Your keys are kept in memory only and are cleared when this page reloads. Add your Jev API
      key or configure a local provider in Settings. Your saved analyses are still here.
    </p>
    <UiButton
      data-test="dismiss-banner"
      variant="ghost"
      size="compact"
      icon-only
      aria-label="Dismiss"
      @click="$emit('dismiss')"
    >
      <template #icon><IconClose /></template>
    </UiButton>
  </div>
</template>

<style scoped>
.keys-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2h);
  padding: var(--space-2h) var(--space-2) var(--space-2h) var(--space-3);
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
}

.keys-banner__icon {
  flex: none;
  margin-top: var(--line-thick);
  color: var(--color-info);
}

.keys-banner__text {
  flex: 1;
  margin: 0;
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  color: var(--color-text-muted);
}
</style>
