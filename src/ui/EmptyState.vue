<script setup lang="ts">
// Empty and error states (SPEC §10.1 / §10.4, design v2): a small monochrome
// pixel illustration (one of the three pixel accents), a sans title, one plain
// sentence and at most one action. No frame.
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
    <h2 class="empty-state__title">{{ title }}</h2>
    <p class="empty-state__text">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state__action"><slot name="action" /></div>
  </section>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  max-width: var(--measure-dialog);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

/* The 32×32 art renders at 2× (64 px), crisp, in the subtle text color. */
.empty-state__art {
  display: grid;
  place-items: center;
  margin-bottom: var(--space-2);
  color: var(--color-text-subtle);
}

.empty-state__art :deep(svg) {
  width: calc(var(--icon-lg) * 2);
  height: calc(var(--icon-lg) * 2);
}

.empty-state--error .empty-state__art {
  color: var(--color-danger);
}

.empty-state__title {
  margin: 0;
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
  font-weight: var(--weight-medium);
}

.empty-state__text {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}

.empty-state__action {
  margin-top: var(--space-2);
}
</style>
