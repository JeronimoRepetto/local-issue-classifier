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
  it('shows low confidence with a "?" glyph and the warning style', () => {
    const wrapper = mount(ConfidenceBadge, { props: { confidence: 0.42 } })
    const badge = wrapper.get('.confidence-badge')
    expect(badge.classes()).toContain('confidence-badge--low')
    expect(wrapper.find('[data-test="question-glyph"]').exists()).toBe(true)
    expect(badge.attributes('aria-label')).toBe('Confidence 0.42 (low)')
    expect(badge.text()).toContain('42%')
  })

  it('hides high confidence when asked to', () => {
    const wrapper = mount(ConfidenceBadge, { props: { confidence: 0.91, hideHigh: true } })
    expect(wrapper.find('.confidence-badge').exists()).toBe(false)
  })

  it('lists per-level probabilities in its tooltip', () => {
    const wrapper = mount(ConfidenceBadge, {
      props: { confidence: 0.6, probabilities: { high: 0.6, medium: 0.3, low: 0.1 } },
    })
    const tooltip = wrapper.get('[role="tooltip"]')
    expect(tooltip.text()).toContain('high 60%')
    expect(tooltip.text()).toContain('low 10%')
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
