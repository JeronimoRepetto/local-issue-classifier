<script setup lang="ts">
// Inline progress arc: a 16-unit ring with a quarter arc that turns once per
// `--dur-spin`. It is static under reduced motion, because `--dur-spin`
// resolves to 0 ms there.
</script>

<template>
  <svg class="ui-spinner" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <circle class="ui-spinner__track" cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" />
    <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.ui-spinner {
  width: var(--icon-sm);
  height: var(--icon-sm);
  animation: ui-spinner-turn var(--dur-spin) linear infinite;
}

.ui-spinner__track {
  opacity: 0.25;
}

@keyframes ui-spinner-turn {
  to {
    transform: rotate(1turn);
  }
}
</style>
