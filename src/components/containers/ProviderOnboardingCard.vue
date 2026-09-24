<script setup lang="ts">
// Home provider-onboarding card (PoC, odd/tasks/home-provider-onboarding.md):
// surfaces the classifier-provider choice ("Use Jev in the cloud" vs "Run a
// model locally") on Home, not only in Settings, together with the
// hardware-fit result and a compact local-setup summary, so a first-time
// user decides where the AI runs before loading a repo.
//
// Secondary/informational card — same pattern as SaveFailedNotice and
// OnboardingChecklist: it uses only secondary/ghost buttons. RepoInput inside
// RepoLoaderContainer stays Home's one primary action (see HomeContainer.vue's
// own comment); nothing here uses the `primary` button variant.
//
// The hardware-fit line reuses the passive, module-scope detection cache in
// useHardwareDetection() (shared with Settings' HardwareFitPanel and Home's
// HardwareSummaryPanel), so no second independent scan or benchmark ever runs.
//
// Layout change (user decisions 2026-09-24):
// - The "Your computer" hardware box moved out of this card into its own
//   sibling component, HardwareSummaryPanel.vue, rendered by HomeContainer
//   next to this card. This file keeps only the hardware-FIT LINE inside the
//   "On this computer" choice, which still needs the same cached report.
// - The card is no longer dismissible ("Not now" removed): it is the one
//   place to choose/see the provider, so it always stays on Home, and once a
//   provider is configured it reflects that as the active choice below.
//
// In-browser inference (docs/browser-inference.md): a third choice, "In this
// browser", appears only where WebGPU is available; the slow WASM fallback is
// offered in Settings only.
//
// Local-runtime gating (bugfix, 2026-09-24): whether "On this computer"
// renders at all is now `useRuntime().isLocal`, not the old `isDev`-only
// check, which incorrectly showed the "hosted page" hint even on a plain
// localhost dev server (see domain/runtime.ts, useRuntime.ts). In a genuinely
// hosted deployment the local card is not just hint-adjusted, it is removed
// entirely (`v-if`, no placeholder) — Kev/JevK5 stay reachable from Settings'
// ProviderSelector, which keeps every provider option regardless of runtime.
// `.provider-onboarding__choices` is an `auto-fit` grid so however many
// cards render (cloud always, local only in local mode, browser only with
// WebGPU: 1 to 3) always share the full width in equal columns, with no
// empty slot.
import { computed, onMounted, ref } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiSecretInput from '../../ui/UiSecretInput.vue'
import UiSegmented from '../../ui/UiSegmented.vue'
import UiCallout from '../../ui/UiCallout.vue'
import CopyCommandLine from '../ui/CopyCommandLine.vue'
import BrowserModelPanel from '../ui/BrowserModelPanel.vue'
import { useProvider } from '../../composables/useProvider'
import { usePreferences } from '../../composables/usePreferences'
import { useSecrets } from '../../composables/useSecrets'
import { useView } from '../../composables/useView'
import { useHardwareDetection } from '../../composables/useHardwareDetection'
import { useRuntime } from '../../composables/useRuntime'
import { detectHardware } from '../../adapters/hardware/detect'
import { BROWSER_MODELS, defaultBrowserProviderConfig, defaultLocalProviderConfig, findBrowserModel } from '../../domain/provider'
import type { ProviderProbeResult } from '../../domain/provider'
import { fitTiers, LOCAL_TIERS } from '../../domain/hardware'
import type { TierId, TierVerdict } from '../../domain/hardware'
import {
  KEV_GPU_OPTIONAL_NOTE,
  KEV_OS_OPTIONS,
  KEV_PREREQS_NOTE,
  KEV_UNSUPPORTED_NOTE,
  detectOs,
  kevCommands,
} from '../../domain/localCommands'
import type { KevCommandStep, KevOs } from '../../domain/localCommands'

const props = defineProps<{
  /** Test override for useRuntime's `dev` check; defaults to import.meta.env.DEV. */
  isDev?: boolean
  /** Test override for useRuntime's `hostname` check; defaults to location.hostname. */
  hostname?: string
  /** Test override for the OS toggle's initial value; defaults to detectOs(navigator). */
  initialOs?: KevOs
}>()

const provider = useProvider()
const prefs = usePreferences()
const secrets = useSecrets()
const view = useView()
const hw = useHardwareDetection()
const runtime = useRuntime({ dev: props.isDev, hostname: props.hostname })

onMounted(() => {
  // Passive only: reuses whichever detection already ran (HardwareFitPanel in
  // Settings, HomeContainer's own trigger, or this card if it mounts first);
  // never a second independent scan.
  if (!hw.hasStarted()) void hw.run(() => detectHardware())
  void provider.checkBrowserSupport()
})

