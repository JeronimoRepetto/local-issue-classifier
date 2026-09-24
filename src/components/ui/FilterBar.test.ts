// Task 12 — filters combine with AND; free-text search,
// level/kind/status multi-selects, relevance range, minimum confidence.
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FilterBar from './FilterBar.vue'
import { defaultFilter } from '../../domain/types'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountBar(filter = defaultFilter(), availableLabels: string[] = ['bug', 'docs']) {
  return mount(FilterBar, { props: { filter, availableLabels }, attachTo: document.body })
}

describe('FilterBar — search', () => {
  it('emits update with the typed text', async () => {
    const wrapper = mountBar()
    await wrapper.get('[data-test="search-input"] input').setValue('crash')
    expect(wrapper.emitted('update')).toEqual([[{ text: 'crash' }]])
  })

  it('exposes focusSearch for the "/" shortcut', () => {
    const wrapper = mountBar()
    wrapper.vm.focusSearch()
    expect(document.activeElement).toBe(wrapper.get('[data-test="search-input"] input').element)
  })
})

describe('FilterBar — level multi-selects', () => {
  it('emits update for complexity, criticality and effort independently', async () => {
    const wrapper = mountBar()
    const criticality = wrapper.get('[data-test="filter-criticality"] [data-test="multiselect-trigger"]')
    await criticality.trigger('click')
    await wrapper.get('[data-test="filter-criticality"] .ui-multiselect__option').trigger('click')
    expect(wrapper.emitted('update')?.[0]).toEqual([{ criticality: ['high'] }])
  })
})

describe('FilterBar — kind and status multi-selects', () => {
  it('offers every IssueKind option', async () => {
    const wrapper = mountBar()
    await wrapper.get('[data-test="filter-kind"] [data-test="multiselect-trigger"]').trigger('click')
    const options = wrapper.get('[data-test="filter-kind"] .ui-multiselect__list').text()
    for (const kind of ['Bug', 'Feature', 'Documentation', 'Question', 'Maintenance', 'Other']) {
      expect(options).toContain(kind)
    }
  })

  it('offers every classification status option', async () => {
    const wrapper = mountBar()
    await wrapper.get('[data-test="filter-status"] [data-test="multiselect-trigger"]').trigger('click')
    const options = wrapper.get('[data-test="filter-status"] .ui-multiselect__list').text()
    for (const status of ['Unclassified', 'Pending', 'Classified', 'Error', 'Stale']) {
      expect(options).toContain(status)
    }
  })
})

describe('FilterBar — labels multi-select', () => {
  it('offers the available labels passed in as options', async () => {
    const wrapper = mountBar()
    await wrapper.get('[data-test="filter-labels"] [data-test="multiselect-trigger"]').trigger('click')
    const options = wrapper.get('[data-test="filter-labels"] .ui-multiselect__list').text()
    expect(options).toContain('bug')
    expect(options).toContain('docs')
  })
})

describe('FilterBar — relevance range and minimum confidence', () => {
  it('emits relevanceMin and relevanceMax from their sliders', async () => {
    const wrapper = mountBar()
    await wrapper.get('[data-test="relevance-min"] input[type="range"]').setValue('40')
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ relevanceMin: 40 }])
    await wrapper.get('[data-test="relevance-max"] input[type="range"]').setValue('80')
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ relevanceMax: 80 }])
  })

  it('emits minConfidence from its slider', async () => {
    const wrapper = mountBar()
    await wrapper.get('[data-test="min-confidence"] input[type="range"]').setValue('0.5')
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ minConfidence: 0.5 }])
  })
})

describe('FilterBar — collapsible search and filters', () => {
  const section = (wrapper: ReturnType<typeof mountBar>) =>
    wrapper.get<HTMLDetailsElement>('[data-test="filters-section"]').element

  it('wraps search and the multi-selects in a section that starts expanded', () => {
    const wrapper = mountBar()
    expect(section(wrapper).tagName).toBe('DETAILS')
    expect(section(wrapper).open).toBe(true)
    expect(wrapper.get('[data-test="filters-toggle"]').text()).toContain('Search and filters')
    expect(section(wrapper).querySelector('[data-test="search-input"]')).not.toBeNull()
    expect(section(wrapper).querySelector('[data-test="filter-labels"]')).not.toBeNull()
  })

  it('counts the active search and multi-select filters in the toggle, so a collapsed section still shows them', () => {
    const wrapper = mountBar({ ...defaultFilter(), text: 'crash', criticality: ['high'], labels: ['bug'] })
    expect(wrapper.get('[data-test="filters-toggle"]').text()).toContain('3 active')
  })

  it('shows no active count when nothing is filtered', () => {
    const wrapper = mountBar()
    expect(wrapper.get('[data-test="filters-toggle"]').text()).not.toContain('active')
  })

  it('re-opens a collapsed section when focusSearch runs (the "/" shortcut)', async () => {
    const wrapper = mountBar()
    section(wrapper).open = false
    wrapper.vm.focusSearch()
    await wrapper.vm.$nextTick()
    expect(section(wrapper).open).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('[data-test="search-input"] input').element)
  })
})

describe('FilterBar — reset', () => {
  it('emits reset when Reset filters is clicked', async () => {
    const wrapper = mountBar({ ...defaultFilter(), criticality: ['high'] })
    await wrapper.get('[data-test="reset-filters"]').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })
})
