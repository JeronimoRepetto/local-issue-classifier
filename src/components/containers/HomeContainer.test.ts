// Wiring tests: AnalysisList/AnalysisCard/ConfirmDialog are unit-tested on
// their own, so these check that HomeContainer routes each event to the
// right composable call and reacts to shared state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { fakeBrowserRuntime } from '../../../tests/fakes/fakeBrowserRuntime'
import { createAnalysis } from '../../domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import type { Analysis } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

let storage: MemoryStorage
let HomeContainer: typeof import('./HomeContainer.vue')['default']
let dbMod: typeof import('../../adapters/storage/analysisDb')
let analysisMod: typeof import('../../composables/useAnalysis')
let analysesMod: typeof import('../../composables/useAnalyses')
let viewMod: typeof import('../../composables/useView')
let repoMod: typeof import('../../composables/useRepo')

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

/** Saved analyses live in IndexedDB (the per-test fake from tests/setup/indexedDb.ts). */
const seed = (a: Analysis) => dbMod.getAnalysisDb().saveAnalysis(a)
/** Waits for pending saves, list refreshes and the re-render they cause. */
async function settle(): Promise<void> {
  await analysesMod.useAnalyses().settled()
  await flushPromises()
}

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  ;(await import('../../adapters/storage/appStorage')).setAppStorage(storage)
  dbMod = await import('../../adapters/storage/analysisDb')
  analysisMod = await import('../../composables/useAnalysis')
  analysesMod = await import('../../composables/useAnalyses')
  viewMod = await import('../../composables/useView')
  analysisMod.configureAnalysis({ clock: () => '2026-06-05T00:00:00Z' })
  repoMod = await import('../../composables/useRepo')
  repoMod.configureRepo({ fetchImpl: (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch })
  HomeContainer = (await import('./HomeContainer.vue')).default
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('HomeContainer', () => {
  it('lists saved analyses newest first and shows the storage meter', async () => {
    await seed(analysis('old', '2026-01-01T00:00:00Z'))
    await seed(analysis('new', '2026-02-01T00:00:00Z'))
    const wrapper = mount(HomeContainer)
    await settle()
    const cards = wrapper.findAll('[data-test="analysis-card"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('acme/widgets')
    expect(wrapper.find('[data-test="storage-meter"]').exists()).toBe(true)
  })

  it('has one pixel page heading, a lede and a saved-analyses kicker with the storage meter', async () => {
    await seed(analysis('a1', '2026-01-01T00:00:00Z'))
    const wrapper = mount(HomeContainer)
    await settle()
    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0].classes()).toContain('u-pixel-font')
    expect(wrapper.find('[data-test="home-lede"]').text().length).toBeGreaterThan(0)
    const kicker = wrapper.get('[data-test="saved-kicker"]')
    expect(kicker.text()).toContain('Saved analyses')
    expect(kicker.find('[data-test="storage-meter"]').exists()).toBe(true)
  })

  it('open switches to the analysis view', async () => {
    await seed(analysis('a1', '2026-01-01T00:00:00Z'))
    const wrapper = mount(HomeContainer)
    await settle()
    await wrapper.find('[data-test="analysis-card"]').trigger('click')
    await settle()
    expect(viewMod.useView().state.view).toBe('analysis')
    expect(analysisMod.useAnalysis().current.value?.id).toBe('a1')
  })

  it('rename updates the saved entry', async () => {
    await seed(analysis('a1', '2026-01-01T00:00:00Z'))
    const wrapper = mount(HomeContainer)
    await settle()
    await wrapper.get('[data-test="rename"]').trigger('click')
    await wrapper.find('[data-test="analysis-card"] input[type="text"]').setValue('My triage')
    await wrapper.find('[data-test="analysis-card"] form').trigger('submit')
    await settle()
    expect(analysesMod.useAnalyses().state.entries.map((e) => (e.status === 'ok' ? e.summary.name : ''))).toEqual([
      'My triage',
    ])
  })

  it('delete (after the card confirms) removes the analysis', async () => {
    await seed(analysis('a1', '2026-01-01T00:00:00Z'))
    const wrapper = mount(HomeContainer, { attachTo: document.body })
    await settle()
    await wrapper.get('[data-test="delete"]').trigger('click')
    ;(document.querySelector('[data-test="confirm-dialog-confirm"]') as HTMLButtonElement).click()
    await settle()
    expect(analysesMod.useAnalyses().state.entries).toEqual([])
    wrapper.unmount()
  })

  it('Clear all local data needs the typed confirmation, then clears storage', async () => {
    await seed(analysis('a1', '2026-01-01T00:00:00Z'))
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
    await settle()
    expect(analysesMod.useAnalyses().state.entries).toEqual([])
    expect(await dbMod.getAnalysisDb().loadIndex()).toEqual([])
    expect(onClearAll).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('shows the save-failed notice with Retry when the current save failed', async () => {
    vi.spyOn(dbMod.getAnalysisDb(), 'saveAnalysis').mockResolvedValueOnce({ ok: false, reason: 'quota' })
    await analysisMod.useAnalysis().setCurrent(analysis('a1', '2026-01-01T00:00:00Z'))
    expect(analysisMod.useAnalysis().status.save).toBe('failed')
    const wrapper = mount(HomeContainer)
    await settle()
    expect(wrapper.find('[data-test="save-failed-notice"]').exists()).toBe(true)

    await wrapper.get('[data-test="retry-save"]').trigger('click')
    await settle()
    expect(analysisMod.useAnalysis().status.save).toBe('saved')
    vi.restoreAllMocks()
  })

  it('Refresh on a saved (not current) card loads it from the database before re-fetching', async () => {
    await seed(analysis('a1', '2026-01-01T00:00:00Z'))
    const wrapper = mount(HomeContainer)
    await settle()
    await wrapper.get('[data-test="refresh"]').trigger('click')
    await vi.waitFor(() => expect(repoMod.useRepo().state.phase).toBe('error'))
    expect(analysisMod.useAnalysis().current.value?.id).toBe('a1')
    // The GitHub fake answers 404: the refresh really ran, instead of failing to find its target.
    expect(repoMod.useRepo().state.error).not.toBe('This analysis could not be loaded.')
  })

  it('the first-run checklist marks "Repository" done once a new analysis loads', async () => {
    const rateHeaders = {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-used': '1',
      'x-ratelimit-reset': '9999999999',
    }
    repoMod.configureRepo({
      fetchImpl: (async (input: RequestInfo | URL) => {
        const path = String(input).slice('https://api.github.com'.length)
        if (path === '/repos/acme/widgets') {
          return new Response(
            JSON.stringify({
              name: 'widgets',
              full_name: 'acme/widgets',
              owner: { login: 'acme' },
              description: null,
              topics: [],
              default_branch: 'main',
              private: false,
              has_issues: true,
              open_issues_count: 1,
              html_url: 'https://github.com/acme/widgets',
            }),
            { status: 200, headers: rateHeaders },
          )
        }
        if (/\/issues\?state=open/.test(path)) {
          return new Response('[]', { status: 200, headers: rateHeaders })
        }
        return new Response('{"message":"Not Found"}', { status: 404, headers: rateHeaders })
      }) as unknown as typeof fetch,
      getPreferences: () => ({ ...defaultPreferences(), fetchComments: 'never' }),
    })
    const wrapper = mount(HomeContainer)
    await settle()
    const repoStep = () => wrapper.findAll('.onboarding-checklist__item')[1]
    expect(repoStep().text()).toContain('Repository')
    expect(repoStep().classes()).not.toContain('onboarding-checklist__item--done')

    await wrapper.find('input[type="text"]').setValue('acme/widgets')
    await wrapper.find('[data-test="repo-input"]').trigger('submit')
    await vi.waitFor(() => expect(viewMod.useView().state.view).toBe('analysis'))
    await wrapper.vm.$nextTick()

    expect(repoMod.readStoredPreferences().onboarding.repo).toBe(true)
    expect(repoStep().classes()).toContain('onboarding-checklist__item--done')
  })

  it('shows the provider onboarding card directly above the repo loader, and leaves the one primary action unchanged', async () => {
    const wrapper = mount(HomeContainer)
    await settle()

    expect(wrapper.find('[data-test="provider-onboarding-card"]').exists()).toBe(true)

    // RepoInput's "New analysis" stays the only primary-variant action on Home.
    const submit = wrapper.get('[data-test="repo-input-submit"]')
    expect(submit.classes()).toContain('ui-button--primary')
    expect(wrapper.find('[data-test="provider-onboarding-card"] .ui-button--primary').exists()).toBe(false)

    // Mounted directly above RepoLoaderContainer (see HomeContainer.vue's own
    // comment: "the single primary action on this screen is New analysis").
    const html = wrapper.html()
    expect(html.indexOf('provider-onboarding-card')).toBeGreaterThan(-1)
    expect(html.indexOf('provider-onboarding-card')).toBeLessThan(html.indexOf('data-test="repo-input"'))
  })

  // Layout change (user decisions 2026-09-24): "Your computer" moved out of
  // the provider card into its own sibling panel in a Home row.
  it('renders the hardware summary panel as a sibling of the provider card, not inside it', async () => {
    const wrapper = mount(HomeContainer)
    await settle()

    const panel = wrapper.find('[data-test="hardware-summary-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('Your computer')
    expect(wrapper.find('[data-test="provider-onboarding-card"] [data-test="hardware-summary-panel"]').exists()).toBe(
      false,
    )

    const html = wrapper.html()
    const cardClose = html.indexOf('provider-onboarding-card')
    expect(cardClose).toBeGreaterThan(-1)
    expect(html.indexOf('hardware-summary-panel')).toBeGreaterThan(cardClose)
  })

  // "Keys" step (user report, 2026-09-24): cloud (TypeSafe) is done only once
  // a Jev key is actually present; local is done only once the provider probe
  // has actually succeeded, not merely once a base URL is configured — a
  // configured-but-unprobed local server must not read as ready.
  describe('"Keys" step', () => {
    it('cloud (TypeSafe) without a Jev key is not done', async () => {
      const wrapper = mount(HomeContainer)
      await wrapper.vm.$nextTick()

      const keysStep = () => wrapper.findAll('.onboarding-checklist__item')[0]
      expect(keysStep().text()).toContain('Keys')
      expect(keysStep().classes()).not.toContain('onboarding-checklist__item--done')
    })

    it('cloud (TypeSafe) with a Jev key is done', async () => {
      const secretsMod = await import('../../composables/useSecrets')
      const wrapper = mount(HomeContainer)
      await wrapper.vm.$nextTick()

      secretsMod.useSecrets().setJevKey('test-key')
      await wrapper.vm.$nextTick()

      const keysStep = () => wrapper.findAll('.onboarding-checklist__item')[0]
      expect(keysStep().classes()).toContain('onboarding-checklist__item--done')
    })

    it('local, configured but never probed, is not done', async () => {
      const preferenceMod = await import('../../composables/usePreferences')
      const { defaultLocalProviderConfig } = await import('../../domain/provider')
      preferenceMod.usePreferences().update({ provider: defaultLocalProviderConfig() })

      const wrapper = mount(HomeContainer)
      await wrapper.vm.$nextTick()

      const keysStep = () => wrapper.findAll('.onboarding-checklist__item')[0]
      expect(keysStep().classes()).not.toContain('onboarding-checklist__item--done')
    })

    it('local, after a successful probe, is done', async () => {
      const preferenceMod = await import('../../composables/usePreferences')
      const { defaultLocalProviderConfig } = await import('../../domain/provider')
      preferenceMod.usePreferences().update({ provider: defaultLocalProviderConfig() })
      const providerMod = await import('../../composables/useProvider')
      providerMod.configureProvider({
        fetch: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      })

      const wrapper = mount(HomeContainer)
      await providerMod.useProvider().probe()
      await wrapper.vm.$nextTick()

      const keysStep = () => wrapper.findAll('.onboarding-checklist__item')[0]
      expect(keysStep().classes()).toContain('onboarding-checklist__item--done')
    })
  })

  it('derives "Repository" step from saved analyses or current analysis', async () => {
    const wrapper = mount(HomeContainer)
    await wrapper.vm.$nextTick()

    const repoStep = () => wrapper.findAll('.onboarding-checklist__item')[1]
    expect(repoStep().text()).toContain('Repository')
    expect(repoStep().classes()).not.toContain('onboarding-checklist__item--done')

    // Add a saved analysis
    await seed(analysis('a1', '2026-01-01T00:00:00Z'))
    await analysesMod.useAnalyses().refresh()
    await wrapper.vm.$nextTick()

    expect(repoStep().classes()).toContain('onboarding-checklist__item--done')
  })

  it('derives "Classify" step from classified issues in saved analyses or current analysis', async () => {
    const wrapper = mount(HomeContainer)
    await wrapper.vm.$nextTick()

    const classifyStep = () => wrapper.findAll('.onboarding-checklist__item')[2]
    expect(classifyStep().text()).toContain('Classify')
    expect(classifyStep().classes()).not.toContain('onboarding-checklist__item--done')

    // Create an analysis with a classified issue
    const testAnalysis = analysis('a1', '2026-01-01T00:00:00Z')
    testAnalysis.rows[0].classification = {
      complexity: { level: 'low', score: 0.5, probabilities: [0.8, 0.15, 0.05] },
      criticality: { level: 'medium', score: 1, probabilities: [0.2, 0.7, 0.1] },
      effort: { level: 'high', score: 2, probabilities: [0.1, 0.2, 0.7] },
      relevance: { value: 50, score: 2, probabilities: [0.2, 0.3, 0.3, 0.1, 0.1] },
      kind: { choice: 'bug' },
      model: 'jev-1.0.0',
      questionsVersion: 1,
      issueUpdatedAt: '2026-01-01T00:00:00Z',
      classifiedAt: '2026-01-01T00:00:00Z',
      inputTokens: 100,
    }
    testAnalysis.rows[0].status = 'done'
    await seed(testAnalysis)
    await analysesMod.useAnalyses().refresh()
    await wrapper.vm.$nextTick()

    expect(classifyStep().classes()).toContain('onboarding-checklist__item--done')
  })

  it('hides the checklist when all three steps are done', async () => {
    const secretsMod = await import('../../composables/useSecrets')
    const preferenceMod = await import('../../composables/usePreferences')

    // Set provider ready
    secretsMod.useSecrets().setJevKey('test-key')
    // Add saved analysis with classification
    const testAnalysis = analysis('a1', '2026-01-01T00:00:00Z')
    testAnalysis.rows[0].classification = {
      complexity: { level: 'low', score: 0.5, probabilities: [0.8, 0.15, 0.05] },
      criticality: { level: 'medium', score: 1, probabilities: [0.2, 0.7, 0.1] },
      effort: { level: 'high', score: 2, probabilities: [0.1, 0.2, 0.7] },
      relevance: { value: 50, score: 2, probabilities: [0.2, 0.3, 0.3, 0.1, 0.1] },
      kind: { choice: 'bug' },
      model: 'jev-1.0.0',
      questionsVersion: 1,
      issueUpdatedAt: '2026-01-01T00:00:00Z',
      classifiedAt: '2026-01-01T00:00:00Z',
      inputTokens: 100,
    }
    testAnalysis.rows[0].status = 'done'
    await seed(testAnalysis)

    const wrapper = mount(HomeContainer)
    await settle()

    expect(wrapper.find('[data-test="onboarding-checklist"]').exists()).toBe(false)
  })

  it('"Keys" step for the browser provider is done once its model is loaded', async () => {
    const preferenceMod = await import('../../composables/usePreferences')
    const { defaultBrowserProviderConfig } = await import('../../domain/provider')
    preferenceMod.usePreferences().update({ provider: defaultBrowserProviderConfig() })
    const providerMod = await import('../../composables/useProvider')
    providerMod.configureProvider({ browser: fakeBrowserRuntime() })

    const wrapper = mount(HomeContainer)
    await wrapper.vm.$nextTick()
    const keysStep = () => wrapper.findAll('.onboarding-checklist__item')[0]
    expect(keysStep().classes()).not.toContain('onboarding-checklist__item--done')

    await providerMod.useProvider().downloadBrowserModel()
    await wrapper.vm.$nextTick()
    expect(keysStep().classes()).toContain('onboarding-checklist__item--done')
  })
})
