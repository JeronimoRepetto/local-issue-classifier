// Task 14 — Priority, 0-100 with a bar, and a
// caption explaining the inversion and the ranking-aid (ordinal) nature.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PriorityCell from './PriorityCell.vue'

describe('PriorityCell', () => {
  it('shows the priority value with a ScoreBar when present', () => {
    const wrapper = mount(PriorityCell, { props: { value: 83 } })
    expect(wrapper.findComponent({ name: 'ScoreBar' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('83')
  })

  it('shows a dash when there is no priority (unclassified, or every weight 0)', () => {
    const wrapper = mount(PriorityCell, { props: { value: null } })
    expect(wrapper.text()).toContain('—')
  })

  it('explains the inversion and the ranking-aid, ordinal nature in a tooltip caption', () => {
    const wrapper = mount(PriorityCell, { props: { value: 50 } })
    const tooltip = wrapper.get('[role="tooltip"]')
    expect(tooltip.text().toLowerCase()).toContain('lower complexity')
    expect(tooltip.text().toLowerCase()).toContain('lower effort')
    expect(tooltip.text().toLowerCase()).toMatch(/ranking aid|not a measurement/)
  })
})
