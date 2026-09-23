<script setup lang="ts">
// One themed column of the kit page: every token group and component, in every
// state that can be shown statically. Hover, focus-visible and active are live.
import { ref } from 'vue'
import * as icons from '../assets/icons'
import { ICON_NAMES } from '../assets/icons'
import { contrastRatio } from './contrast'
import { COLOR_ROLES, tokens } from './tokens'
import type { ThemeName } from './tokens'
import UiButton from './UiButton.vue'
import UiInput from './UiInput.vue'
import UiSecretInput from './UiSecretInput.vue'
import UiSelect from './UiSelect.vue'
import UiMultiSelect from './UiMultiSelect.vue'
import UiSlider from './UiSlider.vue'
import UiDialog from './UiDialog.vue'
import UiPopover from './UiPopover.vue'
import UiTooltip from './UiTooltip.vue'
import UiToast from './UiToast.vue'
import UiToastStack from './UiToastStack.vue'
import type { ToastItem } from './UiToastStack.vue'
import LevelBadge from './LevelBadge.vue'
import ConfidenceBadge from './ConfidenceBadge.vue'
import ScoreBar from './ScoreBar.vue'
import EmptyState from './EmptyState.vue'
import FilterChip from './FilterChip.vue'
import UiSegmented from './UiSegmented.vue'

const props = defineProps<{ theme: ThemeName }>()

const palette = tokens.color[props.theme]
const ratio = (role: (typeof COLOR_ROLES)[number]) =>
  contrastRatio(palette[role], palette.surface).toFixed(2)

const text = ref('acme/widgets')
const search = ref('')
const secret = ref('jev_example_not_a_real_key')
const select = ref('updated')
const labels = ref(['bug'])
const weight = ref(40)
const chipActive = ref(true)
const issueState = ref('open')
const format = ref('csv')
const dialogOpen = ref(false)
const destructiveOpen = ref(false)
const toasts = ref<ToastItem[]>([])
let toastId = 0

function pushToast(kind: ToastItem['kind']) {
  toastId += 1
  toasts.value = [
    ...toasts.value,
    { id: toastId, kind, message: `Toast #${toastId} (${kind})`, actionLabel: kind === 'info' ? 'Undo' : undefined },
  ]
}

const dismissToast = (id: ToastItem['id']) => {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

const sortOptions = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'priority', label: 'Priority' },
  { value: 'criticality', label: 'Criticality' },
  { value: 'number', label: 'Issue number', disabled: true },
]
const stateOptions = [
  { value: 'open', label: 'open' },
  { value: 'closed', label: 'closed' },
  { value: 'all', label: 'all' },
]
const formatOptions = [
  { value: 'csv', label: 'csv' },
  { value: 'json', label: 'json' },
  { value: 'md', label: 'markdown' },
]

/** Density specimen rows: fixed sample data, rendered with kit parts only. */
const sampleRows = [
  { number: 4312, title: 'Hydration mismatch when a slot renders conditionally', labels: ['bug', 'ssr'], priority: 82, criticality: 'high', effort: 'medium', relevance: 71, updated: '2d' },
  { number: 4290, title: 'Docs: typo in the reactivity guide', labels: ['docs'], priority: 12, criticality: 'low', effort: 'low', relevance: 20, updated: '9d' },
  { number: 4288, title: 'Transition group leaks listeners on fast toggles', labels: ['bug'], priority: 57, criticality: 'medium', effort: 'high', relevance: 48, updated: '3w' },
] as const
const spaceKeys = ['1', '2', '2h', '3', '4', '5', '6', '7'] as const

const labelOptions = [
  { value: 'bug', label: 'bug' },
  { value: 'docs', label: 'documentation' },
  { value: 'perf', label: 'performance' },
  { value: 'good-first', label: 'good first issue' },
]
</script>

