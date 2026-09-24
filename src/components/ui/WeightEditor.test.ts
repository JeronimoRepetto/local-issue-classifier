// Task 14 — the Weights popover content. Four
// sliders (step 5) with a paired numeric input each, a live preview emitted
// 150 ms after the last change, Reset to 40/30/15/15, an all-zero warning,
// and keyboard operation via the always-focusable numeric input.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import WeightEditor from './WeightEditor.vue'
import { defaultPriorityWeights } from '../../domain/types'
import { fakeClassification } from '../../../tests/fakes/domainFixtures'

/** Same scores as `priority.test.ts`'s worked example: 83/100 with the default weights. */
function workedExampleClassification() {
  return fakeClassification({
    criticality: { level: 'high', score: 1.8, confidence: 0.9, probabilities: [0, 0.1, 0.9] },
    relevance: { value: 88, score: 3.5, confidence: 0.8, probabilities: [0, 0, 0, 0.8, 0.2] },
    complexity: { level: 'medium', score: 0.9, confidence: 0.7, probabilities: [0.2, 0.7, 0.1] },
    effort: { level: 'low', score: 0.4, confidence: 0.9, probabilities: [0.8, 0.2, 0] },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setNumber(wrapper: VueWrapper<any>, testId: string, value: number) {
  const input = wrapper.get(`[data-test="${testId}"] input[type="number"]`)
  return input.setValue(String(value)).then(() => input.trigger('change'))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function numberValue(wrapper: VueWrapper<any>, testId: string): string {
  return (wrapper.get(`[data-test="${testId}"] input[type="number"]`).element as HTMLInputElement).value
}

describe('WeightEditor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('renders the four sliders seeded from the current weights', () => {
    const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
    expect(numberValue(wrapper, 'weight-criticality')).toBe('40')
    expect(numberValue(wrapper, 'weight-relevance')).toBe('30')
    expect(numberValue(wrapper, 'weight-complexity')).toBe('15')
    expect(numberValue(wrapper, 'weight-effort')).toBe('15')
  })

  it('emits update only 150 ms after the last change (debounced live preview)', async () => {
    const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
    await setNumber(wrapper, 'weight-criticality', 60)
    expect(wrapper.emitted('update')).toBeUndefined()

    vi.advanceTimersByTime(149)
    expect(wrapper.emitted('update')).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('update')).toHaveLength(1)
    expect(wrapper.emitted('update')![0][0]).toEqual({ criticality: 60, relevance: 30, complexity: 15, effort: 15 })
  })

  it('collapses rapid changes within the debounce window into a single emit with the latest value', async () => {
    const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
    await setNumber(wrapper, 'weight-criticality', 50)
    vi.advanceTimersByTime(100)
    await setNumber(wrapper, 'weight-criticality', 70)
    vi.advanceTimersByTime(149)
    expect(wrapper.emitted('update')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('update')).toHaveLength(1)
    expect(wrapper.emitted('update')![0][0]).toMatchObject({ criticality: 70 })
  })

  it('Reset restores 40/30/15/15 and emits it after the debounce', async () => {
    const wrapper = mount(WeightEditor, { props: { weights: { criticality: 100, relevance: 0, complexity: 0, effort: 0 } } })
    await wrapper.get('[data-test="weight-reset"]').trigger('click')
    expect(numberValue(wrapper, 'weight-criticality')).toBe('40')
    vi.advanceTimersByTime(150)
    expect(wrapper.emitted('update')![0][0]).toEqual(defaultPriorityWeights())
  })

  it('shows the all-zero warning immediately, without waiting for the debounce', async () => {
    const wrapper = mount(WeightEditor, { props: { weights: { criticality: 0, relevance: 0, complexity: 0, effort: 15 } } })
    expect(wrapper.find('[data-test="weight-all-zero-warning"]').exists()).toBe(false)
    await setNumber(wrapper, 'weight-effort', 0)
    expect(wrapper.get('[data-test="weight-all-zero-warning"]').text()).toContain('Set at least one weight above 0')
  })

  it('hides the all-zero warning again once a weight is above 0', async () => {
    const wrapper = mount(WeightEditor, { props: { weights: { criticality: 0, relevance: 0, complexity: 0, effort: 0 } } })
    expect(wrapper.find('[data-test="weight-all-zero-warning"]').exists()).toBe(true)
    await setNumber(wrapper, 'weight-relevance', 20)
    expect(wrapper.find('[data-test="weight-all-zero-warning"]').exists()).toBe(false)
  })

  it('is operable via the paired, always keyboard-focusable numeric input for every slider', async () => {
    const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
    for (const testId of ['weight-criticality', 'weight-relevance', 'weight-complexity', 'weight-effort']) {
      const numberInput = wrapper.get(`[data-test="${testId}"] input[type="number"]`)
      expect(numberInput.attributes('type')).toBe('number')
      expect(numberInput.attributes('disabled')).toBeUndefined()
    }
    await setNumber(wrapper, 'weight-relevance', 55)
    vi.advanceTimersByTime(150)
    expect(wrapper.emitted('update')![0][0]).toMatchObject({ relevance: 55 })
  })

  it('clamps an out-of-range or off-step incoming weights prop ("applied on load")', () => {
    const wrapper = mount(WeightEditor, {
      props: { weights: { criticality: 103, relevance: -5, complexity: 42, effort: 15 } },
    })
    expect(numberValue(wrapper, 'weight-criticality')).toBe('100')
    expect(numberValue(wrapper, 'weight-relevance')).toBe('0')
    expect(numberValue(wrapper, 'weight-complexity')).toBe('40')
  })

  describe('title, subtitle and per-slider explanation', () => {
    it('names the popover content with a heading linked via aria-labelledby, plus a one-line subtitle', () => {
      const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
      const title = wrapper.get('[data-test="weight-editor-title"]')
      expect(title.text()).toBe('Priority weights')
      expect(wrapper.get('.weight-editor').attributes('aria-labelledby')).toBe(title.attributes('id'))
      const subtitle = wrapper.get('[data-test="weight-editor-subtitle"]').text()
      expect(subtitle).toContain('How much each Jev dimension counts in the 0–100 Priority score.')
      expect(subtitle).toContain('Complexity and effort are inverted: simpler, cheaper issues rank higher.')
    })

    it('labels each slider with its current weight and its share of the total', () => {
      const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
      expect(wrapper.get('[data-test="weight-criticality"] label').text()).toBe('Criticality · 40 (40%)')
      expect(wrapper.get('[data-test="weight-relevance"] label').text()).toBe('Relevance · 30 (30%)')
      expect(wrapper.get('[data-test="weight-complexity"] label').text()).toBe('Complexity · 15 (15%)')
      expect(wrapper.get('[data-test="weight-effort"] label').text()).toBe('Effort · 15 (15%)')
    })

    it('recomputes each share live (not debounced) as a weight changes', async () => {
      const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
      await setNumber(wrapper, 'weight-criticality', 60) // total 60+30+15+15 = 120
      expect(wrapper.get('[data-test="weight-criticality"] label').text()).toBe('Criticality · 60 (50%)')
      expect(wrapper.emitted('update')).toBeUndefined() // label updated ahead of the debounced emit
    })

    it('shows 0% shares without dividing by zero when every weight is 0', () => {
      const wrapper = mount(WeightEditor, {
        props: { weights: { criticality: 0, relevance: 0, complexity: 0, effort: 0 } },
      })
      expect(wrapper.get('[data-test="weight-criticality"] label').text()).toBe('Criticality · 0 (0%)')
    })
  })

  describe('live example', () => {
    it('uses the first visible row when provided via the exampleRow prop', () => {
      const wrapper = mount(WeightEditor, {
        props: {
          weights: defaultPriorityWeights(),
          exampleRow: { number: 89, classification: workedExampleClassification() },
        },
      })
      expect(wrapper.get('[data-test="weight-example"]').text()).toBe('#89 → 83/100')
    })

    it('falls back to the worked example when no row is provided', () => {
      const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
      expect(wrapper.get('[data-test="weight-example"]').text()).toBe('Example → 83/100')
    })

    it('updates live as a weight changes, ahead of the debounced emit', async () => {
      const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
      await setNumber(wrapper, 'weight-criticality', 100)
      expect(wrapper.get('[data-test="weight-example"]').text()).not.toBe('Example → 83/100')
      expect(wrapper.emitted('update')).toBeUndefined()
    })

    it('shows — when every weight is 0 (nothing to rank)', () => {
      const wrapper = mount(WeightEditor, {
        props: { weights: { criticality: 0, relevance: 0, complexity: 0, effort: 0 } },
      })
      expect(wrapper.get('[data-test="weight-example"]').text()).toBe('Example → —')
    })
  })

  it('labels Reset with the concrete default weights', () => {
    const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
    expect(wrapper.get('[data-test="weight-reset"]').text()).toBe('Reset to defaults (40/30/15/15)')
  })

  describe('layout — everything stays inside the popover', () => {
    it('wraps each slider in a row that pairs it with min-width:0 so the range input cannot force the row wider', () => {
      const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
      const rows = wrapper.findAll('.weight-editor__row')
      expect(rows).toHaveLength(4)
      for (const row of rows) {
        expect(row.find('input[type="range"]').exists()).toBe(true)
        expect(row.find('input[type="number"]').exists()).toBe(true)
      }
    })

    it('matches the expected structure (title, subtitle, four rows, example, caption, warning slot, reset)', () => {
      const wrapper = mount(WeightEditor, { props: { weights: defaultPriorityWeights() } })
      expect(wrapper.find('.weight-editor').html()).toMatchSnapshot()
    })
  })
})
