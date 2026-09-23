import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UiButton from './UiButton.vue'

describe('UiButton', () => {
  afterEach(() => vi.restoreAllMocks())

  it('defaults to a secondary, default-size, type="button" button', () => {
    const wrapper = mount(UiButton, { slots: { default: 'Save' } })
    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.classes()).toContain('ui-button--secondary')
    expect(button.classes()).toContain('ui-button--size-default')
    expect(button.text()).toBe('Save')
  })

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('renders the %s variant', (variant) => {
    const wrapper = mount(UiButton, { props: { variant }, slots: { default: 'Go' } })
    expect(wrapper.get('button').classes()).toContain(`ui-button--${variant}`)
  })

  it.each(['compact', 'default', 'large'] as const)('renders the %s size', (size) => {
    const wrapper = mount(UiButton, { props: { size }, slots: { default: 'Go' } })
    expect(wrapper.get('button').classes()).toContain(`ui-button--size-${size}`)
  })

  it('emits click when enabled', async () => {
    const wrapper = mount(UiButton, { slots: { default: 'Go' } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('is natively disabled and silent when disabled', async () => {
    const wrapper = mount(UiButton, { props: { disabled: true }, slots: { default: 'Go' } })
    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('keeps its label for width, shows a spinner and swallows clicks while loading', async () => {
    const wrapper = mount(UiButton, { props: { loading: true }, slots: { default: 'Classify' } })
    const button = wrapper.get('button')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(button.text()).toContain('Classify')
    expect(wrapper.find('.ui-spinner').exists()).toBe(true)
    await button.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('renders an icon-only button with its aria-label', () => {
    const wrapper = mount(UiButton, {
      props: { iconOnly: true },
      attrs: { 'aria-label': 'Close' },
      slots: { icon: '<svg aria-hidden="true"></svg>' },
    })
    const button = wrapper.get('button')
    expect(button.classes()).toContain('ui-button--icon-only')
    expect(button.attributes('aria-label')).toBe('Close')
  })

  it('warns in development when an icon-only button has no aria-label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mount(UiButton, { props: { iconOnly: true }, slots: { icon: '<svg></svg>' } })
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/aria-label/))
  })
})
