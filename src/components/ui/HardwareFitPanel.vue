<script lang="ts">
import { ref } from 'vue'
import { unknownHardwareReport } from '../../domain/hardware'
import type { HardwareReport } from '../../domain/hardware'

// Detection runs once per page load (morning-feedback FB-1): this module
// scope is shared by every mount of the component, so navigating away from
// Settings and back does not re-run it. A hard page reload clears it because
// the module is re-evaluated from scratch.
const cachedReport = ref<HardwareReport | null>(null)
let cachedDetection: Promise<HardwareReport> | null = null
</script>

<script setup lang="ts">
// Hardware fit for local Jev-compatible models (docs/hardware-fit.md).
// Presentational: detection is injected through the `detect` prop (the wiring
// container passes adapters/hardware/detect.ts's detectHardware), and the
// manual override is a v-model the container persists in
// Preferences.hardwareOverride. Detected values live only in this component
// (cached at module scope above, once per page load).
import { computed, onMounted, watch } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiSelect from '../../ui/UiSelect.vue'
import type { SelectOption } from '../../ui/UiSelect.vue'
import UiInput from '../../ui/UiInput.vue'
import ScoreBar from '../../ui/ScoreBar.vue'
import {
  GPU_TABLE,
  applyHardwareOverride,
  fitTiers,
  sanitizeHardwareOverride,
} from '../../domain/hardware'
import type { HardwareOverride, TierVerdict, TierVerdictKind } from '../../domain/hardware'

const props = defineProps<{
  /** Passive detection; never benchmarks. */
  detect: () => Promise<HardwareReport>
  override: HardwareOverride | null
}>()
const emit = defineEmits<{ 'update:override': [value: HardwareOverride | null] }>()

const detected = cachedReport
const detecting = ref(cachedReport.value === null)

/** Always runs a fresh detection (used both for the first auto-run and "Detect again"). */
async function runDetect() {
  detecting.value = true
  const promise = props.detect().catch(() => unknownHardwareReport())
  cachedDetection = promise
  try {
    detected.value = await promise
  } finally {
    detecting.value = false
  }
}

onMounted(() => {
  // Only the first mount of a page load triggers detection; a later mount
  // (switching views) sees `cachedDetection` already set and reuses it.
  if (!cachedDetection) void runDetect()
})

const effective = computed<HardwareReport | null>(() => {
  if (!detected.value && !props.override) return null
  return applyHardwareOverride(detected.value ?? unknownHardwareReport(), props.override)
})
const fit = computed(() => (effective.value ? fitTiers(effective.value) : null))

