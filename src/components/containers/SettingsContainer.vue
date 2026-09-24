<script setup lang="ts">
// The Settings screen: wires the in-memory secrets and
// the persisted preferences to the presentational pieces below it. It is also
// "a full view while in the 'Keys required' state" (§6.1), so it owns the
// banner, both key fields, the preferences form, the danger-zone actions and
// the About / credits block.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiSecretInput from '../../ui/UiSecretInput.vue'
import UiButton from '../../ui/UiButton.vue'
import UiDialog from '../../ui/UiDialog.vue'
import { applyTheme } from '../../ui/theme'
import KeysRequiredBanner from '../ui/KeysRequiredBanner.vue'
import KeyStatus from '../ui/KeyStatus.vue'
import PreferencesForm from '../ui/PreferencesForm.vue'
import ProviderSelector from '../ui/ProviderSelector.vue'
import HardwareFitPanel from '../ui/HardwareFitPanel.vue'
import SecretsPersistenceToggle from '../ui/SecretsPersistenceToggle.vue'
import { useSecrets } from '../../composables/useSecrets'
import { useSecretsPersistence } from '../../composables/useSecrets'
import { usePreferences } from '../../composables/usePreferences'
import { useAnalyses } from '../../composables/useAnalyses'
import { useProvider } from '../../composables/useProvider'
import { detectHardware } from '../../adapters/hardware/detect'
import { defaultLocalProviderConfig, findPreset, providerLabel } from '../../domain/provider'
import { sanitizeLocalMaxStateTokens } from '../../domain/providerBatching'
import type { ProviderConfig } from '../../domain/provider'

const ABOUT_TEXT =
  'local-issue-classifier is MIT-licensed. The UI icons are original line icons and the logo ' +
  'and illustration are original pixel art (MIT). Fonts: Geist, Geist Mono and Geist Pixel, ' +
  'under the SIL Open Font License 1.1. Full notices in THIRD_PARTY_NOTICES.md. Visual ' +
  "direction and the browser-side hardware detection approach are inspired by midudev's " +
  'canirun.ai; see the README for the full acknowledgements.'

const secrets = useSecrets()
const { level: secretsLevel, forget: forgetKeys } = useSecretsPersistence()
const prefs = usePreferences()
const analyses = useAnalyses()
const provider = useProvider()

const clearAllOpen = ref(false)

function onClearAllConfirm(): void {
  // Preferences are cleared synchronously; the database finishes in the background.
  void analyses.clearAll()
  secrets.clearKeys()
  clearAllOpen.value = false
}

// Whether the browser may evict saved analyses under storage pressure. The
// request itself (navigator.storage.persist) happens once, on the first save.
onMounted(() => {
  void analyses.checkPersistence()
  // In-browser model (docs/browser-inference.md): passive checks only, no download.
  void provider.checkBrowserSupport()
  void provider.refreshBrowserCache()
})

const downloadedModelMb = computed(() => {
  const bytes = provider.browserStatus.cachedBytes ?? 0
  return bytes > 0 ? Math.round(bytes / 1e6) : null
})
const PERSISTENCE_TEXT = {
  unknown: 'Persistent storage: checking…',
  persisted: 'Persistent storage: on. The browser will not clear saved analyses to free up space.',
  'best-effort':
    'Persistent storage: not granted. The browser may clear saved analyses when the disk runs low; export anything you need to keep.',
  unsupported:
    'Persistent storage: not supported by this browser. Saved analyses may be cleared when the disk runs low.',
} as const
const persistenceText = computed(() => PERSISTENCE_TEXT[analyses.state.persistence])

// T16, WIRE-2: which server classifies, and, for a local one, its live status
// (useProvider().localStatus, checked automatically; docs/local-providers.md).

/** Switching to a local server (or one of its presets) checks it at once; typing a custom URL waits for "Test connection". */
function onProviderChange(value: ProviderConfig): void {
  const wasLocal = prefs.state.provider.kind === 'local'
  prefs.update({ provider: value })
  if (value.kind === 'local' && (!wasLocal || findPreset(value))) void provider.autoProbe({ presets: false })
}

