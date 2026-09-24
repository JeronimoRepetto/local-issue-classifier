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
// useHardwareDetection() (shared with Settings' HardwareFitPanel), so no
// second independent scan or benchmark ever runs.
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
import type { TierVerdictKind } from '../../domain/hardware'

const provider = useProvider()
const prefs = usePreferences()
const secrets = useSecrets()
const view = useView()
const hw = useHardwareDetection()

onMounted(() => {
  // Passive only: reuses whichever detection already ran (HardwareFitPanel in
  // Settings, or this card if it mounts first); never a second independent scan.
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
const choice = ref<Choice>(null)

function chooseCloud(): void {
  choice.value = 'cloud'
}

/** docs/hardware-fit.md's recommendation, applied unconditionally to the Kev
 *  preset (LOCAL_PRESETS[0]) — the same preset SettingsContainer's "Use Kev
 *  locally" applies. */
function chooseLocal(): void {
  choice.value = 'local'
  prefs.update({ provider: defaultLocalProviderConfig() })
}

function openSettings(): void {
  view.openSettings()
}

// "Your computer" box (Home, requested after the provider-card approval):
// makes the same passive fitTiers() verdict HardwareFitPanel shows in
// Settings visible on Home too, as a compact secondary box — never a second
// detection run, always the shared useHardwareDetection() cache above.
const hwDetecting = computed(() => hw.report.value === null)

const hwBoxGpu = computed(() => {
  const gpu = hw.report.value?.gpu
  if (!gpu) return ''
  if (!gpu.model) return 'Unknown GPU — set it in Settings'
  return gpu.vramGb !== null ? `${gpu.model} · ${gpu.vramGb} GB` : gpu.model
})

const hwBoxRam = computed(() => {
  const report = hw.report.value
  if (!report || report.ramGb === null) return 'RAM: unknown'
  return `${report.ramIsLowerBound ? '≥ ' : ''}${report.ramGb} GB RAM`
})

const hwBoxCpu = computed(() => {
  const threads = hw.report.value?.cpuThreads
  return threads === null || threads === undefined ? 'CPU: unknown' : `${threads} CPU threads`
})

// Same short verdict labels as HardwareFitPanel.vue's VERDICT_TEXT; duplicated
// (rather than imported from there) since HardwareFitPanel belongs to a
// parallel lane in this worktree.
const HW_TIER_VERDICT_TEXT: Record<TierVerdictKind, string> = {
  ok: 'Fits',
  tight: 'Tight',
  no: "Won't fit",
  unknown: 'Unknown',
}

const hwBoxRecommendation = computed(() => {
  const f = fit.value
  if (!f) return ''
  const name = f.recommendation.tier === 'cloud' ? 'Cloud API' : (f.tiers.find((t) => t.id === f.recommendation.tier)?.label ?? '')
  return `Recommended: ${name}. ${f.recommendation.reason}`
})

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

function dismiss(): void {
  prefs.dismissHomeProviderCard()
}

const visible = computed(() => !(provider.ready.value && prefs.state.homeProviderCardDismissed))

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
    v-if="visible"
    class="provider-onboarding"
    data-test="provider-onboarding-card"
    aria-labelledby="provider-onboarding-title"
  >
    <header class="provider-onboarding__header">
      <h2 id="provider-onboarding-title" class="provider-onboarding__title">Where should the AI run?</h2>
      <UiButton data-test="dismiss" variant="ghost" size="compact" @click="dismiss">Not now</UiButton>
    </header>

    <div class="provider-onboarding__top">
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

      <aside
        class="provider-onboarding__hardware"
        data-test="hardware-box"
        aria-labelledby="hardware-box-title"
      >
        <h3 id="hardware-box-title" class="provider-onboarding__hardware-title">Your computer</h3>
        <p v-if="hwDetecting" class="provider-onboarding__muted" data-test="hardware-box-detecting" role="status">
          Detecting…
        </p>
        <template v-else>
          <dl class="provider-onboarding__hardware-facts">
            <div>
              <dt>GPU</dt>
              <dd data-test="hardware-box-gpu">{{ hwBoxGpu }}</dd>
            </div>
            <div>
              <dt>RAM</dt>
              <dd data-test="hardware-box-ram">{{ hwBoxRam }}</dd>
            </div>
            <div>
              <dt>CPU</dt>
              <dd data-test="hardware-box-cpu">{{ hwBoxCpu }}</dd>
            </div>
          </dl>
          <ul class="provider-onboarding__hardware-chips">
            <li
              v-for="tier in fit?.tiers ?? []"
              :key="tier.id"
              class="provider-onboarding__hardware-chip"
              :class="`provider-onboarding__hardware-chip--${tier.verdict}`"
              :data-test="`hardware-box-tier-${tier.id}`"
            >
              {{ tier.label }} · {{ HW_TIER_VERDICT_TEXT[tier.verdict] }}
            </li>
          </ul>
          <p class="provider-onboarding__hardware-recommendation" data-test="hardware-box-recommendation">
            {{ hwBoxRecommendation }}
          </p>
        </template>
        <UiButton
          data-test="hardware-box-settings-link"
          variant="ghost"
          size="compact"
          @click="openSettings"
        >
          Details in Settings
        </UiButton>
      </aside>
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

.provider-onboarding__top {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}

/* Third column on >= 1024 px: the two choice cards keep their own auto-fit
   layout at 2fr, the hardware box sits to the right at 1fr; below this it
   stacks (box last), per odd/tasks/local-issue-classifier-two-home-ui-additions. */
@media (min-width: 64em) {
  .provider-onboarding__top {
    grid-template-columns: 2fr 1fr;
    align-items: start;
  }
}

.provider-onboarding__choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-7) * 3), 1fr));
  gap: var(--space-2);
}

.provider-onboarding__hardware {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding: var(--space-2h);
  background: var(--color-surface-2);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
}

.provider-onboarding__hardware-title {
  margin: 0;
  font-size: var(--text-caption-size);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

.provider-onboarding__hardware-facts {
  display: grid;
  gap: var(--space-1);
  margin: 0;
}

.provider-onboarding__hardware-facts dt {
  display: none;
}

.provider-onboarding__hardware-facts dd {
  margin: 0;
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text);
}

.provider-onboarding__hardware-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.provider-onboarding__hardware-chip {
  padding: 0 var(--space-1);
  border: var(--line-thin) solid currentColor;
  border-radius: var(--radius-round);
  font-size: var(--text-micro-size);
  line-height: var(--text-caption-line);
  white-space: nowrap;
}

.provider-onboarding__hardware-chip--ok {
  color: var(--color-success);
}

.provider-onboarding__hardware-chip--tight {
  color: var(--color-warning);
}

.provider-onboarding__hardware-chip--no {
  color: var(--color-danger);
}

.provider-onboarding__hardware-chip--unknown {
  color: var(--color-text-muted);
}

.provider-onboarding__hardware-recommendation {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.provider-onboarding__hardware .ui-button {
  justify-self: start;
}

.provider-onboarding__choice {
  display: grid;
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

.provider-onboarding__status,
.provider-onboarding__muted {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}
</style>
