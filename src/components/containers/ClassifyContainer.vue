<script setup lang="ts">
// Classify controls for the current analysis. Standalone:
// it reads only composables, takes the filtered view as an optional prop, and
// asks its parent to open Settings through an event. The analysis view mounts
// it (integration task); it owns its own toasts.
import { computed, onMounted, ref, watch } from 'vue'
import UiToastStack from '../../ui/UiToastStack.vue'
import type { ToastItem } from '../../ui/UiToastStack.vue'
import { useReducedMotion } from '../../ui/motion'
import ClassifyButton from '../ui/ClassifyButton.vue'
import type { ClassifyButtonScope } from '../ui/ClassifyButton.vue'
import ClassifyProgress from '../ui/ClassifyProgress.vue'
import ProviderSwitch from '../ui/ProviderSwitch.vue'
import RunSummary from '../ui/RunSummary.vue'
import { useClassifier } from '../../composables/useClassifier'
import type { ClassifyRequest } from '../../composables/useClassifier'
import { useProvider } from '../../composables/useProvider'
import { candidateIdFor } from '../../domain/provider'
import type { RunSummary as Summary } from '../../domain/classifyRun'

export type OpenSettingsReason = 'jev-key-missing' | 'jev-key-rejected'

const props = defineProps<{
  /** Issue numbers of the current filtered table view; enables "Classify filtered view". */
  filteredNumbers?: number[]
}>()

const emit = defineEmits<{ 'open-settings': [reason: OpenSettingsReason] }>()

const classifier = useClassifier()
const provider = useProvider()
const { reduced } = useReducedMotion()

const scope = ref<ClassifyButtonScope>('unclassified')
const cancelling = ref(false)
const toasts = ref<ToastItem[]>([])
let toastId = 0

const running = computed(() => classifier.state.phase === 'running')

// Provider switcher (T-provider-switch, docs/local-providers.md, docs/browser-inference.md):
// probe every local preset and check WebGPU once, when this bar mounts with the analysis view.
onMounted(() => {
  void provider.probeAll()
})

const selectedProviderId = computed(() => candidateIdFor(provider.config.value))

watch(
  () => props.filteredNumbers,
  (numbers) => {
    if (!numbers && scope.value === 'filtered') scope.value = 'unclassified'
  },
)

function requestFor(value: ClassifyButtonScope): ClassifyRequest {
  if (value === 'filtered') return { scope: 'unclassified', only: props.filteredNumbers ?? [] }
  return { scope: value }
}

const counts = computed(
  () => classifier.counts(props.filteredNumbers) ?? { unclassified: 0, all: 0, filtered: null },
)
// Building every state is not free: estimate only while idle.
const estimate = computed(() => (running.value ? null : classifier.estimate(requestFor(scope.value))))

function toast(kind: ToastItem['kind'], message: string): void {
  toasts.value = [...toasts.value, { id: ++toastId, kind, message }]
}

function dismissToast(id: ToastItem['id']): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

function report(summary: Summary | null): void {
  cancelling.value = false
  if (!summary) return
  if (summary.status === 'auth-failed') {
    toast('error', 'The Jev key was rejected and has been cleared. Enter it again in Settings.')
    emit('open-settings', 'jev-key-rejected')
    return
  }
  const counts = `${summary.classified} classified · ${summary.failed} failed · ${summary.lowConfidence} low-confidence`
  if (summary.status === 'cancelled') toast('info', `Classification cancelled. ${counts}.`)
  else toast(summary.failed > 0 ? 'warning' : 'success', `Classification finished: ${counts}.`)
}

async function start(value: ClassifyButtonScope): Promise<void> {
  report(await classifier.start(requestFor(value)))
}

async function retryFailed(): Promise<void> {
  report(await classifier.retryFailed())
}

function cancel(): void {
  cancelling.value = true
  classifier.cancel()
}
</script>

<template>
  <div class="classify-container">
    <div class="classify-container__bar">
      <ClassifyButton
        v-model:scope="scope"
        :has-key="provider.ready.value"
        :counts="counts"
        :estimate="estimate"
        :running="running"
        @start="start"
        @open-settings="emit('open-settings', 'jev-key-missing')"
      />

      <ProviderSwitch
        class="classify-container__provider"
        :candidates="provider.candidates.value"
        :model-value="selectedProviderId"
        :disabled="running"
        @update:model-value="provider.selectProvider"
      />
    </div>

    <ClassifyProgress
      v-if="running && classifier.state.progress"
      :progress="classifier.state.progress"
      :reduced-motion="reduced"
      :cancelling="cancelling"
      @cancel="cancel"
    />

    <RunSummary
      v-else-if="classifier.state.summary"
      :summary="classifier.state.summary"
      @retry-failed="retryFailed"
      @dismiss="classifier.reset()"
    />

    <UiToastStack :toasts="toasts" @dismiss="dismissToast" />
  </div>
</template>

<style scoped>
.classify-container {
  display: grid;
  gap: var(--space-2h);
  padding: var(--space-2h) var(--space-3);
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
}

.classify-container__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
}

.classify-container__provider {
  align-self: flex-end;
}
</style>