<template>
  <div class="kit-showcase">
    <section class="kit-section">
      <h2>Color roles</h2>
      <ul class="kit-swatches">
        <li v-for="role in COLOR_ROLES" :key="role" class="kit-swatch">
          <span class="kit-swatch__chip" :style="{ background: `var(--color-${role})` }" />
          <code>{{ role }}</code>
          <span class="kit-muted u-mono">{{ palette[role] }} · {{ ratio(role) }}</span>
        </li>
      </ul>
    </section>

    <section class="kit-section">
      <h2>Typography</h2>
      <p class="kit-logo" data-kit-type="pixel">
        <component :is="icons.IconLogo" class="kit-logo__mark" />
        <span class="u-pixel-font">local-issue-classifier</span>
        <span class="kit-muted">Geist Pixel · wordmark, one page heading</span>
      </p>
      <p data-kit-type="sans" class="kit-type-body">Geist Sans · prose, titles and controls</p>
      <p data-kit-type="mono" class="kit-type-mono">Geist Mono · 4312 · 82/100 · 2026-09-23 · 1.2 MB</p>
      <p v-for="step in ['h1', 'h2', 'h3', 'body', 'table', 'caption'] as const" :key="step" :class="`kit-type-${step}`">
        {{ step }} · {{ tokens.type[step].size }}/{{ tokens.type[step].lineHeight }} · The quick brown fox, 0123456789
      </p>
      <p class="u-micro">micro · {{ tokens.type.micro.size }}/{{ tokens.type.micro.lineHeight }} · column header</p>
    </section>

    <section class="kit-section">
      <h2>Spacing, radii, elevation</h2>
      <div class="kit-row">
        <span v-for="n in spaceKeys" :key="n" class="kit-space" :style="{ width: `var(--space-${n})` }" :title="`space-${n}`" />
      </div>
      <div class="kit-row">
        <span v-for="r in ['xs', 'sm', 'md', 'lg', 'round']" :key="r" class="kit-radius" :style="{ borderRadius: `var(--radius-${r})` }">{{ r }}</span>
      </div>
      <div class="kit-row">
        <span v-for="e in 3" :key="e" class="kit-elev" :style="{ boxShadow: `var(--elev-${e})` }">elev-{{ e }}</span>
      </div>
    </section>

    <section class="kit-section">
      <h2>Icons (16 / 20 / 32)</h2>
      <ul class="kit-icons">
        <li v-for="name in ICON_NAMES" :key="name" data-kit-icon :title="name">
          <component :is="icons[name]" width="16" height="16" />
          <component :is="icons[name]" width="20" height="20" />
          <component :is="icons[name]" width="32" height="32" />
          <code>{{ name.replace('Icon', '') }}</code>
        </li>
      </ul>
    </section>

    <section class="kit-section">
      <h2>Buttons</h2>
      <div v-for="variant in ['primary', 'secondary', 'ghost', 'danger'] as const" :key="variant" class="kit-row">
        <UiButton :variant="variant" size="compact">{{ variant }} 28</UiButton>
        <UiButton :variant="variant">{{ variant }} 32</UiButton>
        <UiButton :variant="variant" size="large">{{ variant }} 40</UiButton>
        <UiButton :variant="variant" disabled>Disabled</UiButton>
        <UiButton :variant="variant" loading>Loading</UiButton>
        <UiButton :variant="variant" icon-only aria-label="Settings">
          <template #icon><icons.IconSettings /></template>
        </UiButton>
      </div>
      <div class="kit-row">
        <UiButton variant="primary"><template #icon><icons.IconPlus /></template>New analysis</UiButton>
        <UiButton><template #icon><icons.IconDownload /></template>Export</UiButton>
        <UiButton variant="ghost"><template #icon><icons.IconRefresh /></template>Refresh</UiButton>
      </div>
    </section>

    <section class="kit-section kit-grid">
      <h2>Inputs</h2>
      <UiInput v-model="text" label="Repository" placeholder="owner/name or URL" hint="Public or private repositories" />
      <UiInput v-model="search" label="Search" type="search" placeholder="Search issues" clearable>
        <template #prefix><icons.IconSearch /></template>
      </UiInput>
      <UiInput model-value="not a repo" label="Repository (error)" error="Enter owner/name or a github.com URL." />
      <UiInput model-value="acme/widgets" label="Repository (disabled)" disabled />
    </section>

    <section class="kit-section kit-grid">
      <h2>Secret input</h2>
      <UiSecretInput v-model="secret" label="Jev API key" testable status="untested">
        <template #help>Create a key in the TypeSafe dashboard, then paste it here.</template>
      </UiSecretInput>
      <UiSecretInput model-value="checking" label="Jev API key (checking)" testable status="checking" />
      <UiSecretInput model-value="ok" label="GitHub token (ok)" status="ok" />
      <UiSecretInput model-value="bad" label="GitHub token (invalid)" status="invalid" />
      <UiSecretInput model-value="" label="GitHub token (empty, disabled)" disabled />
    </section>

    <section class="kit-section kit-grid">
      <h2>Select, multi-select, slider</h2>
      <UiSelect v-model="select" label="Sort by" :options="sortOptions" />
      <UiSelect model-value="updated" label="Sort by (disabled)" :options="sortOptions" disabled />
      <UiMultiSelect v-model="labels" label="Labels" :options="labelOptions" />
      <UiMultiSelect :model-value="[]" label="Labels (disabled)" :options="labelOptions" disabled />
      <UiSlider v-model="weight" label="Criticality weight" :value-text="(v: number) => `${v} percent`" />
      <UiSlider :model-value="15" label="Effort weight (disabled)" disabled />
    </section>

    <section class="kit-section">
      <h2>Badges and bars</h2>
      <div class="kit-row">
        <LevelBadge level="high" dimension="Criticality" />
        <LevelBadge level="medium" dimension="Complexity" />
        <LevelBadge level="low" dimension="Cost" />
        <LevelBadge level="high" dimension="Criticality" stale />
        <LevelBadge level="low" dimension="Cost" stale />
      </div>
      <div class="kit-row">
        <ConfidenceBadge :confidence="0.91" :probabilities="{ high: 0.91, medium: 0.07, low: 0.02 }" />
        <ConfidenceBadge :confidence="0.64" :probabilities="{ high: 0.64, medium: 0.3, low: 0.06 }" />
        <ConfidenceBadge :confidence="0.38" :probabilities="{ high: 0.38, medium: 0.35, low: 0.27 }" />
      </div>
      <div class="kit-bars">
        <ScoreBar v-for="v in [0, 15, 38, 55, 82, 100]" :key="v" :value="v" label="Priority" />
        <ScoreBar :value="null" label="Relevance" />
      </div>
    </section>

    <section class="kit-section">
      <h2>Filter chips</h2>
      <div class="kit-row">
        <FilterChip label="Unclassified" />
        <FilterChip label="High criticality" :active="chipActive" @toggle="chipActive = !chipActive" />
        <FilterChip label="label: bug" active removable />
        <FilterChip label="3 filters" summary>
          <template #icon><icons.IconFilter /></template>
        </FilterChip>
        <FilterChip label="Disabled" disabled />
      </div>
    </section>

    <section class="kit-section">
      <h2>Segmented control</h2>
      <div class="kit-row">
        <UiSegmented v-model="issueState" label="Issue state" :options="stateOptions" />
        <UiSegmented v-model="format" label="Export format" :options="formatOptions" size="compact" />
      </div>
    </section>

    <section class="kit-section">
      <h2>Density (real size)</h2>
      <div class="kit-density">
        <table class="ui-table">
          <thead>
            <tr>
              <th class="ui-table__th" scope="col">#</th>
              <th class="ui-table__th" scope="col">Title</th>
              <th class="ui-table__th" scope="col">Priority</th>
              <th class="ui-table__th" scope="col">Criticality</th>
              <th class="ui-table__th" scope="col">Effort</th>
              <th class="ui-table__th" scope="col">Relevance</th>
              <th class="ui-table__th" scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sampleRows" :key="row.number" class="ui-table__row">
              <td class="ui-table__td ui-table__td--mono">{{ row.number }}</td>
              <td class="ui-table__td ui-table__td--title">
                <span class="kit-density__title">{{ row.title }}</span>
                <span v-for="l in row.labels" :key="l" class="kit-density__label">{{ l }}</span>
              </td>
              <td class="ui-table__td"><ScoreBar :value="row.priority" label="Priority" /></td>
              <td class="ui-table__td"><LevelBadge :level="row.criticality" dimension="Criticality" /></td>
              <td class="ui-table__td"><LevelBadge :level="row.effort" dimension="Effort" /></td>
              <td class="ui-table__td"><ScoreBar :value="row.relevance" label="Relevance" :bar="false" /></td>
              <td class="ui-table__td ui-table__td--mono">{{ row.updated }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="kit-section">
      <h2>Tooltip, popover, dialog</h2>
      <div class="kit-row">
        <UiTooltip text="Shown after 300 ms on hover or focus">
          <template #default="{ describedBy }">
            <UiButton variant="ghost" :aria-describedby="describedBy"><template #icon><icons.IconInfo /></template>Hover me</UiButton>
          </template>
        </UiTooltip>
        <UiPopover label="Priority weights">
          <template #trigger="{ toggle, attrs }">
            <UiButton v-bind="attrs" @click="toggle"><template #icon><icons.IconSort /></template>Weights</UiButton>
          </template>
          <UiSlider v-model="weight" label="Criticality weight" />
        </UiPopover>
        <UiButton @click="dialogOpen = true">Open dialog</UiButton>
        <UiButton variant="danger" @click="destructiveOpen = true"><template #icon><icons.IconTrash /></template>Clear all data</UiButton>
      </div>
      <UiDialog :open="dialogOpen" title="Keyboard shortcuts" description="Every action is reachable from the keyboard." :teleport-to="`#kit-dialogs-${theme}`" @close="dialogOpen = false">
        <p>Press <kbd>/</kbd> to search and <kbd>?</kbd> to open this dialog.</p>
        <template #actions>
          <UiButton variant="primary" @click="dialogOpen = false">Got it</UiButton>
        </template>
      </UiDialog>
      <UiDialog :open="destructiveOpen" title="Clear all local data" description="Removes every saved analysis and your preferences." confirm-phrase="delete" confirm-label="Clear all" :teleport-to="`#kit-dialogs-${theme}`" @close="destructiveOpen = false" @confirm="destructiveOpen = false" />
      <div :id="`kit-dialogs-${theme}`" />
    </section>

    <section class="kit-section kit-grid">
      <h2>Toasts</h2>
      <UiToast kind="success" message="Analysis saved" :duration="0" />
      <UiToast kind="info" message="Issue dismissed" action-label="Undo" :duration="0" />
      <UiToast kind="warning" message="Storage is 85% full" :duration="0" />
      <UiToast kind="error" message="GitHub rate limit reached" />
      <div class="kit-row">
        <UiButton v-for="kind in ['success', 'info', 'warning', 'error'] as const" :key="kind" size="compact" @click="pushToast(kind)">Push {{ kind }}</UiButton>
      </div>
      <UiToastStack :toasts="toasts" @dismiss="dismissToast" @action="dismissToast" />
    </section>

    <section class="kit-section">
      <h2>Empty and error states</h2>
      <EmptyState title="No analyses yet" description="Load a repository to see its issues scored.">
        <template #action><UiButton variant="primary">New analysis</UiButton></template>
      </EmptyState>
      <EmptyState tone="error" title="Could not load" description="GitHub did not answer. Check your connection and try again.">
        <template #action><UiButton><template #icon><icons.IconRefresh /></template>Retry</UiButton></template>
      </EmptyState>
    </section>
  </div>
</template>

<style scoped>
.kit-showcase {
  display: grid;
}

/* Sections are hairline-separated blocks, not cards. */
.kit-section {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) 0;
  border-bottom: var(--line-thin) solid var(--color-border);
}

