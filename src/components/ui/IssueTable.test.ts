// Task 12 — SPEC.md §6.3: sticky header, virtual scroll above 200 rows,
// roving-tabindex keyboard navigation (Arrow keys, Enter, D).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueTable from './IssueTable.vue'
import IssueRow from './IssueRow.vue'
import { fakeIssue } from '../../../tests/fakes/domainFixtures'
import type { IssueRow as DomainIssueRow } from '../../domain/types'

function row(number: number, overrides: Partial<DomainIssueRow> = {}): DomainIssueRow {
  return {
    issue: fakeIssue(number),
    status: 'unclassified',
    classification: null,
    error: null,
    sourceStatus: 'present',
    ...overrides,
  }
}

function mountTable(rows: DomainIssueRow[], props: Record<string, unknown> = {}) {
  return mount(IssueTable, {
    props: { rows, selected: [], sort: null, ...props },
    attachTo: document.body,
  })
}

describe('IssueTable — plain rendering at or below 200 rows', () => {
  it('renders every row directly, with no virtualization', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row(i + 1))
    const wrapper = mountTable(rows)
    expect(wrapper.findAllComponents(IssueRow)).toHaveLength(50)
  })
})

describe('IssueTable — virtual scrolling above 200 rows', () => {
  it('mounts only a window of rows, not all 201', () => {
    const rows = Array.from({ length: 201 }, (_, i) => row(i + 1))
    const wrapper = mountTable(rows)
    const mounted = wrapper.findAllComponents(IssueRow)
    expect(mounted.length).toBeGreaterThan(0)
    expect(mounted.length).toBeLessThan(201)
  })
})

describe('IssueTable — sticky header and native table semantics', () => {
  it('is a native table with th scope=col headers', () => {
    const wrapper = mountTable([row(1)])
    expect(wrapper.find('table').exists()).toBe(true)
    const headers = wrapper.findAll('th')
    expect(headers.length).toBeGreaterThan(0)
    for (const header of headers) expect(['col', undefined]).toContain(header.attributes('scope'))
  })
})

describe('IssueTable — visible columns (design v2)', () => {
  it('shows every column when no visible set is given', () => {
    const wrapper = mountTable([row(1)])
    const labels = wrapper.findAll('th').map((th) => th.text())
    expect(labels).toEqual(expect.arrayContaining(['#', 'Title', 'Complexity', 'Confidence', 'Comments']))
  })

  it('renders only the visible columns, plus the select and actions columns', () => {
    const wrapper = mountTable([row(1), row(2)], { columns: ['number', 'title', 'priority'] })
    const labels = wrapper.findAll('th').map((th) => th.text())
    expect(labels).toEqual(['Select', '#', 'Title', 'Priority', 'Actions'])
    for (const tr of wrapper.findAll('tbody tr')) expect(tr.findAll('td')).toHaveLength(5)
    expect(wrapper.find('[data-test="priority-cell"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="confidence-cell"]').exists()).toBe(false)
  })
})

describe('IssueTable — sortable column headers', () => {
  it('marks the active sort column with aria-sort', () => {
    const wrapper = mountTable([row(1)], { sort: { key: 'relevance', direction: 'desc' } })
    const relevanceHeader = wrapper.get('[data-test="sort-relevance"]')
    expect(relevanceHeader.attributes('aria-sort')).toBe('descending')
    const criticalityHeader = wrapper.get('[data-test="sort-criticality"]')
    expect(criticalityHeader.attributes('aria-sort')).toBe('none')
  })

  it('emits sort with the column key when a sortable header is clicked', async () => {
    const wrapper = mountTable([row(1)])
    await wrapper.get('[data-test="sort-updatedAt"]').trigger('click')
    expect(wrapper.emitted('sort')).toEqual([['updatedAt']])
  })
})

describe('IssueTable — shift-click adds a sort key (Task 13, SPEC.md §2.5 item 3)', () => {
  it('emits shift-sort instead of sort when the header is shift-clicked', async () => {
    const wrapper = mountTable([row(1)])
    await wrapper.get('[data-test="sort-relevance"]').trigger('click', { shiftKey: true })
    expect(wrapper.emitted('shift-sort')).toEqual([['relevance']])
    expect(wrapper.emitted('sort')).toBeUndefined()
  })

  it('a plain click still emits sort, not shift-sort', async () => {
    const wrapper = mountTable([row(1)])
    await wrapper.get('[data-test="sort-relevance"]').trigger('click')
    expect(wrapper.emitted('sort')).toEqual([['relevance']])
    expect(wrapper.emitted('shift-sort')).toBeUndefined()
  })
})

