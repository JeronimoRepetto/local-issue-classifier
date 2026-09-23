<script setup lang="ts">
// TODO(INT): replace with Task 12's IssuesContainer.vue once it lands. Shows
// just enough of the current analysis (name, repo) to prove useView/useRepo
// wiring, and a way back to Home.
import { computed } from 'vue'
import { useAnalysis } from '../../composables/useAnalysis'
import { useView } from '../../composables/useView'
import UiButton from '../../ui/UiButton.vue'

const analysis = useAnalysis()
const view = useView()
const current = computed(() => analysis.current.value)
</script>

<template>
  <section class="analysis-view-placeholder" data-test="analysis-view-placeholder">
    <h1 class="u-pixel-font">{{ current?.name ?? 'Analysis' }}</h1>
    <p v-if="current">{{ current.repo.fullName }} · {{ current.rows.length }} issues loaded.</p>
    <p>The Issues table, filters, Classify and Export land with Tasks 11-13. Nothing to do here yet.</p>
    <UiButton variant="secondary" @click="view.goHome()">Back to Analyses</UiButton>
  </section>
</template>

<style scoped>
.analysis-view-placeholder {
  display: grid;
  gap: var(--space-3);
  max-width: calc(var(--space-7) * 15);
  margin: 0 auto;
  padding: var(--space-4);
}
</style>