const webgpu = computed(() => provider.browserStatus.support === 'webgpu')
const browserModel = computed(() => {
  const c = provider.config.value
  return (c.kind === 'browser' ? findBrowserModel(c.modelId) : null) ?? BROWSER_MODELS[0]
})

const fit = computed(() => (hw.report.value ? fitTiers(hw.report.value) : null))

const gpuLabel = computed(() => {
  const gpu = hw.report.value?.gpu
  if (!gpu) return ''
  if (gpu.model) return gpu.model
  return gpu.vendor === 'unknown' ? 'Unknown GPU' : `${gpu.vendor} GPU`
})

/** Derived from the same FitResult HardwareFitPanel shows — never a hardcoded example. */
const fitLine = computed(() => {
  const f = fit.value
  if (!f) return 'Checking this machine…'
  if (f.recommendation.tier === 'cloud') {
    return f.memory.availableGb === null
      ? 'Hardware not detected yet — cloud works on any machine.'
      : 'No suitable GPU detected here — cloud is recommended.'
  }
  const tier = f.tiers.find((t) => t.id === f.recommendation.tier)
  const mem = f.memory.availableGb !== null ? ` (${f.memory.lowerBound ? '≥ ' : ''}${f.memory.availableGb} GB)` : ''
  return `Your ${gpuLabel.value}${mem} fits ${tier?.label ?? 'a local model'}.`
})

type Choice = 'cloud' | 'local' | 'browser' | null

/** An explicit click in this session always wins over the configured choice below. */
const manualChoice = ref<Choice>(null)

/** Reflects an ALREADY configured provider: local always counts (it only
 *  becomes 'local' through an explicit choice, here or in Settings); cloud
 *  counts only once a Jev key actually exists — the bare 'typesafe' default
 *  with no key is not a "choice" yet, just the inert starting config. */
const configuredChoice = computed<Choice>(() => {
  const c = provider.config.value
  if (c.kind === 'local') return 'local'
  if (c.kind === 'browser') return 'browser'
  if (c.kind === 'typesafe' && secrets.hasJevKey.value) return 'cloud'
  return null
})

const choice = computed<Choice>(() => manualChoice.value ?? configuredChoice.value)
/** The local panel needs both the choice AND the card to still be offered —
 *  in hosted mode it never renders, even for an already-configured local
 *  provider from an earlier local session (see the file header). */
const showLocalPanel = computed(() => choice.value === 'local' && runtime.isLocal.value)

function chooseCloud(): void {
  manualChoice.value = 'cloud'
}

/** docs/hardware-fit.md's recommendation, applied unconditionally to the Kev
 *  preset (LOCAL_PRESETS[0]) — the same preset SettingsContainer's "Use Kev
 *  locally" applies. */
function chooseLocal(): void {
  manualChoice.value = 'local'
  prefs.update({ provider: defaultLocalProviderConfig() })
}

/** The in-browser model; the download itself starts from the panel below. */
function chooseBrowser(): void {
  manualChoice.value = 'browser'
  if (provider.config.value.kind !== 'browser') prefs.update({ provider: defaultBrowserProviderConfig() })
}

function openSettings(): void {
  view.openSettings()
}

const checking = ref(false)
const probeResult = ref<ProviderProbeResult | null>(null)

async function testConnection(): Promise<void> {
  checking.value = true
  probeResult.value = null
  try {
    probeResult.value = await provider.probe()
  } catch {
    probeResult.value = { status: 'unreachable', models: null }
  } finally {
    checking.value = false
  }
}

const PROBE_TEXT: Record<ProviderProbeResult['status'], string> = {
  direct: 'Connected — the server answered directly.',
  proxied: 'Connected through the local dev proxy.',
  unreachable: 'Could not reach the server yet.',
}

// Condensed setup summary. The commands themselves come from
// domain/localCommands.ts's kevCommands() — the same function
// LocalSetupGuide.vue uses — so this card can no longer drift from the full
// guide the way it previously did. docs/local-providers.md documents the
// same commands. Only the CUDA step stays Settings-only (LocalSetupGuide):
// this summary never mentions the GPU-acceleration install itself, only the
// GPU-optional callout below.
const KEV_MODEL_LABEL: Record<string, string> = Object.fromEntries(LOCAL_TIERS.map((t) => [t.id, t.label]))
const DEFAULT_PORT = 8009 // LOCAL_PRESETS[0] (Kev), src/domain/provider.ts
const PROJECT_FOLDER_COMMAND = 'cd local-issue-classifier'