.kit-section h2 {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
  letter-spacing: var(--tracking-micro);
  text-transform: uppercase;
  font-weight: var(--weight-regular);
  color: var(--color-text-subtle);
}

.kit-grid {
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-7) * 4), 1fr));
}

.kit-grid h2 {
  grid-column: 1 / -1;
}

.kit-grid > * {
  min-width: 0;
}

.kit-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.kit-muted {
  color: var(--color-text-subtle);
  font-size: var(--text-caption-size);
}

.kit-type-mono {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  color: var(--color-text-muted);
}

.kit-density {
  overflow-x: auto;
}

.kit-density__title {
  margin-right: var(--space-2);
}

.kit-density__label {
  display: inline-block;
  margin-right: var(--space-1);
  padding: 0 var(--space-1);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-xs);
  color: var(--color-text-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
}

.kit-swatches,
.kit-icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-7) * 3), 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.kit-swatch {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: var(--space-2);
  align-items: center;
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.kit-swatch__chip {
  grid-row: span 2;
}

.kit-swatch__chip {
  width: var(--space-4);
  height: var(--space-4);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-sm);
}

.kit-icons li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: var(--text-caption-size);
}

.kit-logo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-h2-size);
  line-height: var(--text-h2-line);
}

.kit-logo__mark {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-accent);
}

