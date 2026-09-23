// Task 13 — SPEC.md §2.5 item 3: "A 'Sort' popover reuses SortRuleList to
// edit the full ordered key list." This is the small wrapper that plugs
// into IssuesContainer's `sort-popover` scoped slot: it owns useFilters()
// directly for the full multi-key order (the slot's own `sort`/`setSort`
// props are single-key only, kept for simpler consumers), so IssuesContainer
// itself is untouched by this wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createAnalysis } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

type AnalysisModule = typeof import('../../composables/useAnalysis')
type ContainerModule = typeof import('./SortPopoverContainer.vue')
type IssuesContainerModule = typeof import('./IssuesContainer.vue')

let storage: MemoryStorage
let analysisMod: AnalysisModule
let SortPopoverContainer: ContainerModule['default']
let IssuesContainer: IssuesContainerModule['default']

function seedAnalysis(id = 'a1'): Analysis {
  return createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [fakeIssue(1), fakeIssue(2)],
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
  const mod: ContainerModule = await import('./SortPopoverContainer.vue')
  SortPopoverContainer = mod.default
  const issuesMod: IssuesContainerModule = await import('./IssuesContainer.vue')
  IssuesContainer = issuesMod.default
}

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('SortPopoverContainer', () => {
  beforeEach(async () => {
    await freshEnv()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens to show the full multi-key order via SortRuleList', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(SortPopoverContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="sort-popover-trigger"]').trigger('click')
    await flush()

    const items = wrapper.findAll('[data-test="sort-rule"]')
    expect(items.map((item) => item.text().replace(/[0-9↑↓]/g, '').trim())).toEqual([
      expect.stringContaining('Criticality'),
      expect.stringContaining('Relevance'),
      expect.stringContaining('Effort'),
    ])
  })

  it('reordering through SortRuleList updates working.tableSort', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(SortPopoverContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="sort-popover-trigger"]').trigger('click')
    await flush()

    await wrapper.findAll('[data-test="sort-rule-remove"]')[0].trigger('click')
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.tableSort).toEqual([
      { key: 'relevance', direction: 'desc' },
      { key: 'effort', direction: 'asc' },
    ])
  })

  it('drops into IssuesContainer\'s sort-popover slot without changing that container', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssuesContainer, {
      attachTo: document.body,
      slots: { 'sort-popover': SortPopoverContainer },
    })
    await flush()

    expect(wrapper.findComponent(SortPopoverContainer).exists()).toBe(true)
    await wrapper.get('[data-test="sort-popover-trigger"]').trigger('click')
    await flush()
    expect(wrapper.findAll('[data-test="sort-rule"]').length).toBeGreaterThan(0)
  })
})
