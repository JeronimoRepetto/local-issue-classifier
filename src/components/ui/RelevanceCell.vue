<script setup lang="ts">
// Relevance cell (SPEC §6.3 column 6): 0-100 with a bar, reusing the ScoreBar
// kit component, which already renders "—" for a null (unclassified) value.
import { computed } from 'vue'
import ScoreBar from '../../ui/ScoreBar.vue'
import type { RelevanceResult } from '../../domain/types'

const props = defineProps<{ value: RelevanceResult | null }>()

const value = computed(() => props.value?.value ?? null)
</script>

<template>
  <ScoreBar :value="value" label="Relevance" />
</template>
