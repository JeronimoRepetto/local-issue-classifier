import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UiSegmented from './UiSegmented.vue'

const OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

describe('UiSegmented', () => {
  it('is a labelled radio group with one checked, focusable option', () => {
    const wrapper = mount(UiSegmented, { props: { label: 'Issue state', options: OPTIONS, modelValue: 'closed' } })
    const group = wrapper.get('[role="radiogroup"]')
    expect(group.attributes('aria-label')).toBe('Issue state')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios.map((r) => r.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('selects on click', async () => {
    const wrapper = mount(UiSegmented, { props: { label: 'State', options: OPTIONS, modelValue: 'open' } })
    await wrapper.findAll('[role="radio"]')[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['all']])
  })

  it('moves the selection with the arrow keys and wraps around', async () => {
    const wrapper = mount(UiSegmented, { props: { label: 'State', options: OPTIONS, modelValue: 'open' } })
    const radios = wrapper.findAll('[role="radio"]')
    await radios[0].trigger('keydown', { key: 'ArrowLeft' })
    await radios[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['all'], ['closed']])
  })
})
