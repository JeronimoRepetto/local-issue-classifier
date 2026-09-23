<script setup lang="ts">
// TODO(INT): replace with Task 4's SettingsContainer.vue once it lands. Keeps
// the Settings entry point navigable (App.vue's Settings gear) in the meantime.
import { useView } from '../../composables/useView'
import UiButton from '../../ui/UiButton.vue'

const view = useView()
</script>

<template>
  <section class="settings-placeholder" data-test="settings-placeholder">
    <h1 class="u-pixel-font">Settings</h1>
    <p>Settings (keys, preferences) lands with Task 4. Nothing to configure here yet.</p>
    <UiButton variant="secondary" @click="view.goHome()">Back to Analyses</UiButton>
  </section>
</template>

<style scoped>
.settings-placeholder {
  display: grid;
  gap: var(--space-3);
  max-width: calc(var(--space-7) * 15);
  margin: 0 auto;
  padding: var(--space-4);
}
</style>
