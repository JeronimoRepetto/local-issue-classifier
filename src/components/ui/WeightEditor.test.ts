// Task 14 — SPEC.md §2.5 item 3, §4.9: the Weights popover content. Four
// sliders (step 5) with a paired numeric input each, a live preview emitted
// 150 ms after the last change, Reset to 40/30/15/15, an all-zero warning,
// and keyboard operation via the always-focusable numeric input.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import WeightEditor from './WeightEditor.vue'
import { defaultPriorityWeights } from '../../domain/types'

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

  it('clamps an out-of-range or off-step incoming weights prop (SPEC.md §4.9 "applied on load")', () => {
    const wrapper = mount(WeightEditor, {
      props: { weights: { criticality: 103, relevance: -5, complexity: 42, effort: 15 } },
    })
    expect(numberValue(wrapper, 'weight-criticality')).toBe('100')
    expect(numberValue(wrapper, 'weight-relevance')).toBe('0')
    expect(numberValue(wrapper, 'weight-complexity')).toBe('40')
  })
})
