<script setup lang="ts">
// App shell (SPEC §6.1): a tiny view state (home | analysis | settings) plus
// a top bar with the pixel logo/wordmark. Home renders HomeContainer; the
// other two views render placeholders until Task 4 (Settings) and Task 12
// (Issues) land their real containers — see the TODO(INT) markers below.
//
// TODO(INT): Task 4's usePreferences.ts must be imported here (or in main.ts)
// at bootstrap, before any useAnalysis().setCurrent() call, so the theme and
// other preferences are applied before the app renders and reload restores
// Preferences.lastAnalysisId. Not imported yet: Task 4 is not in this lane's
// base branch, so the file does not exist here.
import { defineAsyncComponent } from 'vue'
import { isKitRequested } from './ui/kitRoute'
import { useView } from './composables/useView'
import IconLogo from './assets/icons/IconLogo.vue'
import IconSettings from './assets/icons/IconSettings.vue'
import HomeContainer from './components/containers/HomeContainer.vue'
import AnalysisViewPlaceholder from './components/containers/AnalysisViewPlaceholder.vue'
import SettingsPlaceholder from './components/containers/SettingsPlaceholder.vue'

// Dev-only UI kit (SPEC §10.4). In production `import.meta.env.DEV` is the
// literal `false`, so the dynamic import and the kit chunk are dropped.
const KitPage =
  import.meta.env.DEV && isKitRequested(window.location.search)
    ? defineAsyncComponent(() => import('./ui/KitPage.vue'))
    : null

const view = useView()
</script>

<template>
  <component :is="KitPage" v-if="KitPage" />
  <div v-else class="app-shell">
    <header class="app-shell__top-bar">
      <button class="app-shell__brand" type="button" data-test="brand" @click="view.goHome()">
        <IconLogo class="app-shell__logo" />
        <span class="app-shell__wordmark u-pixel-font">issue-criticity</span>
      </button>
      <button
        class="app-shell__settings"
        type="button"
        aria-label="Settings"
        data-test="open-settings"
        @click="view.openSettings()"
      >
        <IconSettings />
      </button>
    </header>
    <main class="app-shell__body">
      <HomeContainer v-if="view.state.view === 'home'" />
      <AnalysisViewPlaceholder v-else-if="view.state.view === 'analysis'" />
      <SettingsPlaceholder v-else />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
}

.app-shell__top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface-2);
  border-bottom: var(--line-thin) solid var(--color-border);
}

.app-shell__brand,
.app-shell__settings {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  cursor: pointer;
}

.app-shell__brand:hover,
.app-shell__settings:hover {
  background: var(--color-surface);
}

.app-shell__logo {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-accent);
}

.app-shell__wordmark {
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
}

.app-shell__body {
  overflow: auto;
}
</style>
