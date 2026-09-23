<script setup lang="ts">
// Secret field (SPEC §10.4). It never persists anything itself: the value flows
// through v-model only, and the browser is told not to remember it.
import { computed, ref, useId } from 'vue'
import UiButton from './UiButton.vue'
import IconEye from '../assets/icons/IconEye.vue'
import IconEyeOff from '../assets/icons/IconEyeOff.vue'
import IconClose from '../assets/icons/IconClose.vue'
import IconCheck from '../assets/icons/IconCheck.vue'
import IconWarning from '../assets/icons/IconWarning.vue'

export type SecretStatus = 'untested' | 'checking' | 'ok' | 'invalid'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    placeholder?: string
    hint?: string
    status?: SecretStatus
    /** Overrides the default status sentence, e.g. the server's error text. */
    statusMessage?: string
    /** Shows a Test button that emits `test`. */
    testable?: boolean
    disabled?: boolean
  }>(),
  { hint: 'Kept in memory only' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; clear: []; test: [] }>()

const STATUS_TEXT: Record<SecretStatus, string> = {
  untested: 'Not tested yet',
  checking: 'Checking…',
  ok: 'Key works',
  invalid: 'Key rejected',
}

const revealed = ref(false)
const id = `secret-${useId()}`
const hintId = `${id}-hint`
const statusId = `${id}-status`
const describedBy = computed(() => [hintId, props.status ? statusId : ''].filter(Boolean).join(' '))

function clear() {
  revealed.value = false
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<template>
  <div class="ui-field ui-secret">
    <label class="ui-field__label" :for="id">{{ label }}</label>
    <div class="ui-secret__row">
      <div class="ui-control" :class="{ 'ui-control--invalid': status === 'invalid' }">
        <input
          :id="id"
          class="ui-control__input ui-secret__input"
          :type="revealed ? 'text' : 'password'"
          :value="modelValue"
          :placeholder="placeholder"
          :disabled="disabled"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :aria-invalid="status === 'invalid' ? 'true' : undefined"
          :aria-describedby="describedBy"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
        <UiButton
          data-test="reveal"
          variant="ghost"
          size="compact"
          icon-only
          :aria-pressed="revealed ? 'true' : 'false'"
          :aria-label="`${revealed ? 'Hide' : 'Show'} ${label}`"
          :disabled="disabled"
          @click="revealed = !revealed"
        >
          <template #icon>
            <IconEyeOff v-if="revealed" />
            <IconEye v-else />
          </template>
        </UiButton>
        <UiButton
          data-test="clear"
          variant="ghost"
          size="compact"
          icon-only
          :aria-label="`Clear ${label}`"
          :disabled="disabled || !modelValue"
          @click="clear"
        >
          <template #icon><IconClose /></template>
        </UiButton>
      </div>
      <UiButton
        v-if="testable"
        data-test="test"
        :loading="status === 'checking'"
        :disabled="disabled || !modelValue"
        @click="emit('test')"
      >
        Test
      </UiButton>
    </div>
    <div class="ui-secret__meta">
      <p :id="hintId" class="ui-field__hint" data-test="hint">{{ hint }}</p>
      <p
        v-if="status"
        :id="statusId"
        role="status"
        class="ui-secret__status"
        :class="`ui-secret__status--${status}`"
        data-test="status"
      >
        <IconCheck v-if="status === 'ok'" />
        <IconWarning v-else-if="status === 'invalid'" />
        {{ statusMessage ?? STATUS_TEXT[status] }}
      </p>
    </div>
    <details v-if="$slots.help" class="ui-secret__help">
      <summary>Where do I get this?</summary>
      <div class="ui-secret__help-body"><slot name="help" /></div>
    </details>
  </div>
</template>

<style scoped>
p {
  margin: 0;
}

.ui-secret__row {
  display: flex;
  gap: var(--space-2);
}

.ui-secret__row .ui-control {
  flex: 1;
}

.ui-secret__input {
  font-family: var(--font-mono);
}

.ui-secret__meta {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

.ui-secret__status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text-muted);
}

.ui-secret__status--ok {
  color: var(--color-success);
}

.ui-secret__status--invalid {
  color: var(--color-danger);
}

.ui-secret__help summary {
  width: fit-content;
  font-size: var(--text-table-size);
  color: var(--color-accent);
  cursor: pointer;
}

.ui-secret__help-body {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-left: var(--line-thin) solid var(--color-border);
  font-size: var(--text-table-size);
  line-height: var(--text-table-line);
  color: var(--color-text-muted);
}
</style>