const VENDOR_LABEL: Record<string, string> = { nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel', apple: 'Apple', qualcomm: 'Qualcomm', arm: 'Arm' }
const GPU_OPTIONS: SelectOption[] = [
  { value: '', label: 'Use detected GPU' },
  ...GPU_TABLE.map((entry) => ({
    value: entry.id,
    label: `${entry.name}${entry.vramGb === null ? ' (unified memory)' : ` · ${entry.vramGb} GB`}`,
  })),
]

const vramDraft = ref(props.override?.vramGb != null ? String(props.override.vramGb) : '')
watch(
  () => props.override?.vramGb ?? null,
  (value) => {
    if (value !== parseVram(vramDraft.value)) vramDraft.value = value === null ? '' : String(value)
  },
)

function parseVram(text: string): number | null {
  if (text.trim() === '') return null
  return sanitizeHardwareOverride({ gpuId: null, vramGb: Number(text) })?.vramGb ?? null
}

function emitOverride(gpuId: string | null, vramGb: number | null) {
  emit('update:override', gpuId === null && vramGb === null ? null : { gpuId, vramGb })
}

function onGpu(value: string) {
  emitOverride(value === '' ? null : value, props.override?.vramGb ?? null)
}

function onVram(text: string) {
  vramDraft.value = text
  emitOverride(props.override?.gpuId ?? null, parseVram(text))
}

function clearOverride() {
  vramDraft.value = ''
  emit('update:override', null)
}

const VERDICT_TEXT: Record<TierVerdictKind, string> = {
  ok: 'Fits',
  tight: 'Tight',
  no: "Won't fit",
  unknown: 'Unknown',
}

function usage(tier: TierVerdict): number | null {
  const available = fit.value?.memory.availableGb
  if (available == null || available <= 0 || tier.verdict === 'unknown') return null
  return (tier.requiredGb / available) * 100
}

function gb(value: number | null, lowerBound = false): string {
  if (value === null) return 'unknown'
  return `${lowerBound ? '≥ ' : ''}${value} GB`
}

const gpuLabel = computed(() => {
  const gpu = effective.value?.gpu
  if (!gpu) return ''
  if (gpu.model) return gpu.model
  return gpu.vendor === 'unknown' ? 'Unknown (the browser hides it)' : `${VENDOR_LABEL[gpu.vendor] ?? gpu.vendor} GPU (model hidden)`
})

const recommendationText = computed(() => {
  const rec = fit.value?.recommendation
  if (!rec) return ''
  const name = rec.tier === 'cloud' ? 'Cloud API' : fit.value!.tiers.find((t) => t.id === rec.tier)!.label
  return `Recommended: ${name}. ${rec.reason}`
})
</script>

<template>
  <section class="hardware-fit" aria-labelledby="hardware-fit-title">
    <header class="hardware-fit__header">
      <h3 id="hardware-fit-title" class="hardware-fit__title">Can this machine run a local model?</h3>
      <UiButton data-test="detect" variant="secondary" :loading="detecting" @click="runDetect">
        {{ detected ? 'Detect again' : 'Detect hardware' }}
      </UiButton>
    </header>
    <p class="hardware-fit__note">Detection runs in your browser, nothing is sent. No benchmark is run.</p>
    <p v-if="detecting" class="hardware-fit__muted" data-test="detecting" role="status">Detecting…</p>

    <dl v-if="effective" class="hardware-fit__report" data-test="report">
      <div>
        <dt>GPU</dt>
        <dd>{{ gpuLabel }}</dd>
      </div>
      <div>
        <dt>{{ effective.unifiedMemory ? 'Memory' : 'VRAM' }}</dt>
        <dd>
          <template v-if="effective.unifiedMemory">
            unified, {{ gb(effective.gpu.source === 'manual' ? effective.gpu.vramGb : effective.ramGb, effective.gpu.source !== 'manual' && effective.ramIsLowerBound) }}
          </template>
          <template v-else>{{ gb(effective.gpu.vramGb) }}</template>
        </dd>
      </div>
      <div>
        <dt>System RAM</dt>
        <dd>{{ gb(effective.ramGb, effective.ramIsLowerBound) }}</dd>
      </div>
      <div>
        <dt>CPU threads</dt>
        <dd>{{ effective.cpuThreads ?? 'unknown' }}</dd>
      </div>
      <div>
        <dt>Platform</dt>
        <dd>{{ effective.platform }}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>{{ effective.gpu.source }} · {{ effective.confidence }} confidence</dd>
      </div>
    </dl>

    <ul v-if="fit" class="hardware-fit__tiers">
      <li v-for="tier in fit.tiers" :key="tier.id" class="hardware-fit__tier" :data-test="`tier-${tier.id}`">
        <span class="hardware-fit__tier-name">{{ tier.label }} <span class="hardware-fit__muted">~{{ tier.requiredGb }} GB</span></span>
        <span class="hardware-fit__verdict" :class="`hardware-fit__verdict--${tier.verdict}`" data-test="verdict">{{
          VERDICT_TEXT[tier.verdict]
        }}</span>
        <ScoreBar :value="usage(tier)" :label="`${tier.label} memory use`" />
        <span class="hardware-fit__reasons">{{ tier.reasons.join(' ') }}</span>
      </li>
    </ul>
    <p v-if="fit" class="hardware-fit__recommendation" data-test="recommendation">{{ recommendationText }}</p>
    <p v-if="fit" class="hardware-fit__muted" data-test="cloud">{{ fit.cloud }}</p>

    <fieldset class="hardware-fit__override">
      <legend>Manual override</legend>
      <UiSelect
        data-test="override-gpu"
        label="GPU model"
        :model-value="override?.gpuId ?? ''"
        :options="GPU_OPTIONS"
        @update:model-value="onGpu"
      />
      <UiInput
        data-test="override-vram"
        type="number"
        label="VRAM in GB (unified memory on Apple silicon)"
        :model-value="vramDraft"
        @update:model-value="onVram"
      />
      <UiButton data-test="clear-override" variant="ghost" size="compact" :disabled="!override" @click="clearOverride">
        Clear override
      </UiButton>
    </fieldset>
  </section>
</template>

<style scoped>
.hardware-fit {
  display: grid;
  gap: var(--space-3);
}

.hardware-fit__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.hardware-fit__title {
  margin: 0;
  font-size: var(--text-body-size);
  font-weight: var(--weight-semibold);
}

p {
  margin: 0;
}

.hardware-fit__note,
.hardware-fit__muted {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.hardware-fit__report {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-7) * 3), 1fr));
  gap: var(--space-2);
  margin: 0;
}

.hardware-fit__report dt {
  font-size: var(--text-caption-size);
  color: var(--color-text-muted);
}

.hardware-fit__report dd {
  margin: 0;
  font-size: var(--text-table-size);
}

.hardware-fit__tiers {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.hardware-fit__tier {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
}

.hardware-fit__reasons {
  grid-column: 1 / -1;
  font-size: var(--text-caption-size);
  color: var(--color-text-muted);
}

.hardware-fit__verdict {
  padding: 0 var(--space-2);
  border: var(--line-thin) solid currentColor;
  border-radius: var(--radius-sm);
  font-size: var(--text-caption-size);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}

.hardware-fit__verdict--ok {
  color: var(--color-success);
}

.hardware-fit__verdict--tight {
  color: var(--color-warning);
}

.hardware-fit__verdict--no {
  color: var(--color-danger);
}

.hardware-fit__verdict--unknown {
  color: var(--color-text-muted);
}

.hardware-fit__recommendation {
  font-weight: var(--weight-medium);
}

.hardware-fit__override {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
}

.hardware-fit__override legend {
  padding: 0 var(--space-1);
  font-size: var(--text-caption-size);
  color: var(--color-text-muted);
}

.hardware-fit__override .ui-button {
  justify-self: start;
}
</style>