.kit-type-h1,
.kit-type-h2,
.kit-type-h3,
.kit-type-body,
.kit-type-table,
.kit-type-caption {
  margin: 0;
}

.kit-type-h1 {
  font-size: var(--text-h1-size);
  line-height: var(--text-h1-line);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
}
.kit-type-h2 {
  font-size: var(--text-h2-size);
  line-height: var(--text-h2-line);
  font-weight: var(--weight-medium);
}
.kit-type-h3 {
  font-size: var(--text-h3-size);
  line-height: var(--text-h3-line);
  font-weight: var(--weight-medium);
}
.kit-type-body {
  font-size: var(--text-body-size);
  line-height: var(--text-body-line);
}
.kit-type-table {
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  font-variant-numeric: tabular-nums;
}
.kit-type-caption {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.kit-space {
  height: var(--space-4);
  background: var(--color-accent-soft);
  border: var(--line-thin) solid var(--color-accent);
}

.kit-radius,
.kit-elev {
  display: grid;
  place-items: center;
  width: calc(var(--space-7) + var(--space-5));
  height: var(--space-6);
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  color: var(--color-text-muted);
}

.kit-elev {
  background: var(--color-surface);
  border-color: transparent;
  border-radius: var(--radius-md);
}

.kit-bars {
  display: grid;
  gap: var(--space-2);
  max-width: calc(var(--space-7) * 4);
}
</style>
