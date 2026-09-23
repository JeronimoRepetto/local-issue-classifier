// Task INT — SPEC.md §2.4 / §2.5 / §6.1 screen 3: the analysis view
// container. Replaces AnalysisViewPlaceholder.vue: mounts IssuesContainer and
// ClassifyContainer over the current analysis, wires refresh/back/open-settings
// and owns the "?" shortcuts help dialog left out by Task 12.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createAnalysis, dismiss } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

type AnalysisModule = typeof import('../../composables/useAnalysis')
type ViewModule = typeof import('../../composables/useView')
type RepoModule = typeof import('../../composables/useRepo')
type ContainerModule = typeof import('./AnalysisViewContainer.vue')

let storage: MemoryStorage
let analysisMod: AnalysisModule
let viewMod: ViewModule
let repoMod: RepoModule
let AnalysisViewContainer: ContainerModule['default']

/** #1 and #2 unclassified, #3 dismissed. */
function seedAnalysis(id = 'a1'): Analysis {
  const a = createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [fakeIssue(1), fakeIssue(2), fakeIssue(3)],
    commentsFetched: false,
  })
  return dismiss(a, [3], '2026-03-01T10:00:00Z')
}

async function freshEnv() {
  vi.resetModules()
  const { setAppStorage } = await import('../../adapters/storage/appStorage')
  storage = new MemoryStorage()
  setAppStorage(storage)
  analysisMod = await import('../../composables/useAnalysis')
  viewMod = await import('../../composables/useView')
  repoMod = await import('../../composables/useRepo')
  analysisMod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
  repoMod.resetRepoForTests()
  const mod: ContainerModule = await import('./AnalysisViewContainer.vue')
  AnalysisViewContainer = mod.default
}

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('AnalysisViewContainer', () => {
  beforeEach(async () => {
    await freshEnv()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('mounts IssuesContainer and ClassifyContainer for the current analysis', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    expect(wrapper.find('[data-test="issue-count"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="classify-start"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('routes "back" to useView().goHome()', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    viewMod.useView().openSettings() // start somewhere else than home
    viewMod.useView().state.view = 'analysis'
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    await wrapper.get('[data-test="back"]').trigger('click')
    expect(viewMod.useView().state.view).toBe('home')
    wrapper.unmount()
  })

  it('routes "open-settings" from ClassifyContainer to useView().openSettings()', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    await wrapper.get('[data-test="classify-open-settings"]').trigger('click')
    expect(viewMod.useView().state.view).toBe('settings')
    wrapper.unmount()
  })

  it('routes "refresh" to useRepo().refresh(currentAnalysisId), and binds refreshing to the load state', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
    let resolveFetch!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveFetch = resolve
    })
    repoMod.configureRepo({
      fetchImpl: (async () => {
        await gate
        return new Response('{"message":"Not Found"}', { status: 404 })
      }) as unknown as typeof fetch,
    })

    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    await wrapper.get('[data-test="refresh"]').trigger('click')
    await flush()
    expect(wrapper.get('[data-test="refresh"]').attributes('disabled')).toBeDefined()

    resolveFetch()
    await flushPromises()
    wrapper.unmount()
  })

  it('passes filteredNumbers to ClassifyContainer as the visible, non-dismissed issue numbers', async () => {
    // #3 is dismissed by seedAnalysis, so only #1 and #2 count toward "filtered".
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    const optionLabels = wrapper.findAll('option').map((o) => o.text())
    expect(optionLabels).toContain('Classify filtered view (2)')
    wrapper.unmount()
  })

  it('excludes a dismissed row from filteredNumbers even when "Show dismissed" is on', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    analysisMod.useAnalysis().updateWorking({ showDismissed: true })
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()
    const optionLabels = wrapper.findAll('option').map((o) => o.text())
    expect(optionLabels).toContain('Classify filtered view (2)')
    wrapper.unmount()
  })

  it('"?" opens the shortcuts help dialog, but is ignored while typing', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(AnalysisViewContainer, { attachTo: document.body })
    await flush()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    await flush()
    expect(document.body.textContent).not.toContain('Keyboard shortcuts')
    input.remove()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
    await flush()
    expect(document.body.textContent).toContain('Keyboard shortcuts')
    wrapper.unmount()
  })
})
