<script setup lang="ts">
// App shell. Containers and routing land in later tasks (SPEC §11).
import { defineAsyncComponent } from 'vue'
import { isKitRequested } from './ui/kitRoute'

// Dev-only UI kit (SPEC §10.4). In production `import.meta.env.DEV` is the
// literal `false`, so the dynamic import and the kit chunk are dropped.
const KitPage =
  import.meta.env.DEV && isKitRequested(window.location.search)
    ? defineAsyncComponent(() => import('./ui/KitPage.vue'))
    : null
</script>

<template>
  <component :is="KitPage" v-if="KitPage" />
  <main v-else class="app-shell">
    <h1>issue-criticity</h1>
    <p class="app-shell__placeholder">
      Coming soon: calibrated complexity, criticality, cost and relevance scores for a GitHub
      issue backlog.
    </p>
  </main>
</template>

<style scoped>
.app-shell {
  padding: var(--space-5);
}
</style>
