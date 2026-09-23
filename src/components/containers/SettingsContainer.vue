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

const ABOUT_TEXT =
  'issue-criticity is MIT-licensed. The logo, icons and illustrations are original pixel art ' +
  '(MIT). Fonts: Inter and Silkscreen, both under the SIL Open Font License 1.1. Full notices ' +
  'in THIRD_PARTY_NOTICES.md.'

const secrets = useSecrets()
const prefs = usePreferences()
const analyses = useAnalyses()

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
    <KeysRequiredBanner
      v-if="!secrets.hasJevKey.value && !prefs.state.keysBannerDismissed"
      @dismiss="prefs.dismissKeysBanner()"
    />

    <KeyStatus :jev-key-set="secrets.hasJevKey.value" :github-token-set="secrets.hasGitHubToken.value" />

    <section class="settings__section">
      <h2 class="settings__heading">Keys</h2>

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

      <UiButton data-test="clear-keys" variant="secondary" @click="secrets.clearKeys()">Clear keys</UiButton>
    </section>

    <section class="settings__section">
      <h2 class="settings__heading">Preferences</h2>
      <PreferencesForm :model-value="prefs.state" @update:model-value="prefs.update($event)" />
    </section>

    <section class="settings__section settings__section--danger">
      <h2 class="settings__heading">Local data</h2>
      <UiButton data-test="clear-all" variant="secondary" @click="clearAllOpen = true">
        Clear all local data
      </UiButton>
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

    <section class="settings__section settings__about">
      <h2 class="settings__heading">About</h2>
      <p>{{ ABOUT_TEXT }}</p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  gap: var(--space-4);
  max-width: var(--measure-dialog);
}

.settings__section {
  display: grid;
  gap: var(--space-3);
}

.settings__heading {
  margin: 0;
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
}

.settings__notice {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.settings__about p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}
</style>
