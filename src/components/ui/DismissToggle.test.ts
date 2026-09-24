// Task 12 — the "Show dismissed" toggle.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DismissToggle from './DismissToggle.vue'

describe('DismissToggle', () => {
  it('is an accessible switch reflecting modelValue', () => {
    const wrapper = mount(DismissToggle, { props: { modelValue: false } })
    const toggle = wrapper.get('[role="switch"]')
    expect(toggle.attributes('aria-checked')).toBe('false')
    expect(toggle.text()).toBe('Show dismissed')
  })

  it('shows checked when modelValue is true', () => {
    expect(mount(DismissToggle, { props: { modelValue: true } }).get('[role="switch"]').attributes('aria-checked')).toBe(
      'true',
    )
  })

  it('emits update:modelValue toggled on click', async () => {
    const wrapper = mount(DismissToggle, { props: { modelValue: false } })
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })
})