/** `pnpm local:kev` (and the project-folder step before it) only make sense
 *  from this repo's own dev server, not a hosted or statically-served build. */
const isDevMode = computed(() => runtime.dev)

const os = ref<KevOs>(props.initialOs ?? detectOs(navigator))

function fits(verdict: TierVerdict | undefined): boolean {
  return verdict?.verdict === 'ok' || verdict?.verdict === 'tight'
}

/** The largest Kev tier that fits the detected hardware; kev-0.8b (smallest)
 *  when nothing bigger fits, or when hardware detection is unknown. */
const recommendedModel = computed<{ id: TierId; unknown: boolean }>(() => {
  const f = fit.value
  const tier = (id: TierId) => f?.tiers.find((t) => t.id === id)
  if (fits(tier('kev-9b'))) return { id: 'kev-9b', unknown: false }
  if (fits(tier('kev-4b'))) return { id: 'kev-4b', unknown: false }
  return { id: 'kev-0.8b', unknown: f === null || f.memory.availableGb === null }
})

const recommendedLine = computed(() => {
  const { id, unknown } = recommendedModel.value
  const label = KEV_MODEL_LABEL[id] ?? id
  return unknown ? `Recommended for your GPU: ${label} (smallest; detection unknown)` : `Recommended for your GPU: ${label}`
})

/** Only the lines this condensed summary shows; the full CUDA step stays in
 *  Settings' LocalSetupGuide. A synthetic "From the project folder" step
 *  precedes the shortcut in dev mode (the shortcut only works when actually
 *  run from this repo's checkout). */
const summarySteps = computed<KevCommandStep[]>(() => {
  const shown = new Set(['clone', 'cd', 'sync', 'serve', 'shortcut'])
  const steps = kevCommands({
    model: recommendedModel.value.id,
    port: DEFAULT_PORT,
    os: os.value,
    shortcut: isDevMode.value,
  }).filter((step) => shown.has(step.id))
  if (!isDevMode.value) return steps

  const shortcutIndex = steps.findIndex((step) => step.id === 'shortcut')
  const withProjectFolder = [...steps]
  withProjectFolder.splice(shortcutIndex, 0, {
    id: 'project-folder',
    label: 'From the project folder',
    command: PROJECT_FOLDER_COMMAND,
  })
  return withProjectFolder
})
</script>

