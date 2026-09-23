<script setup lang="ts">
// Key status indicator (SPEC §6.1 top bar / §10.4): "Jev key: in memory /
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
  gap: var(--space-3);
}

.key-status__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
}

.key-status__item--set {
  color: var(--color-success);
}
</style>
