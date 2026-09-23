<script setup lang="ts">
// App shell (SPEC §6.1, design v2): a tiny view state (home | analysis |
// settings) plus a hairline top bar with the pixel logo and wordmark, a mono
// nav and a theme toggle. Home renders HomeContainer, Settings
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
import { applyTheme, nextThemePreference } from './ui/theme'
import IconLogo from './assets/icons/IconLogo.vue'
import IconMoon from './assets/icons/IconMoon.vue'
import IconSun from './assets/icons/IconSun.vue'
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

// Top-bar theme toggle: cycles the persisted preference (system → light → dark).
const themeLabel = computed(() => {
  const current = prefs.state.theme
  return `Theme: ${current}. Switch to ${nextThemePreference(current)}`
})
function cycleTheme(): void {
  prefs.update({ theme: nextThemePreference(prefs.state.theme) })
}

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
      <nav class="app-shell__nav" aria-label="Main">
        <button
          class="app-shell__nav-link"
          type="button"
          data-test="nav-analyses"
          :aria-current="view.state.view !== 'settings' ? 'page' : undefined"
          @click="view.goHome()"
        >
          analyses
        </button>
        <button
          class="app-shell__nav-link"
          type="button"
          data-test="open-settings"
          :aria-current="view.state.view === 'settings' ? 'page' : undefined"
          @click="view.openSettings()"
        >
          <IconSettings aria-hidden="true" />
          settings
        </button>
        <button
          class="app-shell__icon-button"
          type="button"
          data-test="theme-toggle"
          :aria-label="themeLabel"
          :title="themeLabel"
          @click="cycleTheme"
        >
          <IconMoon v-if="prefs.state.theme === 'dark'" />
          <IconSun v-else-if="prefs.state.theme === 'light'" />
          <span v-else class="app-shell__system-glyph" aria-hidden="true"><IconSun /><IconMoon /></span>
        </button>
      </nav>
    </header>
    <main class="app-shell__body">
      <template v-if="view.state.view === 'home'">
        <div v-if="showKeysBanner" class="app-shell__banner">
          <KeysRequiredBanner @dismiss="prefs.dismissKeysBanner()" />
        </div>
        <HomeContainer :on-clear-all="() => secrets.clearKeys()" />
      </template>
      <template v-else-if="view.state.view === 'analysis'">
        <div v-if="showKeysBanner" class="app-shell__banner app-shell__banner--wide">
          <KeysRequiredBanner @dismiss="prefs.dismissKeysBanner()" />
        </div>
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
  position: sticky;
  top: 0;
  z-index: var(--z-popover);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: calc(var(--size-large) + var(--space-3));
  padding: 0 var(--space-4);
  background: var(--color-bg);
  border-bottom: var(--line-thin) solid var(--color-border);
}

.app-shell__brand {
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

.app-shell__logo {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-accent);
}

.app-shell__wordmark {
  font-size: var(--text-body-size);
  line-height: var(--text-body-line);
}

.app-shell__nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.app-shell__nav-link,
.app-shell__icon-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--size-default);
  padding: 0 var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-table-size);
  cursor: pointer;
  transition:
    color var(--dur-base) var(--ease-out),
    background-color var(--dur-base) var(--ease-out);
}

.app-shell__nav-link:hover,
.app-shell__icon-button:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.app-shell__nav-link[aria-current='page'] {
  color: var(--color-text);
}

.app-shell__icon-button {
  justify-content: center;
  width: var(--size-default);
  padding: 0;
}

.app-shell__system-glyph {
  display: inline-flex;
}

.app-shell__system-glyph :deep(svg) {
  width: calc(var(--icon-sm) - var(--space-1));
  height: calc(var(--icon-sm) - var(--space-1));
}

.app-shell__banner {
  max-width: var(--measure-page);
  margin: var(--space-3) auto 0;
  padding: 0 var(--space-4);
}

.app-shell__banner--wide {
  max-width: var(--measure-wide);
}

@media (max-width: 40em) {
  .app-shell__top-bar {
    padding: 0 var(--space-3);
  }
  .app-shell__wordmark {
    display: none;
  }
}
</style>
