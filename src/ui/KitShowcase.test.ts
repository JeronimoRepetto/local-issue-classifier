// User decision 2026-09-24: the kit page's "Badges and bars" section demonstrates
// the confidence badge's new hide/show rule — visible samples at 0.50, 0.25 and
// 0.01, plus a 0.51 sample that stays hidden (annotated so the absence is legible).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KitShowcase from './KitShowcase.vue'

describe('KitShowcase confidence badge samples', () => {
  it('renders the 0.50, 0.25 and 0.01 samples, and keeps the 0.51 sample hidden', () => {
    const wrapper = mount(KitShowcase, { props: { theme: 'light' } })

    const visibleBadges = wrapper.findAll('.confidence-badge')
    const percents = visibleBadges.map((badge) => badge.text().match(/\d+%/)?.[0]).sort()
    expect(percents).toEqual(['1%', '25%', '50%'])

    expect(wrapper.text()).toContain('0.51')
    expect(wrapper.text()).toContain('hidden')
  })
})
