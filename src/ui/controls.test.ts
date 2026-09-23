// Render tests for the remaining form controls and chips.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UiInput from './UiInput.vue'
import UiSlider from './UiSlider.vue'
import UiSelect from './UiSelect.vue'
import UiMultiSelect from './UiMultiSelect.vue'
import FilterChip from './FilterChip.vue'
import UiTooltip from './UiTooltip.vue'
import EmptyState from './EmptyState.vue'

describe('UiInput', () => {
  it('labels the input and links the error message', () => {
    const wrapper = mount(UiInput, { props: { label: 'Repository', modelValue: 'x', error: 'Not a repo' } })
    const input = wrapper.get('input')
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-invalid')).toBe('true')
    const error = wrapper.get('[data-test="error"]')
    expect(error.text()).toBe('Not a repo')
    expect(input.attributes('aria-describedby')).toContain(error.attributes('id'))
  })

  it('clears when clearable', async () => {
    const wrapper = mount(UiInput, { props: { label: 'Search', modelValue: 'bug', clearable: true } })
    await wrapper.get('[data-test="clear"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
  })
})

describe('UiSlider', () => {
  it('exposes aria-valuetext and snaps the paired number input to the step', async () => {
    const wrapper = mount(UiSlider, {
      props: { label: 'Criticality weight', modelValue: 40, valueText: (v: number) => `${v} percent` },
    })
    const range = wrapper.get('input[type="range"]')
    expect(range.attributes('aria-valuetext')).toBe('40 percent')
    expect(range.attributes('step')).toBe('5')
    const number = wrapper.get('input[type="number"]')
    await number.setValue('43')
    await number.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([45])
    await number.setValue('250')
    await number.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([100])
  })
})

describe('UiSelect', () => {
  it('renders a labelled native select and emits the chosen value', async () => {
    const wrapper = mount(UiSelect, {
      props: {
        label: 'Sort by',
        modelValue: 'a',
        options: [
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ],
      },
    })
    expect(wrapper.get('label').attributes('for')).toBe(wrapper.get('select').attributes('id'))
    await wrapper.get('select').setValue('b')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
  })
})

describe('UiMultiSelect', () => {
  const options = [
    { value: 'bug', label: 'bug' },
    { value: 'docs', label: 'docs' },
    { value: 'perf', label: 'performance' },
  ]

  it('shows selected values as removable chips', async () => {
    const wrapper = mount(UiMultiSelect, { props: { label: 'Labels', modelValue: ['bug'], options } })
    const chip = wrapper.get('.filter-chip')
    expect(chip.text()).toContain('bug')
    await chip.get('[data-test="chip-remove"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]])
  })

  it('opens a multi-select listbox, toggles with Enter and supports type-ahead', async () => {
    const wrapper = mount(UiMultiSelect, {
      props: { label: 'Labels', modelValue: [], options },
      attachTo: document.body,
    })
    const trigger = wrapper.get('[data-test="multiselect-trigger"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    const listbox = wrapper.get('[role="listbox"]')
    expect(listbox.attributes('aria-multiselectable')).toBe('true')
    expect(trigger.attributes('aria-expanded')).toBe('true')

    await listbox.trigger('keydown', { key: 'p' })
    expect(listbox.attributes('aria-activedescendant')).toBe(
      wrapper.findAll('[role="option"]')[2].attributes('id'),
    )
    await listbox.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['perf']])

    await listbox.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('FilterChip', () => {
  it('toggles with aria-pressed and can be removed', async () => {
    const wrapper = mount(FilterChip, { props: { label: 'High criticality', active: true, removable: true } })
    const toggle = wrapper.get('[data-test="chip-toggle"]')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    await toggle.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    const remove = wrapper.get('[data-test="chip-remove"]')
    expect(remove.attributes('aria-label')).toBe('Remove filter High criticality')
    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)
  })
})

describe('UiTooltip', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('appears on focus after 300 ms and hides on Escape', async () => {
    const wrapper = mount(UiTooltip, {
      props: { text: 'Per-level probabilities' },
      slots: { default: '<button>i</button>' },
      attachTo: document.body,
    })
    const tip = wrapper.get('[role="tooltip"]')
    expect(tip.isVisible()).toBe(false)
    await wrapper.get('.ui-tooltip').trigger('focusin')
    vi.advanceTimersByTime(299)
    await wrapper.vm.$nextTick()
    expect(tip.isVisible()).toBe(false)
    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()
    expect(tip.isVisible()).toBe(true)
    await wrapper.get('.ui-tooltip').trigger('keydown', { key: 'Escape' })
    expect(tip.isVisible()).toBe(false)
    wrapper.unmount()
  })
})

describe('EmptyState', () => {
  it('shows a decorative illustration, a title, one sentence and one action', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No analyses yet', description: 'Load a repository to get started.' },
      slots: { action: '<button>New analysis</button>' },
    })
    expect(wrapper.get('.empty-state__art').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('h2').text()).toBe('No analyses yet')
    expect(wrapper.get('p').text()).toBe('Load a repository to get started.')
    expect(wrapper.findAll('button')).toHaveLength(1)
  })
})
