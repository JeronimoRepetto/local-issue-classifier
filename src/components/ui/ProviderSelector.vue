<script setup lang="ts">
// Which server classifies (T16, docs/local-providers.md): the TypeSafe cloud or
// a local Jev-compatible server (Kev, JevK5), plus the batching "Advanced"
// fields, so Settings mounts one component. Presentational: it owns no
// persistence and no network. Values flow out through emits; the connection
// test is the injected `probe` (useProvider().probe in the container).
// The third kind, "In this browser" (docs/browser-inference.md), mounts
// BrowserModelPanel and relays its download / remove intents.
import { computed, ref, watch } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import UiInput from '../../ui/UiInput.vue'
import UiSecretInput from '../../ui/UiSecretInput.vue'
import UiSelect from '../../ui/UiSelect.vue'
import type { SelectOption } from '../../ui/UiSelect.vue'
import LocalSetupGuide from './LocalSetupGuide.vue'
import BrowserModelPanel from './BrowserModelPanel.vue'
import type { BrowserPanelState } from './BrowserModelPanel.vue'
import {
  BROWSER_MODELS,
  LOCAL_PRESETS,
  defaultBrowserProviderConfig,
  defaultLocalProviderConfig,
  findBrowserModel,
  findPreset,
  validateLocalBaseUrl,
} from '../../domain/provider'
import type { LocalProviderConfig, ProviderConfig, ProviderProbeResult } from '../../domain/provider'
import { TRIMMING_PROFILE_IDS } from '../../domain/jevBatchState'
import type { ClassifyMode, TrimmingProfileId } from '../../domain/types'

const props = defineProps<{
  modelValue: ProviderConfig
  /** The local server's optional key (useSecrets().state.localApiKey). */
  apiKey: string
  classifyMode: ClassifyMode
  trimmingFloor: TrimmingProfileId
  probe: () => Promise<ProviderProbeResult>
  /** The in-browser model's state (useProvider().browserStatus); only read for the browser kind. */
  browser?: BrowserPanelState
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ProviderConfig]
  'update:apiKey': [value: string]
  'update:classifyMode': [value: ClassifyMode]
  'update:trimmingFloor': [value: TrimmingProfileId]
  'download-model': []
  'remove-model': []
}>()

const IDLE_BROWSER: BrowserPanelState = {
  phase: 'idle',
  progress: null,
  support: null,
  device: null,
  cachedBytes: null,
  error: null,
}

const PRESET_OPTIONS: SelectOption[] = [
  ...LOCAL_PRESETS.map((p) => ({ value: p.id, label: `${p.label} (${p.baseUrl})` })),
  { value: 'custom', label: 'Custom' },
]

const CLASSIFY_MODE_OPTIONS: SelectOption[] = [
  { value: 'batched', label: 'Batched (fewest requests)' },
  { value: 'per-issue', label: 'One request per issue' },
]

const TRIMMING_FLOOR_OPTIONS: SelectOption[] = TRIMMING_PROFILE_IDS.map((id) => ({ value: id, label: id }))

const PROBE_TEXT: Record<ProviderProbeResult['status'], string> = {
  direct: 'Connected directly: the server accepts calls from the browser.',
  proxied: 'Connected through the local proxy (/jev-local): the server sends no CORS headers.',
  unreachable: 'Could not reach the server. Is it running at this address?',
}

const local = computed<LocalProviderConfig | null>(() =>
  props.modelValue.kind === 'local' ? props.modelValue : null,
)
const browserModel = computed(() =>
  props.modelValue.kind === 'browser' ? (findBrowserModel(props.modelValue.modelId) ?? BROWSER_MODELS[0]) : null,
)
const preset = computed(() => findPreset(props.modelValue)?.id ?? 'custom')
const validation = computed(() => (local.value ? validateLocalBaseUrl(local.value.baseUrl) : null))
const urlError = computed(() => (validation.value && !validation.value.ok ? validation.value.message : undefined))

const checking = ref(false)
const result = ref<ProviderProbeResult | null>(null)

/** The local server's port, for the unreachable hint; '' when the URL has none or is malformed. */
const localPort = computed(() => {
  if (!local.value) return ''
  try {
    return new URL(local.value.baseUrl).port
  } catch {
    return ''
  }
})

// A result belongs to one address: forget it when the provider or URL changes.
watch(
  () => (local.value ? `local:${local.value.baseUrl}` : 'typesafe'),
  () => {
    result.value = null
  },
)

function selectKind(kind: ProviderConfig['kind']): void {
  if (kind === props.modelValue.kind) return
  const next: Record<ProviderConfig['kind'], () => ProviderConfig> = {
    typesafe: () => ({ kind: 'typesafe' }),
    local: defaultLocalProviderConfig,
    browser: defaultBrowserProviderConfig,
  }
  emit('update:modelValue', next[kind]())
}

function patchLocal(patch: Partial<Omit<LocalProviderConfig, 'kind'>>): void {
  if (!local.value) return
  emit('update:modelValue', { ...local.value, ...patch })
}

function selectPreset(id: string): void {
  const chosen = LOCAL_PRESETS.find((p) => p.id === id)
  if (chosen) patchLocal({ baseUrl: chosen.baseUrl, model: chosen.model })
}

