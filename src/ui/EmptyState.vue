<script setup lang="ts">
// Empty and error states (SPEC §10.1 / §10.4): a pixel illustration scaled 4×,
// a title (pixel font allowed), one plain sentence and exactly one action.
import IconEmptyBox from '../assets/icons/IconEmptyBox.vue'

withDefaults(defineProps<{ title: string; description: string; tone?: 'neutral' | 'error' }>(), {
  tone: 'neutral',
})
</script>

<template>
  <section class="empty-state" :class="`empty-state--${tone}`">
    <div class="empty-state__art" aria-hidden="true">
      <slot name="illustration"><IconEmptyBox /></slot>
    </div>
    <h2 class="empty-state__title u-pixel-font">{{ title }}</h2>
    <p class="empty-state__text">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state__action"><slot name="action" /></div>
  </section>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  max-width: var(--measure-dialog);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

/* Frame with square pixel corners; the 32×32 art renders at 4× (128 px). */
.empty-state__art {
  display: grid;
  place-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-pixel);
  background: var(--color-surface-2);
  color: var(--color-accent);
}

.empty-state__art :deep(svg) {
  width: calc(var(--icon-lg) * 4);
  height: calc(var(--icon-lg) * 4);
}

.empty-state--error .empty-state__art {
  color: var(--color-danger);
}

.empty-state__title {
  margin: 0;
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
}

.empty-state__text {
  margin: 0;
  color: var(--color-text-muted);
}

.empty-state__action {
  margin-top: var(--space-2);
}
</style>
