<script setup lang="ts">
// "Your computer" hardware summary (layout change, user decisions
// 2026-09-24): extracted from ProviderOnboardingCard.vue's inline hardware
// box so it can render as its own bordered sibling panel on Home instead of
// living inside the provider card. Presentational: props in, event out. It
// never calls useHardwareDetection() itself — the container (HomeContainer)
// owns the passive, cached detection run and passes the resulting report
// down, so no second independent scan or benchmark ever runs here.
import { computed } from 'vue'
import UiButton from '../../ui/UiButton.vue'
import { fitTiers } from '../../domain/hardware'
import type { HardwareReport, TierVerdictKind } from '../../domain/hardware'

const props = defineProps<{ report: HardwareReport | null }>()
const emit = defineEmits<{ 'open-settings': [] }>()

const detecting = computed(() => props.report === null)
const fit = computed(() => (props.report ? fitTiers(props.report) : null))

const gpu = computed(() => {
  const g = props.report?.gpu
  if (!g) return ''
  if (!g.model) return 'Unknown GPU — set it in Settings'
  return g.vramGb !== null ? `${g.model} · ${g.vramGb} GB` : g.model
})

const ram = computed(() => {
  const report = props.report
  if (!report || report.ramGb === null) return 'RAM: unknown'
  return `${report.ramIsLowerBound ? '≥ ' : ''}${report.ramGb} GB RAM`
})

const cpu = computed(() => {
  const threads = props.report?.cpuThreads
  return threads === null || threads === undefined ? 'CPU: unknown' : `${threads} CPU threads`
})

// Same short verdict labels as HardwareFitPanel.vue's VERDICT_TEXT; duplicated
// (rather than imported from there) since HardwareFitPanel belongs to a
// parallel lane in this worktree.
const TIER_VERDICT_TEXT: Record<TierVerdictKind, string> = {
  ok: 'Fits',
  tight: 'Tight',
  no: "Won't fit",
  unknown: 'Unknown',
}

const recommendation = computed(() => {
  const f = fit.value
  if (!f) return ''
  const name =
    f.recommendation.tier === 'cloud' ? 'Cloud API' : (f.tiers.find((t) => t.id === f.recommendation.tier)?.label ?? '')
  return `Recommended: ${name}. ${f.recommendation.reason}`
})

function openSettings(): void {
  emit('open-settings')
}
</script>

<template>
  <aside class="hardware-summary" data-test="hardware-summary-panel" aria-labelledby="hardware-summary-title">
    <h3 id="hardware-summary-title" class="hardware-summary__title">Your computer</h3>
    <p v-if="detecting" class="hardware-summary__muted" data-test="hardware-box-detecting" role="status">
      Detecting…
    </p>
    <template v-else>
      <dl class="hardware-summary__facts">
        <div>
          <dt>GPU</dt>
          <dd data-test="hardware-box-gpu">{{ gpu }}</dd>
        </div>
        <div>
          <dt>RAM</dt>
          <dd data-test="hardware-box-ram">{{ ram }}</dd>
        </div>
        <div>
          <dt>CPU</dt>
          <dd data-test="hardware-box-cpu">{{ cpu }}</dd>
        </div>
      </dl>
      <ul class="hardware-summary__chips">
        <li
          v-for="tier in fit?.tiers ?? []"
          :key="tier.id"
          class="hardware-summary__chip"
          :class="`hardware-summary__chip--${tier.verdict}`"
          :data-test="`hardware-box-tier-${tier.id}`"
        >
          {{ tier.label }} · {{ TIER_VERDICT_TEXT[tier.verdict] }}
        </li>
      </ul>
      <p class="hardware-summary__recommendation" data-test="hardware-box-recommendation">
        {{ recommendation }}
      </p>
    </template>
    <UiButton data-test="hardware-box-settings-link" variant="ghost" size="compact" @click="openSettings">
      Details in Settings
    </UiButton>
  </aside>
</template>

<style scoped>
p {
  margin: 0;
}

.hardware-summary {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding: var(--space-3);
  background: var(--color-surface);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-md);
}

.hardware-summary__title {
  margin: 0;
  font-size: var(--text-caption-size);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

.hardware-summary__facts {
  display: grid;
  gap: var(--space-1);
  margin: 0;
}

.hardware-summary__facts dt {
  display: none;
}

.hardware-summary__facts dd {
  margin: 0;
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text);
}

.hardware-summary__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.hardware-summary__chip {
  padding: 0 var(--space-1);
  border: var(--line-thin) solid currentColor;
  border-radius: var(--radius-round);
  font-size: var(--text-micro-size);
  line-height: var(--text-caption-line);
  white-space: nowrap;
}

.hardware-summary__chip--ok {
  color: var(--color-success);
}

.hardware-summary__chip--tight {
  color: var(--color-warning);
}

.hardware-summary__chip--no {
  color: var(--color-danger);
}

.hardware-summary__chip--unknown {
  color: var(--color-text-muted);
}

.hardware-summary__recommendation {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.hardware-summary .ui-button {
  justify-self: start;
}
</style>
