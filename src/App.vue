<script setup lang="ts">
// App shell (SPEC §6.1): a tiny view state (home | analysis | settings) plus
// a top bar with the pixel logo/wordmark. Home renders HomeContainer, Settings
// renders SettingsContainer and the analysis view renders AnalysisViewContainer.
//
// This is also where the integration task wires the pieces built in
// isolation by the other tasks: usePreferences is imported first so its
// lastOpened hook is in place before restoreLastOpened() runs below;
// configureRepo() binds the GitHub loader to the in-memory secrets; the
// keys-required banner is shown on Home/Analysis; and the last-opened
// analysis is restored once, on boot.
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { isKitRequested } from './ui/kitRoute'
import { useView } from './composables/useView'
import { usePreferences } from './composables/usePreferences'
import { useAnalysis } from './composables/useAnalysis'
import { useSecrets } from './composables/useSecrets'
import { configureRepo } from './composables/useRepo'
import { applyTheme } from './ui/theme'
import IconLogo from './assets/icons/IconLogo.vue'
import IconSettings from './assets/icons/IconSettings.vue'
import HomeContainer from './components/containers/HomeContainer.vue'
import AnalysisViewContainer from './components/containers/AnalysisViewContainer.vue'
import SettingsContainer from './components/containers/SettingsContainer.vue'
import KeysRequiredBanner from './components/ui/KeysRequiredBanner.vue'
import UiToastStack from './ui/UiToastStack.vue'
import type { ToastItem } from './ui/UiToastStack.vue'

// Dev-only UI kit (SPEC §10.4). In production `import.meta.env.DEV` is the
// literal `false`, so the dynamic import and the kit chunk are dropped.
const KitPage =
  import.meta.env.DEV && isKitRequested(window.location.search)
    ? defineAsyncComponent(() => import('./ui/KitPage.vue'))
    : null

const view = useView()
// Importing usePreferences here (not lazily) wires useAnalysis's lastOpened
// hook to Preferences' own reactive state before restoreLastOpened() below
// ever runs, so opening an analysis and a later preferences save can never
// clobber each other (see usePreferences.ts).
const prefs = usePreferences()
const secrets = useSecrets()
const analysis = useAnalysis()

let toastId = 0
const toasts = ref<ToastItem[]>([])
function pushToast(kind: ToastItem['kind'], message: string): void {
  toasts.value = [...toasts.value, { id: ++toastId, kind, message }]
}
function dismissToast(id: ToastItem['id']): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

configureRepo({
  getToken: () => secrets.state.githubToken,
  onUnauthorized: () => {
    secrets.setGitHubToken('')
    pushToast('warning', 'Your GitHub token was rejected and has been cleared. Enter it again in Settings.')
  },
  getPreferences: () => prefs.state,
})

// Applies the resolved theme before first paint, and keeps following the
// preference for as long as the shell is mounted (i.e. for the app's lifetime).
const themeEnv = { root: document.documentElement, matchMedia: (q: string) => window.matchMedia(q) }
let stopTheme = applyTheme(prefs.state.theme, themeEnv)
watch(
  () => prefs.state.theme,
  (theme) => {
    stopTheme()
    stopTheme = applyTheme(theme, themeEnv)
  },
)
onBeforeUnmount(() => stopTheme())

// Restores Preferences.lastAnalysisId once, on boot (SPEC §2.2 item 2).
if (analysis.restoreLastOpened()) view.state.view = 'analysis'

const showKeysBanner = computed(() => !secrets.hasJevKey.value && !prefs.state.keysBannerDismissed)
</script>

<template>
  <component :is="KitPage" v-if="KitPage" />
  <div v-else class="app-shell">
    <header class="app-shell__top-bar">
      <button class="app-shell__brand" type="button" data-test="brand" @click="view.goHome()">
        <IconLogo class="app-shell__logo" />
        <span class="app-shell__wordmark u-pixel-font">local-issue-classifier</span>
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
      <template v-if="view.state.view === 'home'">
        <KeysRequiredBanner v-if="showKeysBanner" @dismiss="prefs.dismissKeysBanner()" />
        <HomeContainer :on-clear-all="() => secrets.clearKeys()" />
      </template>
      <template v-else-if="view.state.view === 'analysis'">
        <KeysRequiredBanner v-if="showKeysBanner" @dismiss="prefs.dismissKeysBanner()" />
        <AnalysisViewContainer />
      </template>
      <SettingsContainer v-else />
    </main>

    <UiToastStack :toasts="toasts" @dismiss="dismissToast" />
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
