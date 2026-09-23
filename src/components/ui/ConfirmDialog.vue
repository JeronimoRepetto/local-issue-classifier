<script setup lang="ts">
// A thin ConfirmDialog over the kit's UiDialog (SPEC §6.2 / §10.4): a plain
// "are you sure?" confirm, or — when `confirmPhrase` is set — the typed
// confirmation variant used for Clear all local data (SPEC §8).
import UiButton from '../../ui/UiButton.vue'
import UiDialog from '../../ui/UiDialog.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    confirmPhrase?: string
    confirmLabel?: string
    cancelLabel?: string
  }>(),
  { confirmLabel: 'Delete', cancelLabel: 'Cancel' },
)

const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <UiDialog
    :open="open"
    :title="title"
    :description="description"
    :confirm-phrase="confirmPhrase"
    :confirm-label="confirmLabel"
    :cancel-label="cancelLabel"
    @close="emit('close')"
    @confirm="emit('confirm')"
  >
    <slot />
    <template v-if="!confirmPhrase" #actions>
      <UiButton variant="ghost" @click="emit('close')">{{ cancelLabel }}</UiButton>
      <UiButton data-test="confirm-dialog-confirm" variant="danger" @click="emit('confirm')">
        {{ confirmLabel }}
      </UiButton>
    </template>
  </UiDialog>
</template>
