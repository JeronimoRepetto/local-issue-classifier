// Task 12 — SPEC.md §6.3: a level chip per dimension, with raw score, confidence
// and probabilities on hover/focus (via ConfidenceBadge's tooltip).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LevelCell from './LevelCell.vue'

const scoreDimension = {
  level: 'high' as const,
  score: 1.8,
  confidence: 0.91,
  probabilities: [0.02, 0.07, 0.91] as [number, number, number],
}

describe('LevelCell', () => {
  it('shows a level badge and a confidence badge when classified', () => {
    const wrapper = mount(LevelCell, { props: { dimension: 'Criticality', value: scoreDimension } })
    expect(wrapper.findComponent({ name: 'LevelBadge' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('High')
    expect(wrapper.text()).toContain('91%')
  })

  it('marks the level badge stale when the row is stale', () => {
    const wrapper = mount(LevelCell, { props: { dimension: 'Criticality', value: scoreDimension, stale: true } })
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toContain('stale')
  })

  it('shows a placeholder dash when unclassified', () => {
    const wrapper = mount(LevelCell, { props: { dimension: 'Criticality', value: null } })
    expect(wrapper.text()).toBe('—')
  })

  it('still shows the level badge when confidence is missing (forward-compat: confidence is optional upstream)', () => {
    const withoutConfidence = { ...scoreDimension, confidence: undefined as unknown as number }
    const wrapper = mount(LevelCell, { props: { dimension: 'Criticality', value: withoutConfidence } })
    expect(wrapper.findComponent({ name: 'LevelBadge' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ConfidenceBadge' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('—')
  })
})