/** docs/hardware-fit.md's recommendation, applied unconditionally to the Kev preset (LOCAL_PRESETS[0]). */
function applyKevPreset(): void {
  prefs.update({ provider: defaultLocalProviderConfig() })
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
            <ol class="settings__help-steps">
              <li>Sign in to the TypeSafe console at <code>console.typesafe.ai/keys</code>.</li>
              <li>Create a new key.</li>
              <li>Paste it above. It is kept in memory only.</li>
            </ol>
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
            <ol class="settings__help-steps">
              <li>
                On GitHub, open
                <strong>Settings → Developer settings → Personal access tokens → Fine-grained tokens</strong>.
              </li>
              <li>Click <strong>Generate new token</strong> and choose the repository access you need.</li>
              <li>
                Under <strong>Permissions</strong>, set <strong>Issues</strong> to Read-only and
                <strong>Contents</strong> to Read-only — Metadata read-only is added automatically.
              </li>
              <li>Generate the token and copy it. GitHub shows it once.</li>
              <li>Paste it above.</li>
            </ol>
            <a href="README.md#getting-a-github-token">Full steps in the README</a>
          </template>
        </UiSecretInput>
      </div>

      <SecretsPersistenceToggle v-model="secretsLevel" @forget="forgetKeys()" />

      <p class="settings__notice">
        Issue content of the repositories you classify is sent to TypeSafe AI. Neither key is
        ever saved to disk — only non-secret preferences and your saved analyses live in this
        browser's storage.
      </p>
      </div>
    </section>

    <section class="settings__section" data-test="classifier">
      <div class="settings__aside">
        <h2 class="settings__heading u-micro">Classifier</h2>
        <p class="settings__lede" data-test="provider-label">{{ providerLabel(prefs.state.provider) }}</p>
        <p v-if="provider.isLocal.value" class="settings__lede" data-test="provider-status-chip">
          {{ provider.localStatus.value.text }}
        </p>
      </div>
      <div class="settings__body">
        <ProviderSelector
          :model-value="prefs.state.provider"
          :api-key="secrets.state.localApiKey"
          :classify-mode="prefs.state.classifyMode"
          :trimming-floor="prefs.state.trimmingFloor"
          :local-max-state-tokens="prefs.state.localMaxStateTokens"
          :probe="provider.probe"
          :live-status="provider.localStatus.value.text"
          :browser="provider.browserStatus"
          @update:model-value="onProviderChange"
          @download-model="provider.downloadBrowserModel()"
          @remove-model="provider.removeBrowserModel()"
          @update:api-key="secrets.setLocalApiKey($event)"
          @update:classify-mode="prefs.update({ classifyMode: $event })"
          @update:trimming-floor="prefs.update({ trimmingFloor: $event })"
          @update:local-max-state-tokens="prefs.update({ localMaxStateTokens: sanitizeLocalMaxStateTokens($event) })"
        />
      </div>
    </section>

    <section class="settings__section" data-test="hardware-fit-section">
      <div class="settings__aside">
        <h2 class="settings__heading u-micro">Hardware</h2>
        <p class="settings__lede">Local models run on your own machine; nothing is sent.</p>
      </div>
      <div class="settings__body">
        <HardwareFitPanel
          :detect="() => detectHardware()"
          :override="prefs.state.hardwareOverride ?? null"
          @update:override="prefs.setHardwareOverride"
        />
        <div class="settings__hardware-actions">
          <UiButton data-test="use-kev-locally" variant="secondary" size="compact" @click="applyKevPreset">
            Use Kev locally
          </UiButton>
          <a data-test="local-providers-link" href="docs/local-providers.md">
            See the launch command for your recommended tier
          </a>
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
        <p class="settings__persistence" data-test="storage-persistence">{{ persistenceText }}</p>
        <div v-if="downloadedModelMb !== null" class="settings__model" data-test="downloaded-model">
          <p>Downloaded model: {{ downloadedModelMb }} MB (in-browser classifier, kept in the browser cache).</p>
          <UiButton data-test="remove-downloaded-model" variant="ghost" size="compact" @click="provider.removeBrowserModel()">
            Remove
          </UiButton>
        </div>
        <div class="settings__danger">
          <p>
            Removes all saved analyses (this browser's local database) and preferences, and clears your keys. This
            cannot be undone.
          </p>
          <UiButton data-test="clear-all" variant="danger" @click="clearAllOpen = true">
            Clear all local data
          </UiButton>
        </div>
      </div>
    </section>

    <UiDialog
      :open="clearAllOpen"
      title="Clear all local data"
      description="This removes every saved analysis (the browser's local database) and preference from this browser, and clears your in-memory keys. This cannot be undone."
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

.settings__help-steps {
  display: grid;
  gap: var(--space-1);
  margin: 0 0 var(--space-2);
  padding-left: var(--space-4);
}

.settings__hardware-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.settings__hardware-actions a {
  color: var(--color-accent);
  font-size: var(--text-caption-size);
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

.settings__persistence {
  margin: 0 0 var(--space-2h);
  color: var(--color-text-muted);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}

.settings__model {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: 0 0 var(--space-2h);
}

.settings__model p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
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
