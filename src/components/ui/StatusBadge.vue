<script setup lang="ts">
// Status badge (SPEC §6.3 row 12): unclassified / stale / missing / dismissed,
// plus the remaining classification statuses so every row always shows one.
import { computed } from 'vue'
import type { ClassificationStatus } from '../../domain/types'

const props = defineProps<{
  status: ClassificationStatus
  /** sourceStatus === 'missing' (§2.3): absent from the latest refresh. */
  missing?: boolean
  /** In the working list's dismissed set, only ever shown with Show dismissed. */
  dismissed?: boolean
}>()

const STATUS_LABEL: Record<ClassificationStatus, string> = {
  unclassified: 'Unclassified',
  pending: 'Pending',
  done: 'Classified',
  error: 'Error',
  stale: 'Stale',
}

type Variant = ClassificationStatus | 'missing' | 'dismissed'

// Precedence: dismissed > missing > the classification status.
const variant = computed<Variant>(() =>
  props.dismissed ? 'dismissed' : props.missing ? 'missing' : props.status,
)
const label = computed(() => {
  if (variant.value === 'dismissed') return 'Dismissed'
  if (variant.value === 'missing') return 'No longer in source'
  return STATUS_LABEL[props.status]
})
</script>

<template>
  <span class="status-badge" :class="`status-badge--${variant}`" role="img" :aria-label="`Status: ${label}`">
    {{ label }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  height: var(--space-4);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}

.status-badge--stale {
  color: var(--color-warning);
}

.status-badge--error {
  color: var(--color-danger);
}

.status-badge--missing {
  border: var(--line-thin) dashed var(--color-border-strong);
}

.status-badge--dismissed {
  font-style: italic;
  opacity: 0.8;
}
</style>
