<script setup lang="ts">
// One Home list entry (SPEC §2.2 / §6.2 / §10.4): open (whole-card primary
// action), inline rename, refresh, delete (with confirmation), and the
// read-only "unreadable" state for a corrupt entry.
import { computed, nextTick, ref } from 'vue'
import type { AnalysisSummary } from '../../domain/types'
import UiButton from '../../ui/UiButton.vue'
import UiInput from '../../ui/UiInput.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import IconRefresh from '../../assets/icons/IconRefresh.vue'
import IconTrash from '../../assets/icons/IconTrash.vue'

// Structurally identical to adapters/storage/analysisStore's IndexEntry, redeclared
// here (never imported) because src/components/ui must not import adapters/.
export type IndexEntry =
  | { status: 'ok'; summary: AnalysisSummary }
  | { status: 'unreadable'; id: string; approxBytes: number }

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

/** Key/value metadata grid (design v2): keys in micro mono, values in mono. */
const meta = computed(() => {
  const s = summary.value
  if (!s) return []
  return [
    { key: 'Issues', value: String(s.counts.total) },
    { key: 'Classified', value: String(s.counts.classified) },
    { key: 'Stale', value: String(s.counts.stale) },
    { key: 'Dismissed', value: String(s.counts.dismissed) },
    { key: 'State', value: s.stateFilter },
    { key: 'Fetched', value: formatDate(s.fetchedAt) },
    { key: 'Size', value: formatBytes(s.approxBytes) },
  ]
})

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
        <form v-if="renaming" class="analysis-card__rename" data-no-open @submit.prevent="commitRename" @click.stop>
          <UiInput
            ref="nameInput"
            v-model="draftName"
            label="Name"
            @keydown.esc="cancelRename"
            @blur="commitRename"
          />
        </form>
        <div v-else class="analysis-card__titles">
          <h3 class="analysis-card__name">{{ summary.name }}</h3>
          <p class="analysis-card__repo">{{ summary.repoFullName }}</p>
        </div>
        <div v-if="!renaming" class="analysis-card__actions">
          <UiButton data-no-open data-test="rename" variant="ghost" size="compact" @click.stop="startRename">
            Rename
          </UiButton>
          <UiButton
            data-no-open
            data-test="refresh"
            variant="ghost"
            size="compact"
            icon-only
            :aria-label="`Refresh ${summary.name}`"
            @click.stop="emit('refresh', id)"
          >
            <template #icon><IconRefresh /></template>
          </UiButton>
          <UiButton
            data-no-open
            data-test="delete"
            variant="ghost"
            size="compact"
            icon-only
            :aria-label="`Delete ${summary.name}`"
            @click.stop="confirmingDelete = true"
          >
            <template #icon><IconTrash /></template>
          </UiButton>
        </div>
      </header>
      <dl class="analysis-card__meta">
        <div v-for="item in meta" :key="item.key" class="analysis-card__meta-item">
          <dt class="u-micro">{{ item.key }}</dt>
          <dd class="u-mono">{{ item.value }}</dd>
        </div>
      </dl>
    </template>
    <template v-else>
      <header class="analysis-card__header">
        <div class="analysis-card__titles">
          <h3 class="analysis-card__name">Unreadable analysis</h3>
          <p class="analysis-card__repo">This analysis could not be read. It can only be deleted.</p>
        </div>
        <div class="analysis-card__actions analysis-card__actions--always">
          <UiButton data-no-open data-test="delete" variant="danger" size="compact" @click.stop="confirmingDelete = true">
            <template #icon><IconTrash /></template>
            Delete
          </UiButton>
        </div>
      </header>
      <p class="analysis-card__size u-mono">{{ formatBytes(props.entry.status === 'unreadable' ? props.entry.approxBytes : 0) }}</p>
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
  position: relative;
  display: grid;
  gap: var(--space-2h);
  padding: var(--space-3);
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    border-color var(--dur-base) var(--ease-out),
    background-color var(--dur-base) var(--ease-out);
}

.analysis-card:hover {
  border-color: var(--color-border-strong);
}

.analysis-card--unreadable {
  cursor: default;
}

.analysis-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: var(--size-compact);
}

.analysis-card__titles {
  display: grid;
  min-width: 0;
}

.analysis-card__rename {
  flex: 1;
}

.analysis-card__name {
  margin: 0;
  overflow: hidden;
  font-size: var(--text-body-size);
  line-height: var(--text-body-line);
  font-weight: var(--weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analysis-card__repo {
  margin: 0;
  color: var(--color-text-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

/* Actions stay in the DOM and keyboard order; they fade in on hover/focus on
   pointer devices and are always visible on touch. */
.analysis-card__actions {
  display: flex;
  flex: none;
  gap: var(--space-1);
  transition: opacity var(--dur-fade-base) var(--ease-out);
}

@media (hover: hover) {
  .analysis-card__actions:not(.analysis-card__actions--always) {
    opacity: 0;
  }
  .analysis-card:hover .analysis-card__actions,
  .analysis-card:focus-within .analysis-card__actions {
    opacity: 1;
  }
}

.analysis-card__meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-7) + var(--space-3)), 1fr));
  gap: var(--space-2) var(--space-3);
  margin: 0;
}

.analysis-card__meta-item {
  display: grid;
  gap: var(--line-thick);
  min-width: 0;
}

.analysis-card__meta-item dd {
  margin: 0;
  overflow: hidden;
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analysis-card__size {
  margin: 0;
  color: var(--color-text-subtle);
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
}
</style>
