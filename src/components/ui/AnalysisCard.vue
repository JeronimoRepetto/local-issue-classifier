<script setup lang="ts">
// One Home list entry (SPEC §2.2 / §6.2 / §10.4): open (whole-card primary
// action), inline rename, refresh, delete (with confirmation), and the
// read-only "unreadable" state for a corrupt entry.
import { computed, nextTick, ref } from 'vue'
import type { IndexEntry } from '../../adapters/storage/analysisStore'
import UiButton from '../../ui/UiButton.vue'
import UiInput from '../../ui/UiInput.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import IconRefresh from '../../assets/icons/IconRefresh.vue'
import IconTrash from '../../assets/icons/IconTrash.vue'

const props = defineProps<{ entry: IndexEntry }>()
const emit = defineEmits<{
  open: [id: string]
  rename: [id: string, name: string]
  refresh: [id: string]
  delete: [id: string]
}>()

const renaming = ref(false)
const draftName = ref('')
const confirmingDelete = ref(false)
const nameInput = ref<InstanceType<typeof UiInput> | null>(null)

const isOk = computed(() => props.entry.status === 'ok')
const summary = computed(() => (props.entry.status === 'ok' ? props.entry.summary : null))
const id = computed(() => (props.entry.status === 'ok' ? props.entry.summary.id : props.entry.id))

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const formatBytes = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

async function startRename() {
  if (!summary.value) return
  draftName.value = summary.value.name
  renaming.value = true
  await nextTick()
  ;(nameInput.value?.$el as HTMLElement | undefined)?.querySelector('input')?.focus()
}

function commitRename() {
  const name = draftName.value
  renaming.value = false
  // An empty/unchanged name is left for the domain's own default fallback (SPEC §2.2);
  // only skip the emit when nothing actually changed.
  if (summary.value && name !== summary.value.name) emit('rename', id.value, name)
}

function cancelRename() {
  renaming.value = false
}

function onCardClick(event: MouseEvent) {
  if (!isOk.value || renaming.value) return
  if ((event.target as HTMLElement).closest('button, input, [data-no-open]')) return
  emit('open', id.value)
}

function confirmDelete() {
  confirmingDelete.value = false
  emit('delete', id.value)
}
</script>

<template>
  <article
    class="analysis-card"
    :class="{ 'analysis-card--unreadable': !isOk }"
    data-test="analysis-card"
    tabindex="0"
    role="button"
    :aria-label="isOk ? `Open ${summary!.name}` : `Unreadable analysis ${id}`"
    @click="onCardClick"
    @keydown.enter="onCardClick($event as unknown as MouseEvent)"
  >
    <template v-if="isOk && summary">
      <header class="analysis-card__header">
        <form v-if="renaming" data-no-open @submit.prevent="commitRename" @click.stop>
          <UiInput
            ref="nameInput"
            v-model="draftName"
            label="Name"
            @keydown.esc="cancelRename"
            @blur="commitRename"
          />
        </form>
        <h3 v-else class="analysis-card__name">{{ summary.name }}</h3>
        <UiButton
          v-if="!renaming"
          data-no-open
          data-test="rename"
          variant="ghost"
          size="compact"
          @click.stop="startRename"
        >
          Rename
        </UiButton>
      </header>
      <p class="analysis-card__meta">
        {{ summary.repoFullName }} · {{ summary.stateFilter }} · fetched {{ formatDate(summary.fetchedAt) }}
      </p>
      <p class="analysis-card__counts u-tabular">
        {{ summary.counts.total }} total · {{ summary.counts.classified }} classified ·
        {{ summary.counts.stale }} stale · {{ summary.counts.dismissed }} dismissed
      </p>
      <p class="analysis-card__size u-tabular">{{ formatBytes(summary.approxBytes) }}</p>
      <div class="analysis-card__actions">
        <UiButton data-no-open data-test="refresh" variant="secondary" @click.stop="emit('refresh', id)">
          <template #icon><IconRefresh /></template>
          Refresh
        </UiButton>
        <UiButton
          data-no-open
          data-test="delete"
          variant="ghost"
          @click.stop="confirmingDelete = true"
        >
          <template #icon><IconTrash /></template>
          Delete
        </UiButton>
      </div>
    </template>
    <template v-else>
      <p class="analysis-card__name">Unreadable analysis</p>
      <p class="analysis-card__meta">This analysis could not be read. It can only be deleted.</p>
      <p class="analysis-card__size u-tabular">{{ formatBytes(props.entry.status === 'unreadable' ? props.entry.approxBytes : 0) }}</p>
      <div class="analysis-card__actions">
        <UiButton data-no-open data-test="delete" variant="danger" @click.stop="confirmingDelete = true">
          <template #icon><IconTrash /></template>
          Delete
        </UiButton>
      </div>
    </template>

    <ConfirmDialog
      :open="confirmingDelete"
      :title="isOk ? `Delete analysis '${summary!.name}'?` : 'Delete this unreadable analysis?'"
      description="This removes its issues and results from this browser."
      confirm-label="Delete"
      @close="confirmingDelete = false"
      @confirm="confirmDelete"
    />
  </article>
</template>

<style scoped>
.analysis-card {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--elev-1);
  cursor: pointer;
  transition: box-shadow var(--dur-fast) var(--ease-standard);
}

.analysis-card:hover,
.analysis-card:focus-visible {
  box-shadow: var(--elev-2);
}

.analysis-card--unreadable {
  cursor: default;
  opacity: 0.85;
}

.analysis-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.analysis-card__name {
  margin: 0;
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
}

.analysis-card__meta,
.analysis-card__counts,
.analysis-card__size {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.analysis-card__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
