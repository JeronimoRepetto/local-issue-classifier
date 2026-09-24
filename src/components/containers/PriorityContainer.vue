<script setup lang="ts">
// The Priority column's Weights popover (Task 14). Drop this into IssueTable's `priority-header` slot:
//   <IssueTable><template #priority-header><PriorityContainer /></template></IssueTable>
// It owns useAnalysis() itself to read/write `working.priorityWeights` — the
// slot needs no scoped props for this — so IssueTable and IssuesContainer
// need no change beyond filling the slot, mirroring how SortPopoverContainer
// owns useFilters() for the Sort popover.
//
// The wrapping `@click.stop` keeps the popover trigger and its panel from
// bubbling a click up to the column `<th>`, which would otherwise toggle the
// table's priority sort (the column-header click behaviour) on
// every slider interaction.
import { computed } from 'vue'
import UiPopover from '../../ui/UiPopover.vue'
import UiButton from '../../ui/UiButton.vue'
import UiTooltip from '../../ui/UiTooltip.vue'
import WeightEditor from '../ui/WeightEditor.vue'
import type { WeightExampleRow } from '../ui/WeightEditor.vue'
import IconSettings from '../../assets/icons/IconSettings.vue'
import { useAnalysis } from '../../composables/useAnalysis'
import { defaultPriorityWeights } from '../../domain/types'
import type { PriorityWeights } from '../../domain/types'

const TRIGGER_LABEL = 'Adjust priority weights'

const analysis = useAnalysis()

const weights = computed<PriorityWeights>(() => analysis.current.value?.working.priorityWeights ?? defaultPriorityWeights())

/** The Weights popover's live example: the first classified row, if any. */
const exampleRow = computed<WeightExampleRow | null>(() => {
  const row = analysis.current.value?.rows.find((r) => r.classification)
  return row?.classification ? { number: row.issue.number, classification: row.classification } : null
})

function onUpdate(next: PriorityWeights): void {
  analysis.updateWorking({ priorityWeights: next })
}
</script>

<template>
  <span class="priority-container">
    <span class="priority-container__label">Priority</span>
    <span class="priority-container__weights" @click.stop>
      <UiPopover label="Priority weights" align="end">
        <template #trigger="{ toggle, attrs }">
          <UiTooltip :text="TRIGGER_LABEL">
            <template #default="{ describedBy }">
              <UiButton
                data-test="weight-editor-trigger"
                variant="ghost"
                size="compact"
                icon-only
                :aria-label="TRIGGER_LABEL"
                :aria-describedby="describedBy"
                v-bind="attrs"
                @click="toggle"
              >
                <template #icon><IconSettings aria-hidden="true" /></template>
              </UiButton>
            </template>
          </UiTooltip>
        </template>
        <template #default>
          <WeightEditor :weights="weights" :example-row="exampleRow" @update="onUpdate" />
        </template>
      </UiPopover>
    </span>
  </span>
</template>

<style scoped>
.priority-container {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
