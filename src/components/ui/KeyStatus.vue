<script setup lang="ts">
// Key status indicator: "Jev key: in memory /
// missing", "GitHub: token / anonymous". Booleans only — it never receives or
// renders the secret value itself.
import IconKey from '../../assets/icons/IconKey.vue'

defineProps<{ jevKeySet: boolean; githubTokenSet: boolean }>()
</script>

<template>
  <div class="key-status">
    <span class="key-status__item" :class="{ 'key-status__item--set': jevKeySet }">
      <IconKey aria-hidden="true" />
      Jev key: {{ jevKeySet ? 'in memory' : 'missing' }}
    </span>
    <span class="key-status__item" :class="{ 'key-status__item--set': githubTokenSet }">
      <IconKey aria-hidden="true" />
      GitHub: {{ githubTokenSet ? 'token' : 'anonymous' }}
    </span>
  </div>
</template>

<style scoped>
.key-status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.key-status__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--size-compact);
  padding: 0 var(--space-2h) 0 var(--space-2);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-round);
  color: var(--color-text-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.key-status__item :deep(svg) {
  width: calc(var(--icon-sm) - var(--space-1));
  height: calc(var(--icon-sm) - var(--space-1));
}

.key-status__item--set {
  color: var(--color-success);
}
</style>
