// Task 14 — SPEC.md §2.5 item 3, §4.9: the Priority column's Weights
// popover. Drop this into IssueTable's `priority-header` slot:
//   <IssueTable><template #priority-header><PriorityContainer /></template></IssueTable>
// It owns useAnalysis() itself to read/write `working.priorityWeights`
// (persisted per analysis, same debounced save as every other working-state
// change), mirroring how SortPopoverContainer owns useFilters().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createAnalysis } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { defaultPreferences, defaultProjectContext, defaultPriorityWeights } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

type AnalysisModule = typeof import('../../composables/useAnalysis')
type ContainerModule = typeof import('./PriorityContainer.vue')
type IssueTableModule = typeof import('../ui/IssueTable.vue')

let storage: MemoryStorage
let analysisMod: AnalysisModule
let PriorityContainer: ContainerModule['default']
let IssueTable: IssueTableModule['default']

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
  const mod: ContainerModule = await import('./PriorityContainer.vue')
  PriorityContainer = mod.default
  const tableMod: IssueTableModule = await import('../ui/IssueTable.vue')
  IssueTable = tableMod.default
}

const flush = async () => {
  await nextTick()
  await nextTick()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function numberValue(wrapper: VueWrapper<any>, testId: string): string {
  return (wrapper.get(`[data-test="${testId}"] input[type="number"]`).element as HTMLInputElement).value
}

describe('PriorityContainer', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    await freshEnv()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('opens the Weights popover seeded with the current analysis weights', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(PriorityContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="weight-editor-trigger"]').trigger('click')
    await flush()

    expect(numberValue(wrapper, 'weight-criticality')).toBe('40')
    expect(numberValue(wrapper, 'weight-relevance')).toBe('30')
    expect(numberValue(wrapper, 'weight-complexity')).toBe('15')
    expect(numberValue(wrapper, 'weight-effort')).toBe('15')
  })

  it('changing a weight updates working.priorityWeights after the 150 ms debounce, and it persists', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(PriorityContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="weight-editor-trigger"]').trigger('click')
    await flush()

    const criticalityInput = wrapper.get('[data-test="weight-criticality"] input[type="number"]')
    await criticalityInput.setValue('60')
    await criticalityInput.trigger('change')

    expect(analysisMod.useAnalysis().current.value?.working.priorityWeights.criticality).toBe(40)
    vi.advanceTimersByTime(150)
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.priorityWeights).toEqual({
      criticality: 60,
      relevance: 30,
      complexity: 15,
      effort: 15,
    })

    vi.advanceTimersByTime(600) // past the 500 ms working-state save debounce
    const stored = JSON.parse(storage.getItem('issue-criticity:analysis:v1:a1') as string)
    expect(stored.working.priorityWeights.criticality).toBe(60)
  })

  it('Reset restores the defaults through the same popover', async () => {
    const seeded = seedAnalysis()
    seeded.working.priorityWeights = { criticality: 100, relevance: 0, complexity: 0, effort: 0 }
    analysisMod.useAnalysis().setCurrent(seeded)
    const wrapper = mount(PriorityContainer, { attachTo: document.body })
    await flush()

    await wrapper.get('[data-test="weight-editor-trigger"]').trigger('click')
    await flush()
    await wrapper.get('[data-test="weight-reset"]').trigger('click')
    vi.advanceTimersByTime(150)
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.priorityWeights).toEqual(defaultPriorityWeights())
  })

  it("drops into IssueTable's priority-header slot without triggering the column's sort click", async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(IssueTable, {
      props: { rows: [], selected: [], sort: null },
      slots: { 'priority-header': PriorityContainer },
      attachTo: document.body,
    })
    await flush()

    await wrapper.get('[data-test="weight-editor-trigger"]').trigger('click')
    await flush()
    expect(wrapper.emitted('sort')).toBeUndefined()

    await wrapper.get('[data-test="weight-reset"]').trigger('click')
    expect(wrapper.emitted('sort')).toBeUndefined()
  })
})
