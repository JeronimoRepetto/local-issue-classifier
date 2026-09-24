<script setup lang="ts">
// App shell (design v2): a tiny view state (home | analysis |
// settings) plus a hairline top bar with the pixel logo and wordmark, a mono
// nav and a theme toggle. Home renders HomeContainer, Settings
// renders SettingsContainer and the analysis view renders AnalysisViewContainer.
//
// This is also where the integration task wires the pieces built in
// isolation by the other tasks: usePreferences is imported first so its
// lastOpened hook is in place before restoreLastOpened() runs below;
// configureRepo() binds the GitHub loader to the in-memory secrets; the
// keys-required banner is shown on Home/Analysis; and, once on boot, legacy
// localStorage analyses are moved to IndexedDB and the last-opened analysis is
// restored (both async, behind a loading state, before any view renders).
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { isKitRequested } from './ui/kitRoute'
import { useView } from './composables/useView'
import { usePreferences } from './composables/usePreferences'
import { useAnalysis } from './composables/useAnalysis'
import { migrationNotice, useAnalyses } from './composables/useAnalyses'
import { useSecrets } from './composables/useSecrets'
import { useProvider } from './composables/useProvider'
import { configureRepo } from './composables/useRepo'
import { applyTheme, nextThemePreference } from './ui/theme'
import IconLogo from './assets/icons/IconLogo.vue'
import IconMoon from './assets/icons/IconMoon.vue'
import IconSun from './assets/icons/IconSun.vue'
import IconSettings from './assets/icons/IconSettings.vue'
import GitHubMarkIcon from './ui/GitHubMarkIcon.vue'
import LinkedInMarkIcon from './ui/LinkedInMarkIcon.vue'
import KofiMarkIcon from './ui/KofiMarkIcon.vue'
import UiTooltip from './ui/UiTooltip.vue'
import HomeContainer from './components/containers/HomeContainer.vue'
import AnalysisViewContainer from './components/containers/AnalysisViewContainer.vue'
import SettingsContainer from './components/containers/SettingsContainer.vue'
import KeysRequiredBanner from './components/ui/KeysRequiredBanner.vue'
import UiToastStack from './ui/UiToastStack.vue'
import type { ToastItem } from './ui/UiToastStack.vue'

// Dev-only UI kit. In production `import.meta.env.DEV` is the
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
const provider = useProvider()
const analysis = useAnalysis()
const analyses = useAnalyses()

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

// Boot: move any legacy localStorage analyses into
// IndexedDB (one-line notice when something moved), then restore
// Preferences.lastAnalysisId. No view renders until this finishes.
const booting = ref(true)
async function boot(): Promise<void> {
  try {
    const moved = await analyses.boot()
    const notice = migrationNotice(moved)
    if (notice) pushToast(moved.failed > 0 ? 'warning' : 'info', notice)
    if (await analysis.restoreLastOpened()) view.state.view = 'analysis'
  } finally {
    booting.value = false
  }
}
void boot()

// Top-bar theme toggle: cycles the persisted preference (system → light → dark).
const themeLabel = computed(() => {
  const current = prefs.state.theme
  return `Theme: ${current}. Switch to ${nextThemePreference(current)}`
})
function cycleTheme(): void {
  prefs.update({ theme: nextThemePreference(prefs.state.theme) })
}

// T16: ready is a Jev key for TypeSafe, or a valid base URL for a local provider (key optional).
const showKeysBanner = computed(() => !provider.ready.value && !prefs.state.keysBannerDismissed)

// Author links (requested after the Home provider-card approval). GitHub and
// LinkedIn render their real brand mark: GitHub's (Simple Icons, CC0) and
// LinkedIn's own official [in] Logo (see docs/design.md "Icons" and
// THIRD_PARTY_NOTICES.md "Brand icons" for sourcing and the brand-guideline
// rules each mark follows). Ko-fi (added 2026-09-24) instead renders an
// original coffee-mug icon: Ko-fi's own brand assets offer no monochrome
// variant to recolor and its Terms broadly restrict trademark use and
// modification, unlike LinkedIn's guidelines — see KofiMarkIcon.vue and
// THIRD_PARTY_NOTICES.md ("Ko-fi support link") for the full reasoning.
const GITHUB_REPO_URL = 'https://github.com/JeronimoRepetto/local-issue-classifier'
const LINKEDIN_PROFILE_URL = 'https://www.linkedin.com/in/jrepetto92/'
const KOFI_PROFILE_URL = 'https://ko-fi.com/jeronimorepetto'
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
        <UiTooltip text="Source code on GitHub">
          <template #default="{ describedBy }">
            <a
              class="app-shell__social-link"
              data-test="social-github"
              :href="GITHUB_REPO_URL"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Source code on GitHub"
              :aria-describedby="describedBy"
            >
              <GitHubMarkIcon />
            </a>
          </template>
        </UiTooltip>
        <UiTooltip text="Author on LinkedIn">
          <template #default="{ describedBy }">
            <a
              class="app-shell__social-link"
              data-test="social-linkedin"
              :href="LINKEDIN_PROFILE_URL"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Author on LinkedIn"
              :aria-describedby="describedBy"
            >
              <LinkedInMarkIcon />
            </a>
          </template>
        </UiTooltip>
        <UiTooltip text="Support the author on Ko-fi">
          <template #default="{ describedBy }">
            <a
              class="app-shell__social-link"
              data-test="social-kofi"
              :href="KOFI_PROFILE_URL"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Support the author on Ko-fi"
              :aria-describedby="describedBy"
            >
              <KofiMarkIcon />
            </a>
          </template>
        </UiTooltip>
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
    <main class="app-shell__body" :aria-busy="booting">
      <p v-if="booting" class="app-shell__loading" data-test="app-loading" role="status">Loading saved analyses…</p>
      <template v-else-if="view.state.view === 'home'">
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

.app-shell__social-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-default);
  height: var(--size-default);
  border-radius: var(--radius-md);
  color: var(--color-icon-social);
  text-decoration: none;
  transition: color var(--dur-base) var(--ease-out);
}

.app-shell__social-link:hover {
  color: var(--color-text);
}

.app-shell__social-link :deep(svg) {
  width: var(--icon-md);
  height: var(--icon-md);
}

.app-shell__loading {
  max-width: var(--measure-page);
  margin: var(--space-6) auto 0;
  padding: 0 var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--text-body-size);
  line-height: var(--text-body-line);
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
