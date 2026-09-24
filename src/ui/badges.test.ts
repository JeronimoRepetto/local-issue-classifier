import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LevelBadge from './LevelBadge.vue'
import ConfidenceBadge from './ConfidenceBadge.vue'
import ScoreBar from './ScoreBar.vue'

describe('LevelBadge', () => {
  it.each([
    ['high', 'High', 3],
    ['medium', 'Medium', 2],
    ['low', 'Low', 1],
  ] as const)('shows %s as text, a %s-bar meter and a full aria-label', (level, text, bars) => {
    const wrapper = mount(LevelBadge, { props: { level, dimension: 'Criticality' } })
    const badge = wrapper.get('.level-badge')
    expect(badge.text()).toBe(text)
    expect(badge.attributes('aria-label')).toBe(`Criticality: ${level}`)
    expect(badge.attributes('role')).toBe('img')
    expect(badge.classes()).toContain(`level-badge--${level}`)
    // v2: a three-bar CSS meter instead of a pixel glyph; decorative, never the only signal.
    const glyph = wrapper.get('[data-test="glyph"]')
    expect(glyph.attributes('data-bars')).toBe(String(bars))
    expect(glyph.attributes('aria-hidden')).toBe('true')
    expect(glyph.findAll('.level-badge__bar')).toHaveLength(3)
    expect(glyph.findAll('.level-badge__bar--on')).toHaveLength(bars)
    expect(glyph.find('svg').exists()).toBe(false)
  })

  it('has a stale variant that says so in its label', () => {
    const wrapper = mount(LevelBadge, { props: { level: 'low', dimension: 'Cost', stale: true } })
    const badge = wrapper.get('.level-badge')
    expect(badge.classes()).toContain('level-badge--stale')
    expect(badge.attributes('aria-label')).toBe('Cost: low (stale)')
  })
})

describe('ConfidenceBadge', () => {
  // user decision 2026-09-24: the badge owns its own visibility rule now —
  // shown only at confidence <= 0.50 — so callers no longer pass `hideHigh`.
  it('is hidden once confidence is above 0.50', () => {
    const wrapper = mount(ConfidenceBadge, { props: { confidence: 0.51 } })
    expect(wrapper.find('.confidence-badge').exists()).toBe(false)
  })

  it('is shown at exactly 0.50, with the "?" glyph', () => {
    const wrapper = mount(ConfidenceBadge, { props: { confidence: 0.5 } })
    const badge = wrapper.get('.confidence-badge')
    expect(wrapper.find('[data-test="question-glyph"]').exists()).toBe(true)
    expect(badge.text()).toContain('50%')
  })

  it('stays visible down to the lowest confidence', () => {
    const wrapper = mount(ConfidenceBadge, { props: { confidence: 0.01 } })
    expect(wrapper.find('.confidence-badge').exists()).toBe(true)
  })

  it.each([
    [0.5, 0],
    [0.25, 51],
    [0.01, 100],
  ])('sets --confidence-mix to %s%% for confidence %s (danger share of the warning→danger gradient)', (
    confidence,
    expectedPercent,
  ) => {
    const wrapper = mount(ConfidenceBadge, { props: { confidence } })
    const badge = wrapper.get('.confidence-badge')
    expect(badge.attributes('style')).toContain(`--confidence-mix: ${expectedPercent}%`)
  })

  it('explains the confidence and the probability breakdown in its tooltip', () => {
    const wrapper = mount(ConfidenceBadge, {
      props: { confidence: 0.39, probabilities: { low: 0.12, medium: 0.18, high: 0.7 } },
    })
    const tooltip = wrapper.get('[role="tooltip"]')
    expect(tooltip.text()).toBe(
      "Jev's confidence in this answer: 39%. It is separate from the probabilities: low 12% · medium 18% · high 70%. Consider reviewing this issue.",
    )
  })

  it('drops the probability sentence when none are given', () => {
    const wrapper = mount(ConfidenceBadge, { props: { confidence: 0.39 } })
    const tooltip = wrapper.get('[role="tooltip"]')
    expect(tooltip.text()).toBe("Jev's confidence in this answer: 39%. Consider reviewing this issue.")
  })

  it('carries the same explanation in aria-label for screen readers', () => {
    const wrapper = mount(ConfidenceBadge, {
      props: { confidence: 0.39, probabilities: { low: 0.12, medium: 0.18, high: 0.7 } },
    })
    const badge = wrapper.get('.confidence-badge')
    expect(badge.attributes('aria-label')).toBe(
      "Jev's confidence in this answer: 39%. It is separate from the probabilities: low 12% · medium 18% · high 70%. Consider reviewing this issue.",
    )
  })
})

describe('ScoreBar', () => {
  it('shows the number, a bar in the matching scale step and a full aria-label', () => {
    const wrapper = mount(ScoreBar, { props: { value: 82, label: 'Priority' } })
    const root = wrapper.get('.score-bar')
    expect(root.attributes('aria-label')).toBe('Priority 82 of 100')
    expect(wrapper.get('[data-test="value"]').text()).toBe('82')
    const fill = wrapper.get('[data-test="fill"]')
    expect(fill.attributes('style')).toContain('width: 82%')
    expect(fill.classes()).toContain('score-bar__fill--scale-5')
  })

  it('colors the number with the heat scale and shows the /100 denominator', () => {
    const wrapper = mount(ScoreBar, { props: { value: 34, label: 'Relevance' } })
    expect(wrapper.get('[data-test="value"]').classes()).toContain('score-bar__value--scale-2')
    expect(wrapper.get('[data-test="max"]').text()).toBe('/100')
    expect(wrapper.get('[data-test="max"]').attributes('aria-hidden')).toBe('true')
  })

  it('can hide the bar for dense cells', () => {
    const wrapper = mount(ScoreBar, { props: { value: 34, label: 'Relevance', bar: false } })
    expect(wrapper.find('.score-bar__track').exists()).toBe(false)
  })

  it('handles a missing value', () => {
    const wrapper = mount(ScoreBar, { props: { value: null, label: 'Relevance' } })
    expect(wrapper.get('.score-bar').attributes('aria-label')).toBe('Relevance not available')
    expect(wrapper.get('[data-test="value"]').text()).toBe('—')
  })
})
