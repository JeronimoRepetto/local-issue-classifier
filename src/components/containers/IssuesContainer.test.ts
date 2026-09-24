// Task 12 — screen 3: the Issues screen container. Wires
// useAnalysis()/useFilters() to FilterBar, DismissToggle, IssueTable and the
// detail drawer; owns bulk dismiss/undo, Show dismissed, Remove missing and
// the "/" shortcut (D/Enter/arrows are IssueTable's own, tested there).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createAnalysis } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeClassification, fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

type AnalysisModule = typeof import('../../composables/useAnalysis')
type ContainerModule = typeof import('./IssuesContainer.vue')

let storage: MemoryStorage
let analysisMod: AnalysisModule
let IssuesContainer: ContainerModule['default']

function seedAnalysis(id = 'a1'): Analysis {
  return createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [
      fakeIssue(1, { title: 'Crash on empty list', labels: ['bug'] }),
      fakeIssue(2, { title: 'Improve docs', labels: ['docs'] }),
      fakeIssue(3, { title: 'Ghost issue' }),
    ],
    commentsFetched: false,
  })
}

async function freshEnv() {
  vi.resetModules()
  storage = new MemoryStorage()
  const storageModule = await import('../../adapters/storage/appStorage')
  storageModule.setAppStorage(storage)
  analysisMod = await import('../../composables/useAnalysis')
  analysisMod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
  const mod: ContainerModule = await import('./IssuesContainer.vue')
  IssuesContainer = mod.default
}

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('IssuesContainer', () => {
  beforeEach(async () => {
    await freshEnv()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('hides the secondary columns by default and re-enables them from the Columns menu', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()
    const headers = () => wrapper.findAll('th').map((th) => th.text())
    expect(headers()).not.toContain('Complexity')
    await wrapper.get('[data-test="columns-trigger"]').trigger('click')
    await wrapper.get('[data-test="column-toggle-complexity"]').setValue(true)
    await flush()
    expect(headers()).toContain('Complexity')
    expect((analysisMod.useAnalysis().current.value?.working as { visibleColumns?: string[] }).visibleColumns).toContain(
      'complexity',
    )
  })

  it('shows "K of N issues" for the current analysis', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()
    expect(wrapper.get('[data-test="issue-count"]').text()).toBe('3 of 3 issues')
  })

  it('passes the classified rows\' models to AnalysisHeader, single then mixed', async () => {
    const analysis = seedAnalysis()
    analysis.rows[0].status = 'done'
    analysis.rows[0].classification = fakeClassification({ model: 'jev-1.13.0' })
    analysisMod.useAnalysis().setCurrent(analysis)
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()
    expect(wrapper.get('[data-test="classified-by"]').text()).toBe('Classified by: jev-1.13.0')

    analysisMod.useAnalysis().update((a) => {
      const rows = a.rows.slice()
      rows[1] = { ...rows[1], status: 'done', classification: fakeClassification({ model: 'kev-latest' }) }
      return { ...a, rows }
    }, 'classification')
    await flush()
    expect(wrapper.get('[data-test="classified-by"]').text()).toBe('Classified by: mixed (jev-1.13.0 · kev-latest)')
  })

  it('filters the table via FilterBar and updates the count', async () => {
    const analysis = seedAnalysis()
    analysis.rows[0].status = 'done'
    analysis.rows[0].classification = fakeClassification({
      criticality: { level: 'high', score: 2, confidence: 0.9, probabilities: [0, 0, 1] },
    })
    analysisMod.useAnalysis().setCurrent(analysis)
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="filter-criticality"] [data-test="multiselect-trigger"]').trigger('click')
    await wrapper.get('[data-test="filter-criticality"] .ui-multiselect__option').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="issue-count"]').text()).toBe('1 of 3 issues')
  })

  it('dismisses a row and shows an undo toast that restores it', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="row-dismiss"]').trigger('click')
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.dismissed).toEqual([1])
    expect(wrapper.get('[data-test="issue-count"]').text()).toBe('2 of 3 issues')
    expect(wrapper.text()).toContain('Issue dismissed')

    await wrapper.get('[data-test="toast-action"]').trigger('click')
    await flush()
    expect(analysisMod.useAnalysis().current.value?.working.dismissed).toEqual([])
  })

  it('bulk-dismisses selected rows with a single undo toast', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    const checkboxes = wrapper.findAll('[data-test="row-select"]')
    await checkboxes[0].setValue(true)
    await checkboxes[1].setValue(true)
    await flush()

    await wrapper.get('[data-test="bulk-dismiss"]').trigger('click')
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.dismissed?.sort()).toEqual([1, 2])
    expect(wrapper.text()).toContain('2 issues dismissed')
  })

  it('Show dismissed brings dismissed rows back with Restore, and updates the count text', async () => {
    const analysis = seedAnalysis()
    analysisMod.useAnalysis().setCurrent(analysis)
    analysisMod.useAnalysis().dismiss([1])
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    expect(wrapper.get('[data-test="issue-count"]').text()).toBe('2 of 3 issues')
    await wrapper.get('[role="switch"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="issue-count"]').text()).toBe('3 of 3 issues (1 dismissed)')
    await wrapper.get('[data-test="row-restore"]').trigger('click')
    await flush()
    expect(analysisMod.useAnalysis().current.value?.working.dismissed).toEqual([])
  })

  it('Remove missing asks for confirmation before deleting missing rows', async () => {
    const analysis = seedAnalysis()
    analysis.rows[2].sourceStatus = 'missing'
    analysisMod.useAnalysis().setCurrent(analysis)
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    expect(wrapper.text()).toContain('No longer in source')
    await wrapper.get('[data-test="remove-missing"]').trigger('click')
    await flush()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    const confirmButton = document.querySelector('[data-test="confirm-remove-missing"]') as HTMLButtonElement
    confirmButton.click()
    await flush()

    expect(analysisMod.useAnalysis().current.value?.rows).toHaveLength(2)
  })

  it('opens the detail drawer for a row and closes it', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="issue-row"]').trigger('click')
    await flush()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Crash on empty list')

    ;(document.querySelector('[data-test="drawer-close"]') as HTMLButtonElement).click()
    await flush()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('exposes a sort-popover slot (Task 13 hook) with the current sort and setSort', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, {
      attachTo: document.body,
      slots: {
        'sort-popover': `<template #default="{ sort, setSort }">
          <button data-test="sort-popover-trigger" @click="setSort('relevance')">{{ sort?.key ?? 'default' }}</button>
        </template>`,
      },
    })
    await flush()
    const trigger = wrapper.get('[data-test="sort-popover-trigger"]')
    expect(trigger.text()).toBe('criticality')
    await trigger.trigger('click')
    await flush()
    expect(analysisMod.useAnalysis().current.value?.working.tableSort).toEqual([
      { key: 'relevance', direction: 'desc' },
    ])
  })

  it('shift-clicking a sortable header adds it as the next table sort key (Task 13)', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="sort-updatedAt"]').trigger('click', { shiftKey: true })
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.tableSort).toEqual([
      { key: 'criticality', direction: 'desc' },
      { key: 'relevance', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
      { key: 'updatedAt', direction: 'desc' },
    ])
  })

  it('mounts the Weights popover trigger in the Priority column header (Task 14)', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()
    expect(wrapper.find('[data-test="weight-editor-trigger"]').exists()).toBe(true)
  })

  it('shows a Priority value for a classified row and "—" for an unclassified one (Task 14)', async () => {
    const analysis = seedAnalysis()
    analysis.rows[0].status = 'done'
    analysis.rows[0].classification = fakeClassification()
    analysisMod.useAnalysis().setCurrent(analysis)
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    const priorityValues = wrapper.findAll('[data-test="priority-cell"] [data-test="value"]')
    expect(priorityValues[0].text()).not.toBe('—')
    expect(priorityValues[1].text()).toBe('—')
  })

  it('recomputes the Priority column and re-sorts live when working.priorityWeights changes (Task 14)', async () => {
    const analysis = seedAnalysis()
    analysis.rows[0].status = 'done'
    analysis.rows[0].classification = fakeClassification({
      effort: { level: 'high', score: 2, confidence: 0.9, probabilities: [0, 0, 1] },
    })
    analysis.rows[1].status = 'done'
    analysis.rows[1].classification = fakeClassification({
      effort: { level: 'low', score: 0, confidence: 0.9, probabilities: [1, 0, 0] },
    })
    analysisMod.useAnalysis().setCurrent(analysis)
    analysisMod.useAnalysis().updateWorking({
      tableSort: [{ key: 'priority', direction: 'desc' }],
      priorityWeights: { criticality: 0, relevance: 0, complexity: 0, effort: 100 },
    })
    const wrapper = mount(IssuesContainer, { attachTo: document.body })
    await flush()

    // Effort-only weight, inverted: issue #2 (effort score 0) outranks #1 (score 2).
    let numbers = wrapper.findAll('[data-test="issue-row"] a').map((a) => a.text())
    expect(numbers[0]).toBe('#2')

    // Both rows share the same default criticality score (fakeClassification's
    // default, 2), so a criticality-only weight ties them, and the number
    // tie-break decides: #1 leads regardless of the effort difference above.
    analysisMod.useAnalysis().updateWorking({ priorityWeights: { criticality: 100, relevance: 0, complexity: 0, effort: 0 } })
    await flush()

    numbers = wrapper.findAll('[data-test="issue-row"] a').map((a) => a.text())
    expect(numbers[0]).toBe('#1')
  })

  it('"/" focuses the search input', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(IssuesContainer, { attachTo: document.body })
    await flush()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    await flush()
    expect(document.activeElement).toBe(document.querySelector('[data-test="search-input"] input'))
  })
})
