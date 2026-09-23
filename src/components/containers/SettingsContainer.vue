<script setup lang="ts">
// The Settings screen (SPEC §2.1, §6.1, §6.2): wires the in-memory secrets and
// the persisted preferences to the presentational pieces below it. It is also
// "a full view while in the 'Keys required' state" (§6.1), so it owns the
// banner, both key fields, the preferences form, the danger-zone actions and
// the About / credits block.
import { onBeforeUnmount, ref, watch } from 'vue'
import UiSecretInput from '../../ui/UiSecretInput.vue'
import UiButton from '../../ui/UiButton.vue'
import UiDialog from '../../ui/UiDialog.vue'
import { applyTheme } from '../../ui/theme'
import KeysRequiredBanner from '../ui/KeysRequiredBanner.vue'
import KeyStatus from '../ui/KeyStatus.vue'
import PreferencesForm from '../ui/PreferencesForm.vue'
import { useSecrets } from '../../composables/useSecrets'
import { usePreferences } from '../../composables/usePreferences'
import { useAnalyses } from '../../composables/useAnalyses'
import { useProvider } from '../../composables/useProvider'

const ABOUT_TEXT =
  'local-issue-classifier is MIT-licensed. The UI icons are original line icons and the logo ' +
  'and illustration are original pixel art (MIT). Fonts: Geist, Geist Mono and Geist Pixel, ' +
  'under the SIL Open Font License 1.1. Full notices in THIRD_PARTY_NOTICES.md.'

const secrets = useSecrets()
const prefs = usePreferences()
const analyses = useAnalyses()
const provider = useProvider()

const clearAllOpen = ref(false)

function onClearAllConfirm(): void {
  analyses.clearAll()
  secrets.clearKeys()
  clearAllOpen.value = false
}

// Applies the resolved theme (§10.2) whenever the preference changes, so
// Settings keeps `<html data-theme>` in sync while it is mounted.
let stopTheme: (() => void) | null = null
watch(
  () => prefs.state.theme,
  (theme) => {
    stopTheme?.()
    stopTheme = applyTheme(theme, {
      root: document.documentElement,
      matchMedia: (query) => window.matchMedia(query),
    })
  },
  { immediate: true },
)
onBeforeUnmount(() => stopTheme?.())
</script>

<template>
  <div class="settings">
    <header class="settings__header">
      <h1 class="settings__title">Settings</h1>
      <KeyStatus :jev-key-set="secrets.hasJevKey.value" :github-token-set="secrets.hasGitHubToken.value" />
    </header>

    <KeysRequiredBanner
      v-if="!provider.ready.value && !prefs.state.keysBannerDismissed"
      @dismiss="prefs.dismissKeysBanner()"
    />

    <section class="settings__section">
      <div class="settings__aside">
        <h2 class="settings__heading u-micro">Keys</h2>
        <p class="settings__lede">Kept in memory only and cleared when the page reloads.</p>
      </div>
      <div class="settings__body">

      <div data-test="jev-key-field">
        <UiSecretInput
          label="Jev API key"
          placeholder="sk-…"
          :model-value="secrets.state.jevApiKey"
          @update:model-value="secrets.setJevKey($event)"
        >
          <template #help>
            <p>
              Create a key in the TypeSafe console dashboard, then paste it here. It is required
              to classify issues, and is kept in memory only.
            </p>
            <a href="README.md#getting-a-jev-api-key">Full steps in the README</a>
          </template>
        </UiSecretInput>
      </div>

      <div data-test="github-token-field">
        <UiSecretInput
          label="GitHub personal access token"
          placeholder="ghp_… or github_pat_…"
          :model-value="secrets.state.githubToken"
          @update:model-value="secrets.setGitHubToken($event)"
        >
          <template #help>
            <p>
              Optional. Raises the GitHub rate limit from 60 to 5 000 requests/hour and lets you
              fetch comments and private repositories. Kept in memory only.
            </p>
            <a href="README.md#getting-a-github-token">Full steps in the README</a>
          </template>
        </UiSecretInput>
      </div>

      <p class="settings__notice">
        Issue content of the repositories you classify is sent to TypeSafe AI. Neither key is
        ever saved to disk — only non-secret preferences and your saved analyses live in this
        browser's storage.
      </p>

      <div class="settings__actions">
        <UiButton data-test="clear-keys" variant="secondary" @click="secrets.clearKeys()">Clear keys</UiButton>
      </div>
      </div>
    </section>

    <section class="settings__section">
      <div class="settings__aside">
        <h2 class="settings__heading u-micro">Preferences</h2>
        <p class="settings__lede">Saved in this browser. They seed new analyses.</p>
      </div>
      <div class="settings__body">
        <PreferencesForm :model-value="prefs.state" @update:model-value="prefs.update($event)" />
      </div>
    </section>

    <section class="settings__section settings__section--danger">
      <div class="settings__aside">
        <h2 class="settings__heading u-micro">Local data</h2>
        <p class="settings__lede">Every saved analysis and preference in this browser.</p>
      </div>
      <div class="settings__body">
        <div class="settings__danger">
          <p>Removes all saved analyses and preferences, and clears your keys. This cannot be undone.</p>
          <UiButton data-test="clear-all" variant="danger" @click="clearAllOpen = true">
            Clear all local data
          </UiButton>
        </div>
      </div>
    </section>

    <UiDialog
      :open="clearAllOpen"
      title="Clear all local data"
      description="This removes every saved analysis and preference from this browser, and clears your in-memory keys. This cannot be undone."
      confirm-phrase="delete"
      confirm-label="Clear all data"
      @close="clearAllOpen = false"
      @confirm="onClearAllConfirm"
    />

    <section class="settings__section settings__about" data-test="about">
      <div class="settings__aside">
        <h2 class="settings__heading u-micro">About</h2>
      </div>
      <div class="settings__body">
        <p>{{ ABOUT_TEXT }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  gap: var(--space-4);
  max-width: var(--measure-page);
  margin: 0 auto;
  padding: var(--space-5) var(--space-4) var(--space-6);
}

.settings__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
}

.settings__title {
  margin: 0;
  font-size: var(--text-h2-size);
  line-height: var(--text-h2-line);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-tight);
}

/* Two-column rows: a kicker and one line on the left, the controls on the right. */
.settings__section {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2.4fr);
  gap: var(--space-3) var(--space-5);
  padding-top: var(--space-4);
  border-top: var(--line-thin) solid var(--color-border);
}

.settings__aside {
  display: grid;
  align-content: start;
  gap: var(--space-1);
}

.settings__heading {
  margin: 0;
}

.settings__lede {
  margin: 0;
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.settings__body {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}

.settings__actions {
  display: flex;
  gap: var(--space-2);
}

.settings__notice {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.settings__danger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2h);
  padding: var(--space-2h) var(--space-3);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
}

.settings__danger p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}

.settings__about p {
  margin: 0;
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

@media (max-width: 48em) {
  .settings__section {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