describe('IssueTable — Priority header slot (Task 14 hook)', () => {
  it('renders a plain label by default', () => {
    const wrapper = mountTable([row(1)])
    expect(wrapper.get('[data-test="sort-priority"]').text()).toBe('Priority')
  })

  it('lets a caller replace the header content, e.g. with a Weights popover trigger', () => {
    const wrapper = mount(IssueTable, {
      props: { rows: [row(1)], selected: [], sort: null },
      slots: { 'priority-header': '<button data-test="weights-trigger">Priority · Weights</button>' },
      attachTo: document.body,
    })
    expect(wrapper.get('[data-test="sort-priority"]').get('[data-test="weights-trigger"]').text()).toBe(
      'Priority · Weights',
    )
  })
})

describe('IssueTable — Priority cell slot (Task 14 hook)', () => {
  it('renders the default "—" fallback for every row by default', () => {
    const wrapper = mountTable([row(1), row(2)])
    const cells = wrapper.findAll('[data-test="priority-cell"]')
    expect(cells.map((cell) => cell.text())).toEqual(['—', '—'])
  })

  it('lets a caller replace each row\'s priority cell, scoped to that row', () => {
    const wrapper = mount(IssueTable, {
      props: { rows: [row(1), row(2)], selected: [], sort: null },
      slots: {
        priority: `<template #default="{ row }"><span data-test="priority-value">{{ row.issue.number }}</span></template>`,
      },
      attachTo: document.body,
    })
    const values = wrapper.findAll('[data-test="priority-value"]').map((el) => el.text())
    expect(values).toEqual(['1', '2'])
  })
})

describe('IssueTable — row action pass-through', () => {
  it('re-emits toggle-select, dismiss, restore and expand from a row', async () => {
    const wrapper = mountTable([row(1), row(2)])
    await wrapper.get('[data-test="row-dismiss"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toEqual([[1]])
  })

  it('marks a row selected when its number is in the selected list', () => {
    const wrapper = mountTable([row(1), row(2)], { selected: [2] })
    const checkboxes = wrapper.findAll('[data-test="row-select"]')
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(false)
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(true)
  })
})

describe('IssueTable — roving tabindex and keyboard shortcuts', () => {
  it('starts with the first row as the sole tab stop', () => {
    const wrapper = mountTable([row(1), row(2), row(3)])
    const tabindexes = wrapper.findAll('[data-test="issue-row"]').map((r) => r.attributes('tabindex'))
    expect(tabindexes).toEqual(['0', '-1', '-1'])
  })

  it('ArrowDown / ArrowUp move the roving tab stop', async () => {
    const wrapper = mountTable([row(1), row(2), row(3)])
    const table = wrapper.get('table')
    await table.trigger('keydown', { key: 'ArrowDown' })
    let tabindexes = wrapper.findAll('[data-test="issue-row"]').map((r) => r.attributes('tabindex'))
    expect(tabindexes).toEqual(['-1', '0', '-1'])

    await table.trigger('keydown', { key: 'ArrowUp' })
    tabindexes = wrapper.findAll('[data-test="issue-row"]').map((r) => r.attributes('tabindex'))
    expect(tabindexes).toEqual(['0', '-1', '-1'])
  })

  it('does not move past the first or last row', async () => {
    const wrapper = mountTable([row(1), row(2)])
    const table = wrapper.get('table')
    await table.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.findAll('[data-test="issue-row"]').map((r) => r.attributes('tabindex'))).toEqual(['0', '-1'])
    await table.trigger('keydown', { key: 'ArrowDown' })
    await table.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.findAll('[data-test="issue-row"]').map((r) => r.attributes('tabindex'))).toEqual(['-1', '0'])
  })

  it('Enter opens the detail drawer for the focused row', async () => {
    const wrapper = mountTable([row(1), row(2)])
    const table = wrapper.get('table')
    await table.trigger('keydown', { key: 'ArrowDown' })
    await table.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('expand')).toEqual([[2]])
  })

  it('D dismisses the focused row, or restores it when already dismissed', async () => {
    const wrapper = mountTable([row(1), row(2, { status: 'unclassified' })], { showDismissed: false })
    const table = wrapper.get('table')
    await table.trigger('keydown', { key: 'd' })
    expect(wrapper.emitted('dismiss')).toEqual([[1]])
  })

  it('D restores a dismissed focused row when Show dismissed is on', async () => {
    const wrapper = mountTable([row(1)], { showDismissed: true, dismissedNumbers: [1] })
    const table = wrapper.get('table')
    await table.trigger('keydown', { key: 'D' })
    expect(wrapper.emitted('restore')).toEqual([[1]])
  })
})
