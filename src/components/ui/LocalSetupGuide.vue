<script setup lang="ts">
// FB-4 (docs/local-providers.md): beginner-proof, copy-pasteable steps to run
// a local Jev-compatible server (Kev, JevK5), so "Local server" in Settings is
// no longer a dead end. Presentational: it owns no persistence and no
// network; `status` (the container's last connection-test result) only
// decides whether it starts collapsed. The commands mirror
// docs/local-providers.md and scripts/local-kev.mjs verbatim — keep the three
// in sync.
import { computed, ref, watch } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiSegmented from '../../ui/UiSegmented.vue'
import type { SegmentedOption } from '../../ui/UiSegmented.vue'
import UiSelect from '../../ui/UiSelect.vue'
import type { SelectOption } from '../../ui/UiSelect.vue'
import { LOCAL_TIERS } from '../../domain/hardware'
import type { ProviderProbeResult } from '../../domain/provider'

const props = defineProps<{
  /** The last connection-test result, or null before one runs. */
  status: ProviderProbeResult['status'] | null
}>()

type GuideProvider = 'kev' | 'jevk5'
type GuideOs = 'windows' | 'macos' | 'linux'

const PROVIDER_OPTIONS: SegmentedOption[] = [
  { value: 'kev', label: 'Kev' },
  { value: 'jevk5', label: 'JevK5' },
]

const OS_OPTIONS: SegmentedOption[] = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
]

// Kev ships three sizes (LOCAL_TIERS, docs/hardware-fit.md); JevK5 is one model.
const KEV_MODEL_OPTIONS: SelectOption[] = LOCAL_TIERS.filter((t) => t.id !== 'jevk5').map((t) => ({
  value: t.id,
  label: `${t.label} (~${t.requiredGb} GB)`,
}))
const JEVK5_TIER = LOCAL_TIERS.find((t) => t.id === 'jevk5')!

// CUDA wheel index (pytorch.org/get-started/locally, Windows+Linux, checked
// 2026-09-24 from https://download.pytorch.org/assets/quick-start-module.js).
// Keep in sync with scripts/local-kev.mjs's CUDA_TORCH_INDEX_URL.
const CUDA_TORCH_INDEX_URL = 'https://download.pytorch.org/whl/cu130'

const UV_INSTALL: Record<GuideOs, string> = {
  windows: 'winget install astral-sh.uv',
  macos: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  linux: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
}

interface GuideStep {
  id: string
  label: string
  command: string | null
  note?: string
}

const provider = ref<GuideProvider>('kev')
const os = ref<GuideOs>('windows')
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

const kevSteps = computed<GuideStep[]>(() => {
  const cuda =
    os.value === 'macos'
      ? { id: 'cuda-note', label: 'GPU on macOS', command: null, note: 'Not applicable on macOS: Apple Silicon uses Metal (MPS) automatically.' }
      : {
          id: 'cuda',
          label: 'Optional: use an NVIDIA GPU',
          command: `uv pip install --python .venv torch torchvision --index-url ${CUDA_TORCH_INDEX_URL}`,
          note: '`uv sync` installs a CPU-only torch. Run this once, inside the kev folder, to use the GPU instead. Always start with `--no-sync` afterwards, or uv will reinstall the CPU build.',
        }
  return [
    {
      id: 'prereqs',
      label: 'Prerequisites',
      command: null,
      note: 'Git, Python 3.12 or 3.13, and uv. An NVIDIA GPU is optional; without one Kev runs on the CPU (slow).',
    },
    { id: 'uv-install', label: "Install uv (skip if you already have it)", command: UV_INSTALL[os.value] },
    { id: 'clone', label: 'Clone Kev', command: 'git clone https://github.com/jaredpalmer/kev.git && cd kev' },
    { id: 'sync', label: 'Install its dependencies', command: 'uv sync --extra serve' },
    cuda,
    {
      id: 'serve',
      label: 'Start the server',
      command: `uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/${kevModel.value} --port 8009`,
    },
    {
      id: 'shortcut',
      label: "Or use this repo's shortcut for the steps above",
      command: `pnpm local:kev --model ${kevModel.value}`,
    },
  ]
})

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

const steps = computed<GuideStep[]>(() => (provider.value === 'kev' ? kevSteps.value : jevk5Steps))

const copiedId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

function fallbackCopy(text: string): void {
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(el)
  }
}

async function copy(step: GuideStep): Promise<void> {
  if (!step.command) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(step.command)
    } else {
      fallbackCopy(step.command)
    }
  } catch {
    fallbackCopy(step.command)
  }
  copiedId.value = step.id
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    if (copiedId.value === step.id) copiedId.value = null
  }, 2000)
}
</script>

<template>
  <details class="local-setup-guide" data-test="local-setup-guide" :open="expanded" @toggle="onToggle">
    <summary>Set up a local server</summary>
    <div class="local-setup-guide__body">
      <UiSegmented label="Local server" :options="PROVIDER_OPTIONS" v-model="provider" />
      <UiSegmented label="Operating system" size="compact" :options="OS_OPTIONS" v-model="os" />

      <UiSelect
        v-if="provider === 'kev'"
        data-test="kev-model"
        label="Model size"
        :model-value="kevModel"
        :options="KEV_MODEL_OPTIONS"
        hint="Pick the size that fits your GPU (docs/hardware-fit.md); Test connection lists what the server actually serves."
        @update:model-value="kevModel = $event"
      />
      <p v-else class="local-setup-guide__note">JevK5 is one model, needing ~{{ JEVK5_TIER.requiredGb }} GB of GPU memory.</p>

      <ol class="local-setup-guide__steps">
        <li v-for="step in steps" :key="step.id" class="local-setup-guide__step">
          <p class="local-setup-guide__step-label">{{ step.label }}</p>
          <div v-if="step.command" class="local-setup-guide__command">
            <pre :data-test="`command-${step.id}`">{{ step.command }}</pre>
            <UiButton
              size="compact"
              variant="ghost"
              :data-test="`copy-${step.id}`"
              :aria-label="`Copy: ${step.label}`"
              @click="copy(step)"
            >
              {{ copiedId === step.id ? 'Copied' : 'Copy' }}
            </UiButton>
          </div>
          <p v-if="step.note" class="local-setup-guide__note">{{ step.note }}</p>
        </li>
      </ol>

      <p class="local-setup-guide__note">
        Then click <strong>Test connection</strong> above.
      </p>
    </div>
  </details>
</template>

<style scoped>
p,
pre {
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

.local-setup-guide__command {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.local-setup-guide__command pre {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--space-2);
  overflow-x: auto;
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  white-space: pre;
}

.local-setup-guide__note {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}
</style>
