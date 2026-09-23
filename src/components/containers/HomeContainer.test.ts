// Wiring tests: AnalysisList/AnalysisCard/ConfirmDialog are unit-tested on
// their own, so these check that HomeContainer routes each event to the
// right composable call and reacts to shared state (SPEC §2.2 / §8).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createAnalysis } from '../../domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import type { Analysis } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

let storage: MemoryStorage
let HomeContainer: typeof import('./HomeContainer.vue')['default']
let analysisStoreMod: typeof import('../../adapters/storage/analysisStore')
let analysisMod: typeof import('../../composables/useAnalysis')
let analysesMod: typeof import('../../composables/useAnalyses')
let viewMod: typeof import('../../composables/useView')

function analysis(id: string, updatedAt: string): Analysis {
  return {
    ...createAnalysis({
      id,
      repo: fakeRepo(),
      stateFilter: 'open',
      now: updatedAt,
      prefs: defaultPreferences(),
      projectContext: defaultProjectContext('acme/widgets'),
      issues: [fakeIssue(1)],
      commentsFetched: false,
    }),
    updatedAt,
  }
}

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../../adapters/storage/appStorage')).setAppStorage(storage)
  analysisStoreMod = await import('../../adapters/storage/analysisStore')
  analysisMod = await import('../../composables/useAnalysis')
  analysesMod = await import('../../composables/useAnalyses')
  viewMod = await import('../../composables/useView')
  analysisMod.configureAnalysis({ clock: () => '2026-06-05T00:00:00Z' })
  const repoMod = await import('../../composables/useRepo')
  repoMod.configureRepo({ fetchImpl: (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch })
  HomeContainer = (await import('./HomeContainer.vue')).default
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('HomeContainer', () => {
  it('lists saved analyses newest first and shows the storage meter', async () => {
    analysisStoreMod.saveAnalysis(storage, analysis('old', '2026-01-01T00:00:00Z'))
    analysisStoreMod.saveAnalysis(storage, analysis('new', '2026-02-01T00:00:00Z'))
    const wrapper = mount(HomeContainer)
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('[data-test="analysis-card"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('acme/widgets')
    expect(wrapper.find('[data-test="storage-meter"]').exists()).toBe(true)
  })

  it('open switches to the analysis view', async () => {
    analysisStoreMod.saveAnalysis(storage, analysis('a1', '2026-01-01T00:00:00Z'))
    const wrapper = mount(HomeContainer)
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="analysis-card"]').trigger('click')
    expect(viewMod.useView().state.view).toBe('analysis')
    expect(analysisMod.useAnalysis().current.value?.id).toBe('a1')
  })

  it('rename updates the saved entry', async () => {
    analysisStoreMod.saveAnalysis(storage, analysis('a1', '2026-01-01T00:00:00Z'))
    const wrapper = mount(HomeContainer)
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-test="rename"]').trigger('click')
    await wrapper.find('[data-test="analysis-card"] input[type="text"]').setValue('My triage')
    await wrapper.find('[data-test="analysis-card"] form').trigger('submit')
    expect(analysesMod.useAnalyses().state.entries.map((e) => (e.status === 'ok' ? e.summary.name : ''))).toEqual([
      'My triage',
    ])
  })

  it('delete (after the card confirms) removes the analysis', async () => {
    analysisStoreMod.saveAnalysis(storage, analysis('a1', '2026-01-01T00:00:00Z'))
    const wrapper = mount(HomeContainer, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-test="delete"]').trigger('click')
    ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(analysesMod.useAnalyses().state.entries).toEqual([])
    wrapper.unmount()
  })

  it('Clear all local data needs the typed confirmation, then clears storage', async () => {
    analysisStoreMod.saveAnalysis(storage, analysis('a1', '2026-01-01T00:00:00Z'))
    const onClearAll = vi.fn()
    const wrapper = mount(HomeContainer, { props: { onClearAll }, attachTo: document.body })
    await wrapper.get('[data-test="clear-all"]').trigger('click')
    const confirm = document.querySelector('[data-test="dialog-confirm"]') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    const phrase = document.querySelector('[data-test="dialog-phrase"]') as HTMLInputElement
    phrase.value = 'delete'
    phrase.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(analysesMod.useAnalyses().state.entries).toEqual([])
    expect(onClearAll).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('shows the save-failed notice with Retry when the current save failed', async () => {
    storage.quotaBytes = 10
    analysisMod.useAnalysis().setCurrent(analysis('a1', '2026-01-01T00:00:00Z'))
    expect(analysisMod.useAnalysis().status.save).toBe('failed')
    const wrapper = mount(HomeContainer)
    expect(wrapper.find('[data-test="save-failed-notice"]').exists()).toBe(true)

    storage.quotaBytes = Infinity
    await wrapper.get('[data-test="retry-save"]').trigger('click')
    expect(analysisMod.useAnalysis().status.save).toBe('saved')
  })
})
