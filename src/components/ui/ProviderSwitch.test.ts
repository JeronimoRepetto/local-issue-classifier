// The provider switcher (classification screen): pick Jev (cloud), a local
// server or the in-browser model without leaving the analysis view. An
// unavailable candidate is disabled with its reason as a tooltip.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProviderSwitch from './ProviderSwitch.vue'
import type { ProviderCandidate } from '../../composables/useProvider'

const CANDIDATES: ProviderCandidate[] = [
  { id: 'typesafe', label: 'Jev (TypeSafe cloud)', kind: 'typesafe', available: true },
  { id: 'local:kev', label: 'Kev', kind: 'local', available: false, reason: 'Server not reachable on :8009' },
  { id: 'browser', label: 'In this browser (Qwen3 0.6B, experimental)', kind: 'browser', available: true },
]

function mountSwitch(props: Record<string, unknown> = {}) {
  return mount(ProviderSwitch, {
    props: { candidates: CANDIDATES, modelValue: 'typesafe', ...props },
    attachTo: document.body,
  })
}

describe('ProviderSwitch', () => {
  it('renders an accessible radiogroup with one radio per candidate', () => {
    const wrapper = mountSwitch()
    expect(wrapper.get('[role="radiogroup"]').attributes('aria-label')).toBeTruthy()
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios).toHaveLength(3)
    expect(wrapper.get('[data-test="provider-option-typesafe"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('[data-test="provider-option-browser"]').attributes('aria-checked')).toBe('false')
  })

  it('disables an unavailable candidate and exposes its reason as a tooltip', () => {
    const wrapper = mountSwitch()
    const kev = wrapper.get('[data-test="provider-option-local:kev"]')
    expect(kev.attributes('disabled')).toBeDefined()
    expect(kev.attributes('aria-describedby')).toBeTruthy()
    expect(wrapper.text()).toContain('Server not reachable on :8009')
  })

  it('emits update:modelValue when an available candidate is clicked', async () => {
    const wrapper = mountSwitch()
    await wrapper.get('[data-test="provider-option-browser"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['browser']])
  })

  it('never emits for a disabled (unavailable) candidate', async () => {
    const wrapper = mountSwitch()
    await wrapper.get('[data-test="provider-option-local:kev"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('disables every option while a run is active, even an available one', async () => {
    const wrapper = mountSwitch({ disabled: true })
    expect(wrapper.get('[data-test="provider-option-typesafe"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="provider-option-browser"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="provider-option-browser"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
