// Task 12 — Relevance, 0-100 with a bar.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RelevanceCell from './RelevanceCell.vue'

describe('RelevanceCell', () => {
  it('shows the relevance value with a ScoreBar when classified', () => {
    const wrapper = mount(RelevanceCell, {
      props: { value: { value: 88, score: 3.5, confidence: 0.77, probabilities: [0, 0, 0, 0.77, 0.23] } },
    })
    expect(wrapper.findComponent({ name: 'ScoreBar' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('88')
  })

  it('shows a dash when unclassified', () => {
    const wrapper = mount(RelevanceCell, { props: { value: null } })
    expect(wrapper.text()).toBe('—')
  })
})
