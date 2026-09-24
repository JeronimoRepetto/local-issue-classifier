<script setup lang="ts">
// Priority cell: 0-100 with a bar, reusing the
// ScoreBar kit component (which already renders "—" for null), plus a
// tooltip caption explaining the inversion and the ranking-aid, ordinal
// nature of the score. Presentational: props only.
import ScoreBar from '../../ui/ScoreBar.vue'
import UiTooltip from '../../ui/UiTooltip.vue'

defineProps<{ value: number | null }>()

const CAPTION =
  'Priority combines criticality, relevance, complexity and effort with your weights. ' +
  'Lower complexity and lower effort raise priority. It is a ranking aid, not a measurement.'
</script>

<template>
  <UiTooltip :text="CAPTION">
    <template #default="{ describedBy }">
      <span data-test="priority-value" :aria-describedby="describedBy">
        <ScoreBar :value="value" label="Priority" />
      </span>
    </template>
  </UiTooltip>
</template>
