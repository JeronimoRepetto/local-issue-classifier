<script setup lang="ts">
// Status badge: unclassified / stale / missing / dismissed,
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
/* Mono label with a leading status dot; color is never the only signal. */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  text-transform: lowercase;
  white-space: nowrap;
  color: var(--color-text-muted);
}

.status-badge::before {
  content: '';
  width: calc(var(--space-1) + var(--line-thick));
  height: calc(var(--space-1) + var(--line-thick));
  border-radius: var(--radius-round);
  background: currentColor;
  opacity: 0.8;
}

.status-badge--unclassified,
.status-badge--pending {
  color: var(--color-text-subtle);
}

.status-badge--done {
  color: var(--color-success);
}

.status-badge--stale {
  color: var(--color-warning);
}

.status-badge--error {
  color: var(--color-danger);
}

.status-badge--missing::before {
  background: transparent;
  box-shadow: inset 0 0 0 var(--line-thin) currentColor;
}

.status-badge--dismissed {
  font-style: italic;
  color: var(--color-text-subtle);
}
</style>
