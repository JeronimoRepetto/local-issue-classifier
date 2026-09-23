import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UiSecretInput from './UiSecretInput.vue'

const mountSecret = (props: Record<string, unknown> = {}) =>
  mount(UiSecretInput, { props: { label: 'Jev API key', modelValue: 'sk-test', ...props } })

describe('UiSecretInput', () => {
  it('is masked by default with an unpressed reveal toggle', () => {
    const wrapper = mountSecret()
    expect(wrapper.get('input').attributes('type')).toBe('password')
    const toggle = wrapper.get('[data-test="reveal"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(toggle.attributes('aria-label')).toBe('Show Jev API key')
  })

  it('reveals and re-masks the value, reflecting the state in aria-pressed', async () => {
    const wrapper = mountSecret()
    const toggle = wrapper.get('[data-test="reveal"]')
    await toggle.trigger('click')
    expect(wrapper.get('input').attributes('type')).toBe('text')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(toggle.attributes('aria-label')).toBe('Hide Jev API key')
    await toggle.trigger('click')
    expect(wrapper.get('input').attributes('type')).toBe('password')
    expect(toggle.attributes('aria-pressed')).toBe('false')
  })

  it('never lets the browser remember or spell-check the secret', () => {
    const input = mountSecret().get('input')
    expect(input.attributes('autocomplete')).toBe('off')
    expect(input.attributes('spellcheck')).toBe('false')
  })

  it('shows the "Kept in memory only" hint, linked to the input', () => {
    const wrapper = mountSecret()
    const hint = wrapper.get('[data-test="hint"]')
    expect(hint.text()).toBe('Kept in memory only')
    expect(wrapper.get('input').attributes('aria-describedby')).toContain(hint.attributes('id'))
  })

  it('emits an empty value and "clear" from the clear button', async () => {
    const wrapper = mountSecret()
    await wrapper.get('[data-test="clear"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('renders the "Where do I get this?" disclosure when help is provided', () => {
    const wrapper = mount(UiSecretInput, {
      props: { label: 'GitHub token', modelValue: '' },
      slots: { help: 'Create a fine-grained token.' },
    })
    const details = wrapper.get('details')
    expect(details.get('summary').text()).toBe('Where do I get this?')
    expect(details.text()).toContain('Create a fine-grained token.')
  })

  it.each([
    ['untested', 'Not tested yet'],
    ['checking', 'Checking…'],
    ['ok', 'Key works'],
    ['invalid', 'Key rejected'],
  ] as const)('announces the %s validation state', (status, text) => {
    const wrapper = mountSecret({ status })
    const node = wrapper.get('[data-test="status"]')
    expect(node.text()).toBe(text)
    expect(node.attributes('role')).toBe('status')
  })

  it('marks the input invalid when the key was rejected', () => {
    expect(mountSecret({ status: 'invalid' }).get('input').attributes('aria-invalid')).toBe('true')
  })

  it('emits "test" from the Test button', async () => {
    const wrapper = mountSecret({ testable: true })
    await wrapper.get('[data-test="test"]').trigger('click')
    expect(wrapper.emitted('test')).toHaveLength(1)
  })
})
