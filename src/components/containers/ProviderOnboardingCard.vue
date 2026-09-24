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
import { computed, onMounted, ref } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiSecretInput from '../../ui/UiSecretInput.vue'
import { useProvider } from '../../composables/useProvider'
import { usePreferences } from '../../composables/usePreferences'
import { useSecrets } from '../../composables/useSecrets'
import { useView } from '../../composables/useView'
import { useHardwareDetection } from '../../composables/useHardwareDetection'
import { detectHardware } from '../../adapters/hardware/detect'
import { defaultLocalProviderConfig } from '../../domain/provider'
import type { ProviderProbeResult } from '../../domain/provider'
import { fitTiers } from '../../domain/hardware'

const provider = useProvider()
const prefs = usePreferences()
const secrets = useSecrets()
const view = useView()
const hw = useHardwareDetection()

onMounted(() => {
  // Passive only: reuses whichever detection already ran (HardwareFitPanel in
  // Settings, HomeContainer's own trigger, or this card if it mounts first);
  // never a second independent scan.
  if (!hw.hasStarted()) void hw.run(() => detectHardware())
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

type Choice = 'cloud' | 'local' | null

/** An explicit click in this session always wins over the configured choice below. */
const manualChoice = ref<Choice>(null)

/** Reflects an ALREADY configured provider: local always counts (it only
 *  becomes 'local' through an explicit choice, here or in Settings); cloud
 *  counts only once a Jev key actually exists — the bare 'typesafe' default
 *  with no key is not a "choice" yet, just the inert starting config. */
const configuredChoice = computed<Choice>(() => {
  const c = provider.config.value
  if (c.kind === 'local') return 'local'
  if (c.kind === 'typesafe' && secrets.hasJevKey.value) return 'cloud'
  return null
})

const choice = computed<Choice>(() => manualChoice.value ?? configuredChoice.value)

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

// Condensed 3-line setup summary, kept in sync BY HAND with
// docs/local-providers.md, scripts/local-kev.mjs and LocalSetupGuide.vue (its
// own comment: "keep the four in sync" — this file is the fourth place).
const SETUP_SUMMARY = [
  'pnpm local:kev',
  'git clone https://github.com/jaredpalmer/kev.git && cd kev && uv sync --extra serve',
  'uv run --extra serve python -m kev.serve --run jaredpalmer/kev-0.8b --port 8009',
].join('\n')
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
    </div>

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

    <div v-if="choice === 'local'" class="provider-onboarding__panel" data-test="local-panel">
      <pre class="provider-onboarding__summary" data-test="local-setup-summary">{{ SETUP_SUMMARY }}</pre>
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
p,
pre {
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

/* Equal-size choice cards (user decisions 2026-09-24): a fixed 2-column grid
   with equal minmax(0, 1fr) tracks and align-items: stretch, so both cards
   share one width and one height regardless of which has more text; each
   card aligns its own content to the top (see .provider-onboarding__choice's
   align-content below) so a longer hardware-fit sentence never changes the
   card size. Stacks to one column on narrow viewports, same 40em breakpoint
   App.vue uses elsewhere for this kind of mobile stacking. */
.provider-onboarding__choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: var(--space-2);
}

@media (max-width: 40em) {
  .provider-onboarding__choices {
    grid-template-columns: 1fr;
  }
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

.provider-onboarding__panel {
  display: grid;
  gap: var(--space-2h);
  padding-top: var(--space-2h);
  border-top: var(--line-thin) solid var(--color-border);
}

.provider-onboarding__summary {
  padding: var(--space-2);
  overflow-x: auto;
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  white-space: pre;
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
