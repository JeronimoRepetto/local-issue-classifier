<script setup lang="ts">
// The table's "Sort" popover (Task 13, SPEC.md §2.5 item 3): "A 'Sort'
// popover reuses SortRuleList to edit the full ordered key list." Drop this
// into IssuesContainer's `sort-popover` slot:
//   <IssuesContainer><template #sort-popover><SortPopoverContainer /></template></IssuesContainer>
// It owns useFilters() itself for the full multi-key tableSort — the slot's
// own `sort`/`setSort` scoped props are single-key only (kept for simpler
// consumers) — so IssuesContainer needs no change for this wiring.
import UiPopover from '../../ui/UiPopover.vue'
import UiButton from '../../ui/UiButton.vue'
import SortRuleList from '../ui/SortRuleList.vue'
import IconSort from '../../assets/icons/IconSort.vue'
import { useFilters } from '../../composables/useFilters'

const filters = useFilters()
</script>

<template>
  <UiPopover label="Sort">
    <template #trigger="{ toggle, attrs }">
      <UiButton data-test="sort-popover-trigger" variant="ghost" v-bind="attrs" @click="toggle">
        <template #icon><IconSort aria-hidden="true" /></template>
        Sort
      </UiButton>
    </template>
    <template #default>
      <SortRuleList :rules="filters.tableSort.value" @update="filters.setTableSort" />
    </template>
  </UiPopover>
</template>