<template>
  <section
    class="provider-onboarding"
    data-test="provider-onboarding-card"
    aria-labelledby="provider-onboarding-title"
  >
    <header class="provider-onboarding__header">
      <h2 id="provider-onboarding-title" class="provider-onboarding__title">Where should the AI run?</h2>
    </header>

    <div class="provider-onboarding__choices">
      <button
        type="button"
        class="provider-onboarding__choice"
        :class="{ 'provider-onboarding__choice--active': choice === 'cloud' }"
        data-test="choice-cloud"
        @click="chooseCloud"
      >
        <span class="provider-onboarding__choice-title">Cloud (Jev by TypeSafe)</span>
        <span class="provider-onboarding__choice-desc">Needs an API key. About 3s for 20 issues.</span>
      </button>
      <button
        v-if="runtime.isLocal.value"
        type="button"
        class="provider-onboarding__choice"
        :class="{ 'provider-onboarding__choice--active': choice === 'local' }"
        data-test="choice-local"
        @click="chooseLocal"
      >
        <span class="provider-onboarding__choice-title">On this computer</span>
        <span class="provider-onboarding__choice-desc">Free, private. Needs a GPU.</span>
        <span class="provider-onboarding__fit" data-test="hardware-fit-line">{{ fitLine }}</span>
      </button>
      <button
        v-if="webgpu"
        type="button"
        class="provider-onboarding__choice"
        :class="{ 'provider-onboarding__choice--active': choice === 'browser' }"
        data-test="choice-browser"
        @click="chooseBrowser"
      >
        <span class="provider-onboarding__choice-title">In this browser (experimental)</span>
        <span class="provider-onboarding__choice-desc">No install, no key. One-time model download; placeholder answers for now.</span>
      </button>
    </div>

    <p v-if="!runtime.isLocal.value" class="provider-onboarding__note" data-test="local-in-settings-hint">
      Have a Kev/JevK5 server on your machine?
      <button type="button" class="provider-onboarding__link" @click="openSettings">Configure it in Settings</button>
    </p>

    <div v-if="choice === 'cloud'" class="provider-onboarding__panel" data-test="cloud-panel">
      <div data-test="jev-key-field">
        <UiSecretInput
          label="Jev API key"
          placeholder="sk-…"
          :model-value="secrets.state.jevApiKey"
          @update:model-value="secrets.setJevKey($event)"
        />
      </div>
      <UiButton data-test="open-settings-cloud" variant="ghost" size="compact" @click="openSettings">
        More in Settings
      </UiButton>
    </div>

    <div v-if="choice === 'browser'" class="provider-onboarding__panel" data-test="browser-panel">
      <BrowserModelPanel
        :model="browserModel"
        :state="provider.browserStatus"
        @download="provider.downloadBrowserModel()"
        @remove="provider.removeBrowserModel()"
      />
      <UiButton data-test="open-settings-browser" variant="ghost" size="compact" @click="openSettings">
        More in Settings
      </UiButton>
    </div>

    <div v-if="showLocalPanel" class="provider-onboarding__panel" data-test="local-panel">
      <div class="provider-onboarding__callouts">
        <UiCallout tone="warning" title="Prerequisites" data-test="callout-prereqs">{{ KEV_PREREQS_NOTE }}</UiCallout>
        <UiCallout tone="warning" title="GPU is optional" data-test="callout-gpu-optional">{{ KEV_GPU_OPTIONAL_NOTE }}</UiCallout>
        <UiCallout tone="danger" title="Won't work" data-test="callout-unsupported">{{ KEV_UNSUPPORTED_NOTE }}</UiCallout>
      </div>
      <div class="provider-onboarding__summary" data-test="local-setup-summary">
        <p class="provider-onboarding__recommend" data-test="recommended-model-line">{{ recommendedLine }}</p>
        <UiSegmented label="Operating system" size="compact" :options="KEV_OS_OPTIONS" v-model="os" />
        <div v-for="step in summarySteps" :key="step.id" class="provider-onboarding__command-step">
          <p class="provider-onboarding__command-label">{{ step.label }}</p>
          <CopyCommandLine v-if="step.command" :id="step.id" :command="step.command" />
          <p v-if="step.note" class="provider-onboarding__note">{{ step.note }}</p>
        </div>
      </div>
      <div class="provider-onboarding__test">
        <UiButton data-test="test-connection" :loading="checking" @click="testConnection">Test connection</UiButton>
        <p v-if="checking || probeResult" role="status" class="provider-onboarding__status" data-test="probe-status">
          {{ checking ? 'Checking…' : probeResult ? PROBE_TEXT[probeResult.status] : '' }}
        </p>
      </div>
      <UiButton data-test="open-settings-local" variant="ghost" size="compact" @click="openSettings">
        Full guide in Settings
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
p {
  margin: 0;
}

.provider-onboarding {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
}

.provider-onboarding__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.provider-onboarding__title {
  margin: 0;
  font-size: var(--text-h3-size);
  font-weight: var(--weight-medium);
}

/* Equal-size choice cards (user decisions 2026-09-24; widened 2026-09-24 for
   the third, in-browser card): `auto-fit` with a `14rem` minimum means
   however many cards render — cloud always, local in local mode, browser
   with WebGPU, so 1 to 3 — they always share the full row in
   equal `1fr` columns, with no empty slot and no overflow, wrapping to
   fewer columns as the viewport narrows instead of a fixed breakpoint. */
.provider-onboarding__choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  align-items: stretch;
  gap: var(--space-2);
}

.provider-onboarding__choice {
  display: grid;
  align-content: start;
  gap: var(--space-1);
  justify-items: start;
  padding: var(--space-2h);
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
  text-align: left;
  font: inherit;
  color: var(--color-text);
  cursor: pointer;
  transition:
    background-color var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease-out);
}

.provider-onboarding__choice:hover {
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
}

.provider-onboarding__choice--active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.provider-onboarding__choice-title {
  font-size: var(--text-table-size);
  font-weight: var(--weight-medium);
}

.provider-onboarding__choice-desc,
.provider-onboarding__fit {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.provider-onboarding__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
}

.provider-onboarding__panel {
  display: grid;
  gap: var(--space-2h);
  padding-top: var(--space-2h);
  border-top: var(--line-thin) solid var(--color-border);
}

.provider-onboarding__callouts {
  display: grid;
  gap: var(--space-2);
}

.provider-onboarding__summary {
  display: grid;
  gap: var(--space-2);
}

.provider-onboarding__recommend {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.provider-onboarding__command-step {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.provider-onboarding__command-label {
  font-size: var(--text-caption-size);
  font-weight: var(--weight-medium);
}

.provider-onboarding__note {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.provider-onboarding__test {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.provider-onboarding__status {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}
</style>
