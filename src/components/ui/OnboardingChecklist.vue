<script setup lang="ts">
// The Home first-run checklist (SPEC §10.1): "1 Keys → 2 Repository → 3
// Classify", stays until each step has been completed once.
import { computed } from 'vue'
import IconCheck from '../../assets/icons/IconCheck.vue'

export interface OnboardingSteps {
  keys: boolean
  repo: boolean
  classify: boolean
}

const props = defineProps<{ steps: OnboardingSteps }>()

const items = computed(() => [
  { key: 'keys' as const, index: 1, label: 'Keys', done: props.steps.keys },
  { key: 'repo' as const, index: 2, label: 'Repository', done: props.steps.repo },
  { key: 'classify' as const, index: 3, label: 'Classify', done: props.steps.classify },
])

const allDone = computed(() => items.value.every((i) => i.done))
</script>

<template>
  <ol v-if="!allDone" class="onboarding-checklist" data-test="onboarding-checklist">
    <li
      v-for="item in items"
      :key="item.key"
      class="onboarding-checklist__item"
      :class="{ 'onboarding-checklist__item--done': item.done }"
    >
      <span class="onboarding-checklist__badge" aria-hidden="true">
        <IconCheck v-if="item.done" />
        <span v-else>{{ item.index }}</span>
      </span>
      <span>{{ item.label }}</span>
    </li>
  </ol>
</template>

<style scoped>
.onboarding-checklist {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.onboarding-checklist__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  text-transform: lowercase;
}

.onboarding-checklist__item + .onboarding-checklist__item::before {
  content: '';
  width: var(--space-3);
  height: var(--line-thin);
  margin-right: var(--space-1);
  background: var(--color-border);
}

.onboarding-checklist__item--done {
  color: var(--color-success);
}

.onboarding-checklist__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--icon-sm) + var(--space-1));
  height: calc(var(--icon-sm) + var(--space-1));
  border: var(--line-thin) solid var(--color-border-strong);
  border-radius: var(--radius-round);
  font-size: var(--text-micro-size);
}

.onboarding-checklist__item--done .onboarding-checklist__badge {
  border-color: currentColor;
}

.onboarding-checklist__badge :deep(svg) {
  width: calc(var(--icon-sm) - var(--space-1));
  height: calc(var(--icon-sm) - var(--space-1));
}
</style>
