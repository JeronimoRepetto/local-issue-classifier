<script setup lang="ts">
// GPU vs CPU readout for a local server (docs/local-providers.md "GPU or
// CPU"): renders domain/localDevice.ts's localDeviceAdvice() as UiCallouts,
// with the CUDA torch step as a copyable command. Presentational; shared by
// Home's ProviderOnboardingCard and Settings' ProviderSelector so the two
// always say the same thing.
import UiCallout from '../../ui/UiCallout.vue'
import CopyCommandLine from './CopyCommandLine.vue'
import type { DeviceAdvice } from '../../domain/localDevice'

defineProps<{ advice: readonly DeviceAdvice[] }>()
</script>

<template>
  <div v-if="advice.length" class="local-device-callouts" data-test="local-device-callouts">
    <UiCallout
      v-for="item in advice"
      :key="item.id"
      :tone="item.tone"
      :title="item.title"
      :data-test="`device-callout-${item.id}`"
    >
      <p class="local-device-callouts__text">{{ item.text }}</p>
      <CopyCommandLine v-if="item.command" :id="item.id" :command="item.command" />
    </UiCallout>
  </div>
</template>

<style scoped>
.local-device-callouts {
  display: grid;
  gap: var(--space-2);
}

.local-device-callouts__text {
  margin: 0 0 var(--space-1);
}
</style>
