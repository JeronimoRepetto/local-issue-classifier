// Task 12 — SPEC.md §6.3: one row of the issues table.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueRow from './IssueRow.vue'
import { fakeClassification, fakeIssue } from '../../../tests/fakes/domainFixtures'
import type { IssueRow as DomainIssueRow } from '../../domain/types'

function row(overrides: Partial<DomainIssueRow> = {}): DomainIssueRow {
  return {
    issue: fakeIssue(42, { title: 'Crash on empty list', labels: ['bug', 'p1'], commentCount: 3 }),
    status: 'unclassified',
    classification: null,
    error: null,
    sourceStatus: 'present',
    ...overrides,
  }
}

function mountRow(props: Partial<InstanceType<typeof IssueRow>['$props']> = {}) {
  return mount(IssueRow, {
    props: { row: row(), selected: false, dismissed: false, tabindex: -1, ...props },
    global: { stubs: { teleport: true } },
  })
}

describe('IssueRow', () => {
  it('renders the number as a GitHub link, the title and label chips', () => {
    const wrapper = mountRow()
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('https://github.com/acme/widgets/issues/42')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.text()).toContain('Crash on empty list')
    expect(wrapper.text()).toContain('bug')
    expect(wrapper.text()).toContain('p1')
  })

  it('shows the classification cells when classified', () => {
    const wrapper = mountRow({ row: row({ status: 'done', classification: fakeClassification() }) })
    expect(wrapper.findComponent({ name: 'LevelCell' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'RelevanceCell' }).exists()).toBe(true)
  })

  it('applies the roving tabindex prop to the row element', () => {
    const wrapper = mountRow({ tabindex: 0 })
    expect(wrapper.get('[data-test="issue-row"]').attributes('tabindex')).toBe('0')
    expect(mountRow({ tabindex: -1 }).get('[data-test="issue-row"]').attributes('tabindex')).toBe('-1')
  })

  it('toggling the checkbox emits toggle-select with the issue number', async () => {
    const wrapper = mountRow()
    await wrapper.get('[data-test="row-select"]').setValue(true)
    expect(wrapper.emitted('toggle-select')).toEqual([[42]])
  })

  it('shows Dismiss when not dismissed, and emits dismiss on click', async () => {
    const wrapper = mountRow({ dismissed: false })
    const button = wrapper.get('[data-test="row-dismiss"]')
    expect(button.text()).toBe('Dismiss')
    await button.trigger('click')
    expect(wrapper.emitted('dismiss')).toEqual([[42]])
  })

  it('shows Restore when dismissed, and emits restore on click, with a muted style', async () => {
    const wrapper = mountRow({ dismissed: true })
    expect(wrapper.get('[data-test="issue-row"]').classes()).toContain('issue-row--dismissed')
    const button = wrapper.get('[data-test="row-restore"]')
    expect(button.text()).toBe('Restore')
    await button.trigger('click')
    expect(wrapper.emitted('restore')).toEqual([[42]])
  })

  it('shows the "no longer in source" badge for a missing row', () => {
    const wrapper = mountRow({ row: row({ sourceStatus: 'missing' }) })
    expect(wrapper.text()).toContain('No longer in source')
  })

  it('emits expand with the issue number when the row is clicked', async () => {
    const wrapper = mountRow()
    await wrapper.get('[data-test="issue-row"]').trigger('click')
    expect(wrapper.emitted('expand')).toEqual([[42]])
  })

  it('does not expand when the click originates from an interactive control', async () => {
    const wrapper = mountRow()
    await wrapper.get('[data-test="row-select"]').trigger('click')
    expect(wrapper.emitted('expand')).toBeUndefined()
    await wrapper.get('[data-test="row-dismiss"]').trigger('click')
    expect(wrapper.emitted('expand')).toBeUndefined()
  })

  it('shows a dash in the confidence column when minConfidence is missing (forward-compat)', () => {
    const classification = fakeClassification({ minConfidence: undefined as unknown as number })
    const wrapper = mountRow({ row: row({ status: 'done', classification }) })
    const confidenceCell = wrapper.get('[data-test="confidence-cell"]')
    expect(confidenceCell.findComponent({ name: 'ConfidenceBadge' }).exists()).toBe(false)
    expect(confidenceCell.text()).toBe('—')
  })

  it('has a Priority column slot placeholder for Task 14', () => {
    const wrapper = mountRow()
    expect(wrapper.get('[data-test="priority-cell"]').text()).toBe('—')
  })
})
