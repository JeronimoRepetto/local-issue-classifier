// FB-2: where the Jev API key, GitHub token and local key are kept, chosen by
// the user. Presentational only: the container owns the preference and wiring.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SecretsPersistenceToggle from './SecretsPersistenceToggle.vue'

const RISK = /anyone with access to this Windows user profile.*or by malware/s

describe('SecretsPersistenceToggle', () => {
  it('offers the three levels as a radio group, with memory selected by default value', () => {
    const wrapper = mount(SecretsPersistenceToggle, { props: { modelValue: 'memory' } })
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((r) => r.text())).toEqual(['Memory only', 'This tab', 'This device'])
    expect(wrapper.get('[data-test="segment-memory"]').attributes('aria-checked')).toBe('true')
  })

  it('explains that memory-only keys vanish on reload and nothing is written', () => {
    const note = mount(SecretsPersistenceToggle, { props: { modelValue: 'memory' } }).get('[data-test="secrets-note"]')
    expect(note.text()).toMatch(/vanish when you reload/)
    expect(note.text()).not.toMatch(RISK)
  })

  it.each([
    ['tab', /survive a reload.*closing the tab/s],
    ['device', /stay on this device/],
  ] as const)('states the %s level plainly, with the browser-storage risk', (level, specific) => {
    const note = mount(SecretsPersistenceToggle, { props: { modelValue: level } }).get('[data-test="secrets-note"]')
    expect(note.text()).toMatch(specific)
    expect(note.text()).toMatch(RISK)
    expect(note.text()).toMatch(/localhost only/)
    expect(note.text()).toMatch(/Forget keys/)
  })

  it('emits update:modelValue with the chosen level', async () => {
    const wrapper = mount(SecretsPersistenceToggle, { props: { modelValue: 'memory' } })
    await wrapper.get('[data-test="segment-device"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['device']])
  })

  it('emits forget from the "Forget keys" button', async () => {
    const wrapper = mount(SecretsPersistenceToggle, { props: { modelValue: 'tab' } })
    const button = wrapper.get('[data-test="forget-keys"]')
    expect(button.text()).toBe('Forget keys')
    await button.trigger('click')
    expect(wrapper.emitted('forget')).toHaveLength(1)
  })
})
