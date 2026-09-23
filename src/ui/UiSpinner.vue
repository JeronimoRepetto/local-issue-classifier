<script setup lang="ts">
// Inline 2×2 pixel spinner. It steps with `ease-pixel` and is static under
// reduced motion, because `--dur-sprite` resolves to 0 ms there.
</script>

<template>
  <span class="ui-spinner" aria-hidden="true">
    <span v-for="n in 4" :key="n" class="ui-spinner__cell" :style="{ '--cell': n - 1 }" />
  </span>
</template>

<style scoped>
.ui-spinner {
  display: inline-grid;
  grid-template-columns: repeat(2, var(--space-1));
  grid-template-rows: repeat(2, var(--space-1));
  gap: var(--line-thin);
}

.ui-spinner__cell {
  background: currentColor;
  opacity: 0.25;
  animation: ui-spinner-blink var(--dur-sprite) var(--ease-pixel) infinite;
  animation-delay: calc(var(--dur-sprite) * var(--cell) / 4 - var(--dur-sprite));
}

/* Clockwise order: top-left, top-right, bottom-right, bottom-left. */
.ui-spinner__cell:nth-child(3) {
  order: 4;
}

@keyframes ui-spinner-blink {
  0%,
  24.9% {
    opacity: 1;
  }
  25%,
  100% {
    opacity: 0.25;
  }
}
</style>
