// Task 11 — the Classify control.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ClassifyButton from './ClassifyButton.vue'

const base = {
  hasKey: true,
  counts: { unclassified: 12, all: 40, filtered: null },
  scope: 'unclassified' as const,
  estimate: { requests: 12, inputTokens: 48_300, costUsd: 0.002, seconds: 5, tooLarge: 0 },
  running: false,
}

describe('ClassifyButton', () => {
  it('shows the count to classify and the estimated cost', () => {
    const wrapper = mount(ClassifyButton, { props: base })
    expect(wrapper.get('[data-test="classify-start"]').text()).toBe('Classify unclassified (12)')
    expect(wrapper.get('[data-test="classify-estimate"]').text()).toBe(
      '≈ 12 calls · ≈ 48.3 k input tokens · ≈ $0.0020 · ≈ 5 s',
    )
  })

  it('is disabled without a Jev key and offers Settings instead', async () => {
    const wrapper = mount(ClassifyButton, { props: { ...base, hasKey: false } })
    expect(wrapper.get('[data-test="classify-start"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Add a Jev key in Settings to classify.')
    await wrapper.get('[data-test="classify-open-settings"]').trigger('click')
    expect(wrapper.emitted('open-settings')).toHaveLength(1)
  })

  it('is disabled when the scope has nothing to send, or while running', () => {
    const empty = mount(ClassifyButton, { props: { ...base, counts: { unclassified: 0, all: 40, filtered: null } } })
    expect(empty.get('[data-test="classify-start"]').attributes('disabled')).toBeDefined()
    const running = mount(ClassifyButton, { props: { ...base, running: true } })
    expect(running.get('[data-test="classify-start"]').attributes('disabled')).toBeDefined()
  })

  it('emits start with the scope, and lists the filtered scope only when a view is given', async () => {
    const wrapper = mount(ClassifyButton, { props: { ...base, scope: 'all' } })
    expect(wrapper.get('[data-test="classify-start"]').text()).toBe('Re-classify all (40)')
    expect(wrapper.findAll('option').map((o) => o.attributes('value'))).toEqual(['unclassified', 'all'])
    await wrapper.get('[data-test="classify-start"]').trigger('click')
    expect(wrapper.emitted('start')).toEqual([['all']])

    const filtered = mount(ClassifyButton, {
      props: { ...base, scope: 'filtered', counts: { unclassified: 12, all: 40, filtered: 3 } },
    })
    expect(filtered.get('[data-test="classify-start"]').text()).toBe('Classify filtered view (3)')
    await filtered.get('select').setValue('unclassified')
    expect(filtered.emitted('update:scope')).toEqual([['unclassified']])
  })

  it('mentions issues that are too large to send', () => {
    const wrapper = mount(ClassifyButton, { props: { ...base, estimate: { ...base.estimate, tooLarge: 2 } } })
    expect(wrapper.text()).toContain('2 too large to send')
  })
})
