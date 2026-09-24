<script setup lang="ts">
// FB-4 (docs/local-providers.md): beginner-proof, copy-pasteable steps to run
// a local Jev-compatible server (Kev, JevK5), so "Local server" in Settings is
// no longer a dead end. Presentational: it owns no persistence and no
// network; `status` (the container's last connection-test result) only
// decides whether it starts collapsed. The Kev commands themselves come from
// domain/localCommands.ts's kevCommands(), the single source of truth shared
// with Home's condensed summary in ProviderOnboardingCard.vue, so the two can
// never drift apart again — keep this file's JevK5 steps and
// docs/local-providers.md in sync by hand.
//
// Critical-information callouts (FB local-setup UX task, item 2): four notes
// — prerequisites, the GPU-optional caveat, the CUDA/--no-sync reminder, and
// what plainly will not work — render through UiCallout instead of plain
// text. CALLOUT_TONE below maps a step id to its tone; a step with a note but
// no mapped tone (the shortcut's --dir hint, macOS's "not applicable" aside)
// still renders as plain text, unchanged.
import { computed, ref, watch } from 'vue'
import UiSegmented from '../../ui/UiSegmented.vue'
import type { SegmentedOption } from '../../ui/UiSegmented.vue'
import UiSelect from '../../ui/UiSelect.vue'
import type { SelectOption } from '../../ui/UiSelect.vue'
import UiCallout from '../../ui/UiCallout.vue'
import type { CalloutTone } from '../../ui/UiCallout.vue'
import CopyCommandLine from './CopyCommandLine.vue'
import { LOCAL_TIERS } from '../../domain/hardware'
import type { ProviderProbeResult } from '../../domain/provider'
import {
  KEV_GPU_OPTIONAL_NOTE,
  KEV_OS_OPTIONS,
  KEV_PREREQS_NOTE,
  KEV_UNSUPPORTED_NOTE,
  LAYA_CONTEXT_NOTE,
  LAYA_CPU_NOTE,
  LAYA_PREREQS_NOTE,
  kevCommands,
  layaCommands,
} from '../../domain/localCommands'
import type { KevOs } from '../../domain/localCommands'

const props = defineProps<{
  /** The last connection-test result, or null before one runs. */
  status: ProviderProbeResult['status'] | null
}>()

type GuideProvider = 'kev' | 'jevk5' | 'laya'

const PROVIDER_OPTIONS: SegmentedOption[] = [
  { value: 'kev', label: 'Kev' },
  { value: 'jevk5', label: 'JevK5' },
  { value: 'laya', label: 'Laya' },
]

/** LOCAL_PRESETS[2] (Laya), src/domain/provider.ts. */
const LAYA_PORT = 8000

// Kev ships three sizes (LOCAL_TIERS, docs/hardware-fit.md); JevK5 is one model.
const KEV_MODEL_OPTIONS: SelectOption[] = LOCAL_TIERS.filter((t) => t.id !== 'jevk5').map((t) => ({
  value: t.id,
  label: `${t.label} (~${t.requiredGb} GB)`,
}))
const JEVK5_TIER = LOCAL_TIERS.find((t) => t.id === 'jevk5')!

interface GuideStep {
  id: string
  label: string
  command: string | null
  note?: string
}

/** Which step ids render their `note` as a UiCallout (and its tone), instead
 *  of plain text. See the file header. */
const CALLOUT_TONE: Partial<Record<string, CalloutTone>> = {
  prereqs: 'warning',
  'gpu-optional': 'warning',
  unsupported: 'danger',
  cuda: 'warning',
  context: 'warning',
  'cpu-ok': 'info',
}

const provider = ref<GuideProvider>('kev')
const os = ref<KevOs>('windows')
const kevModel = ref<string>('kev-0.8b')

// Open by default; the first successful probe (direct or proxied) collapses
// it, since the user no longer needs it. An unreachable result never
// collapses it — that is exactly when the guide is still needed. The user
// can still expand or collapse it by hand afterwards (native <details>).
const expanded = ref(true)
watch(
  () => props.status,
  (status) => {
    if (status === 'direct' || status === 'proxied') expanded.value = false
  },
)

function onToggle(event: Event): void {
  expanded.value = (event.target as HTMLDetailsElement).open
}

