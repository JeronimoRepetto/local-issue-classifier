// Task 13 — SPEC.md §2.5 item 3, §7.1: the ordered sort-rule editor shared by
// the table's Sort popover and the export dialog's order editor. Presentational:
// props/emits only, no composables.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SortRuleList from './SortRuleList.vue'
import type { SortRule } from '../../domain/types'

function mountList(rules: SortRule[]) {
  return mount(SortRuleList, { props: { rules } })
}

describe('SortRuleList — rendering the ordered rules', () => {
  it('lists each rule in order with its label and direction', () => {
    const wrapper = mountList([
      { key: 'criticality', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
    const items = wrapper.findAll('[data-test="sort-rule"]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Criticality')
    expect(items[1].text()).toContain('Effort')
  })
})

describe('SortRuleList — direction toggle', () => {
  it('emits update with the direction flipped for that rule only', async () => {
    const wrapper = mountList([
      { key: 'criticality', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
    await wrapper.findAll('[data-test="sort-rule-direction"]')[0].trigger('click')
    expect(wrapper.emitted('update')).toEqual([
      [
        [
          { key: 'criticality', direction: 'asc' },
          { key: 'effort', direction: 'asc' },
        ],
      ],
    ])
  })
})

describe('SortRuleList — remove', () => {
  it('emits update without the removed rule', async () => {
    const wrapper = mountList([
      { key: 'criticality', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
    await wrapper.findAll('[data-test="sort-rule-remove"]')[0].trigger('click')
    expect(wrapper.emitted('update')).toEqual([[[{ key: 'effort', direction: 'asc' }]]])
  })
})

describe('SortRuleList — add a key', () => {
  it('only offers keys that are not already part of the order', () => {
    const wrapper = mountList([{ key: 'criticality', direction: 'desc' }])
    const select = wrapper.get('[data-test="sort-rule-add-select"] select')
    const optionLabels = select.findAll('option').map((o) => o.text())
    expect(optionLabels).not.toContain('Criticality')
    expect(optionLabels).toContain('Effort')
  })

  it('emits update appending the chosen key with a default direction', async () => {
    const wrapper = mountList([{ key: 'criticality', direction: 'desc' }])
    await wrapper.get('[data-test="sort-rule-add-select"] select').setValue('effort')
    await wrapper.get('[data-test="sort-rule-add"]').trigger('click')
    expect(wrapper.emitted('update')).toEqual([
      [
        [
          { key: 'criticality', direction: 'desc' },
          { key: 'effort', direction: 'desc' },
        ],
      ],
    ])
  })

  it('hides the add control once every key is already used', () => {
    const allKeys: SortRule['key'][] = [
      'priority',
      'criticality',
      'complexity',
      'effort',
      'relevance',
      'minConfidence',
      'createdAt',
      'updatedAt',
      'commentCount',
      'number',
    ]
    const wrapper = mountList(allKeys.map((key) => ({ key, direction: 'desc' as const })))
    expect(wrapper.find('[data-test="sort-rule-add-select"]').exists()).toBe(false)
  })
})

describe('SortRuleList — keyboard reorder, Alt+ArrowUp/Down (SPEC.md §11 row 13)', () => {
  it('Alt+ArrowDown moves a rule one position later', async () => {
    const wrapper = mountList([
      { key: 'criticality', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
      { key: 'relevance', direction: 'desc' },
    ])
    await wrapper.findAll('[data-test="sort-rule"]')[0].trigger('keydown', { key: 'ArrowDown', altKey: true })
    expect(wrapper.emitted('update')).toEqual([
      [
        [
          { key: 'effort', direction: 'asc' },
          { key: 'criticality', direction: 'desc' },
          { key: 'relevance', direction: 'desc' },
        ],
      ],
    ])
  })

  it('Alt+ArrowUp moves a rule one position earlier', async () => {
    const wrapper = mountList([
      { key: 'criticality', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
    await wrapper.findAll('[data-test="sort-rule"]')[1].trigger('keydown', { key: 'ArrowUp', altKey: true })
    expect(wrapper.emitted('update')).toEqual([
      [
        [
          { key: 'effort', direction: 'asc' },
          { key: 'criticality', direction: 'desc' },
        ],
      ],
    ])
  })

  it('is a no-op past the first or last rule', async () => {
    const wrapper = mountList([
      { key: 'criticality', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
    await wrapper.findAll('[data-test="sort-rule"]')[0].trigger('keydown', { key: 'ArrowUp', altKey: true })
    await wrapper.findAll('[data-test="sort-rule"]')[1].trigger('keydown', { key: 'ArrowDown', altKey: true })
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('a plain ArrowDown/ArrowUp without Alt does not reorder', async () => {
    const wrapper = mountList([
      { key: 'criticality', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
    await wrapper.findAll('[data-test="sort-rule"]')[0].trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update')).toBeUndefined()
  })
})
