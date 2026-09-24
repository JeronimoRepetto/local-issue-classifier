import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UiCallout from './UiCallout.vue'

function mountCallout(tone: 'info' | 'warning' | 'danger', slots: Record<string, string> = { default: 'Body text' }) {
  return mount(UiCallout, { props: { tone }, slots })
}

describe('UiCallout', () => {
  it('renders the slot body', () => {
    const wrapper = mountCallout('info')
    expect(wrapper.text()).toContain('Body text')
  })

  it('renders an optional title', () => {
    const wrapper = mount(UiCallout, { props: { tone: 'warning', title: 'Prerequisites' }, slots: { default: 'Body' } })
    expect(wrapper.text()).toContain('Prerequisites')
    expect(wrapper.text()).toContain('Body')
  })

  it.each(['info', 'warning'] as const)('uses role="note" (passive) for %s', (tone) => {
    const wrapper = mountCallout(tone)
    expect(wrapper.attributes('role')).toBe('note')
  })

  it('uses role="alert" (assertive) only for danger', () => {
    const wrapper = mountCallout('danger')
    expect(wrapper.attributes('role')).toBe('alert')
  })

  it('applies a tone-specific class', () => {
    for (const tone of ['info', 'warning', 'danger'] as const) {
      expect(mountCallout(tone).classes()).toContain(`ui-callout--${tone}`)
    }
  })

  it('renders a leading icon for every tone', () => {
    for (const tone of ['info', 'warning', 'danger'] as const) {
      expect(mountCallout(tone).find('svg').exists(), tone).toBe(true)
    }
  })
})