const kevSteps = computed<GuideStep[]>(() => [
  { id: 'prereqs', label: 'Prerequisites', command: null, note: KEV_PREREQS_NOTE },
  { id: 'gpu-optional', label: 'GPU is optional', command: null, note: KEV_GPU_OPTIONAL_NOTE },
  { id: 'unsupported', label: "Won't work", command: null, note: KEV_UNSUPPORTED_NOTE },
  ...kevCommands({ model: kevModel.value, port: 8009, os: os.value, shortcut: true }),
])

const jevk5Steps: GuideStep[] = [
  {
    id: 'prereqs',
    label: 'Prerequisites',
    command: null,
    note: `Python and pip. Needs about ${JEVK5_TIER.requiredGb} GB of NVIDIA GPU memory.`,
  },
  {
    id: 'install',
    label: 'Install',
    command: 'pip install "jevk5[fast] @ git+https://github.com/allebee/jevk5@v0.2.0"',
  },
  { id: 'serve', label: 'Start the server', command: 'jevk5-serve --model alibiserikbay/JevK5 --port 8090' },
]

const layaSteps = computed<GuideStep[]>(() => [
  { id: 'prereqs', label: 'Prerequisites', command: null, note: LAYA_PREREQS_NOTE },
  { id: 'cpu-ok', label: 'CPU is enough', command: null, note: LAYA_CPU_NOTE },
  { id: 'context', label: 'Small context', command: null, note: LAYA_CONTEXT_NOTE },
  ...layaCommands({ port: LAYA_PORT, os: os.value }),
])

const steps = computed<GuideStep[]>(() => {
  if (provider.value === 'kev') return kevSteps.value
  if (provider.value === 'jevk5') return jevk5Steps
  return layaSteps.value
})
</script>

<template>
  <details class="local-setup-guide" data-test="local-setup-guide" :open="expanded" @toggle="onToggle">
    <summary>Set up a local server</summary>
    <div class="local-setup-guide__body">
      <UiSegmented label="Local server" :options="PROVIDER_OPTIONS" v-model="provider" />
      <UiSegmented label="Operating system" size="compact" :options="KEV_OS_OPTIONS" v-model="os" />

      <UiSelect
        v-if="provider === 'kev'"
        data-test="kev-model"
        label="Model size"
        :model-value="kevModel"
        :options="KEV_MODEL_OPTIONS"
        hint="Pick the size that fits your GPU (docs/hardware-fit.md); Test connection lists what the server actually serves."
        @update:model-value="kevModel = $event"
      />
      <p v-else-if="provider === 'jevk5'" class="local-setup-guide__note">
        JevK5 is one model, needing ~{{ JEVK5_TIER.requiredGb }} GB of GPU memory.
      </p>

      <ol class="local-setup-guide__steps">
        <li v-for="step in steps" :key="step.id" class="local-setup-guide__step">
          <template v-if="!step.command && CALLOUT_TONE[step.id]">
            <UiCallout :tone="CALLOUT_TONE[step.id]!" :title="step.label" :data-test="`callout-${step.id}`">
              {{ step.note }}
            </UiCallout>
          </template>
          <template v-else>
            <p class="local-setup-guide__step-label">{{ step.label }}</p>
            <CopyCommandLine v-if="step.command" :id="step.id" :command="step.command" />
            <UiCallout v-if="step.note && CALLOUT_TONE[step.id]" :tone="CALLOUT_TONE[step.id]!" :data-test="`callout-${step.id}`">
              {{ step.note }}
            </UiCallout>
            <p v-else-if="step.note" class="local-setup-guide__note">{{ step.note }}</p>
          </template>
        </li>
      </ol>

      <p class="local-setup-guide__note">
        Then click <strong>Test connection</strong> above.
      </p>
    </div>
  </details>
</template>

<style scoped>
p {
  margin: 0;
}

.local-setup-guide {
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2h);
}

.local-setup-guide summary {
  font-size: var(--text-table-size);
  font-weight: var(--weight-medium);
  color: var(--color-accent);
  cursor: pointer;
}

.local-setup-guide__body {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.local-setup-guide__steps {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding-left: var(--space-4);
}

.local-setup-guide__step {
  display: grid;
  gap: var(--space-1);
}

.local-setup-guide__step-label {
  font-size: var(--text-table-size);
  font-weight: var(--weight-medium);
}

.local-setup-guide__note {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}
</style>
