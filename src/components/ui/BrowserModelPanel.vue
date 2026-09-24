<script setup lang="ts">
// The in-browser model (docs/browser-inference.md): what this browser can run
// it on, how big the download is, the download itself with its progress, and
// the cached copy with a way to remove it. Presentational: the state comes in
// as a prop (useProvider().browserStatus in the container) and intents go out
// as `download` / `remove`.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import type { BrowserModelPreset } from '../../domain/provider'

/** Mirrors useProvider's BrowserModelStatus; declared here so this component stays free of composables. */
export interface BrowserPanelState {
  phase: 'idle' | 'downloading' | 'ready' | 'unsupported' | 'error'
  progress: number | null
  support: 'webgpu' | 'wasm' | 'none' | null
  device: 'webgpu' | 'wasm' | null
  cachedBytes: number | null
  error: string | null
}

const props = defineProps<{
  model: BrowserModelPreset
  state: BrowserPanelState
}>()

const emit = defineEmits<{ download: []; remove: [] }>()

const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`

const SUPPORT_TEXT: Record<NonNullable<BrowserPanelState['support']>, string> = {
  webgpu: 'WebGPU is available: the model runs on your GPU.',
  wasm: 'No WebGPU in this browser: the model falls back to WebAssembly on the CPU, which is slow (tens of seconds per issue or more).',
  none: 'This browser cannot run the model: it has neither WebGPU nor WebAssembly.',
}

const supportText = computed(() => (props.state.support ? SUPPORT_TEXT[props.state.support] : 'Checking this browser…'))

/** The download that applies here: the fp16 weights on WebGPU, the larger q4 set on the CPU. */
const downloadSize = computed(() =>
  props.state.support === 'wasm' ? mb(props.model.downloadBytes.wasm) : mb(props.model.downloadBytes.webgpu),
)

const percent = computed(() => (props.state.progress === null ? null : Math.round(props.state.progress * 100)))

const canDownload = computed(
  () => props.state.support !== 'none' && props.state.phase !== 'downloading' && props.state.phase !== 'unsupported',
)

const DEVICE_LABEL = { webgpu: 'WebGPU', wasm: 'WebAssembly (CPU)' } as const

const statusText = computed(() => {
  const { phase, device, error } = props.state
  if (phase === 'ready' && device) return `Model ready, running on ${DEVICE_LABEL[device]}.`
  if (phase === 'error') return `Could not load the model: ${error ?? 'unknown error'}`
  return null
})

const hasCache = computed(() => (props.state.cachedBytes ?? 0) > 0)
</script>

<template>
  <div class="browser-model" data-test="browser-model-panel">
    <p class="browser-model__support" data-test="browser-support">{{ supportText }}</p>
    <p class="browser-model__model">
      <strong>{{ model.label }}</strong> (<code>{{ model.id }}</code>) · {{ downloadSize }} download
    </p>
    <p v-if="model.placeholder" class="browser-model__caveat" data-test="placeholder-caveat">
      Experimental: this small generic model is not Jev, JevK5, Kev or Laya. Its answers are placeholders that show the
      pipeline works, not real classifications.
    </p>

    <div class="browser-model__actions">
      <UiButton
        data-test="download-model"
        variant="secondary"
        :disabled="!canDownload"
        :loading="state.phase === 'downloading'"
        @click="emit('download')"
      >
        {{ hasCache ? 'Load model' : 'Download model' }}
      </UiButton>
      <p v-if="state.phase === 'downloading'" role="status" class="browser-model__status" data-test="download-progress">
        Downloading… {{ percent === null ? '' : `${percent}%` }}
      </p>
      <p v-else-if="statusText" role="status" class="browser-model__status" data-test="browser-model-status">
        {{ statusText }}
      </p>
    </div>
    <progress
      v-if="state.phase === 'downloading' && percent !== null"
      class="browser-model__progress"
      :value="percent"
      max="100"
      :aria-label="`Model download ${percent}%`"
    />

    <p class="browser-model__note" data-test="cache-note">
      The browser keeps the files in its cache (Cache API), so later visits load without downloading again. It may
      still clear them when the disk runs low; the next load then downloads them again.
    </p>
    <div v-if="hasCache" class="browser-model__actions">
      <p class="browser-model__status" data-test="cached-size">Downloaded: {{ mb(state.cachedBytes ?? 0) }}</p>
      <UiButton data-test="remove-model" variant="ghost" size="compact" @click="emit('remove')">
        Remove downloaded model
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
p {
  margin: 0;
}

.browser-model {
  display: grid;
  gap: var(--space-2h);
}

.browser-model__support,
.browser-model__model {
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
}

.browser-model__model code {
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
}

.browser-model__caveat,
.browser-model__note,
.browser-model__status {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.browser-model__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.browser-model__progress {
  width: 100%;
  accent-color: var(--color-accent);
}
</style>