async function testConnection(): Promise<void> {
  checking.value = true
  result.value = null
  try {
    result.value = await props.probe()
  } catch {
    result.value = { status: 'unreachable', models: null }
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <div class="provider-selector">
    <fieldset class="provider-selector__kind">
      <legend class="ui-field__label">Classifier</legend>
      <label class="provider-selector__radio">
        <input
          data-test="kind-typesafe"
          type="radio"
          name="provider-kind"
          value="typesafe"
          :checked="modelValue.kind === 'typesafe'"
          @change="selectKind('typesafe')"
        />
        TypeSafe cloud (Jev)
      </label>
      <label class="provider-selector__radio">
        <input
          data-test="kind-local"
          type="radio"
          name="provider-kind"
          value="local"
          :checked="modelValue.kind === 'local'"
          @change="selectKind('local')"
        />
        Local server (Kev, JevK5)
      </label>
      <label class="provider-selector__radio">
        <input
          data-test="kind-browser"
          type="radio"
          name="provider-kind"
          value="browser"
          :checked="modelValue.kind === 'browser'"
          @change="selectKind('browser')"
        />
        <span data-test="kind-browser-label">In this browser (experimental)</span>
      </label>
    </fieldset>

    <div v-if="browserModel" class="provider-selector__local">
      <BrowserModelPanel
        :model="browserModel"
        :state="browser ?? IDLE_BROWSER"
        @download="emit('download-model')"
        @remove="emit('remove-model')"
      />
      <p class="provider-selector__note" data-test="browser-per-issue-note">
        Runs one issue at a time, one request per issue: the batched mode and the concurrency setting do not apply.
        Nothing leaves this page and it costs nothing per token.
      </p>
    </div>

    <div v-if="local" class="provider-selector__local">
      <LocalSetupGuide :status="result?.status ?? null" />
      <UiSelect
        data-test="preset"
        label="Preset"
        :model-value="preset"
        :options="PRESET_OPTIONS"
        hint="Fills in the default address and model of a known server."
        @update:model-value="selectPreset"
      />
      <UiInput
        data-test="base-url"
        label="Base URL"
        type="url"
        :model-value="local.baseUrl"
        placeholder="http://localhost:8009"
        :error="urlError"
        hint="localhost or a private LAN address only."
        @update:model-value="patchLocal({ baseUrl: $event })"
      />
      <UiInput
        data-test="model"
        label="Model"
        :model-value="local.model"
        placeholder="kev-latest"
        @update:model-value="patchLocal({ model: $event })"
      />
      <UiSecretInput
        data-test="local-key"
        label="Server key (optional)"
        :model-value="apiKey"
        hint="Only if the server requires one (e.g. KEV_API_KEY). Kept in memory only."
        @update:model-value="emit('update:apiKey', $event)"
      />
      <div class="provider-selector__test">
        <UiButton
          data-test="test-connection"
          :disabled="!validation?.ok"
          :loading="checking"
          @click="testConnection"
        >
          Test connection
        </UiButton>
        <p v-if="checking || result" role="status" class="provider-selector__status" data-test="probe-status">
          {{ checking ? 'Checking…' : result ? PROBE_TEXT[result.status] : '' }}
        </p>
      </div>
      <p v-if="result?.status === 'unreachable'" class="provider-selector__hint" data-test="unreachable-hint">
        Is the server running on port {{ localPort }}? See the setup guide above.
      </p>
      <ul v-if="result?.models?.length" class="provider-selector__models" data-test="probe-models">
        <li v-for="name in result.models" :key="name">{{ name }}</li>
      </ul>
      <p class="provider-selector__note">A local server costs nothing per token.</p>
    </div>

    <details class="provider-selector__advanced">
      <summary>Advanced</summary>
      <UiSelect
        data-test="classify-mode"
        label="Classification mode"
        :model-value="classifyMode"
        :options="CLASSIFY_MODE_OPTIONS"
        hint="Batched sends every selected issue in as few requests as fit (docs/batching.md)."
        @update:model-value="emit('update:classifyMode', $event as ClassifyMode)"
      />
      <UiSelect
        data-test="trimming-floor"
        label="Tightest trimming profile"
        :model-value="trimmingFloor"
        :options="TRIMMING_FLOOR_OPTIONS"
        hint="How far a batch may trim each issue to fit one request."
        @update:model-value="emit('update:trimmingFloor', $event as TrimmingProfileId)"
      />
    </details>
  </div>
</template>

<style scoped>
p {
  margin: 0;
}

.provider-selector,
.provider-selector__local,
.provider-selector__advanced {
  display: grid;
  gap: var(--space-3);
}

.provider-selector__kind {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.provider-selector__radio {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-table-size);
  cursor: pointer;
}

.provider-selector__radio input {
  accent-color: var(--color-accent);
}

.provider-selector__test {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.provider-selector__status,
.provider-selector__hint,
.provider-selector__note {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.provider-selector__models {
  margin: 0;
  padding-left: var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-table-size);
}

.provider-selector__advanced summary {
  width: fit-content;
  font-size: var(--text-table-size);
  color: var(--color-accent);
  cursor: pointer;
}
</style>
