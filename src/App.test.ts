// App shell (SPEC §6.1): a tiny view state (home | analysis | settings), the
// top bar, and the integration wiring (Task INT): usePreferences before any
// restore, configureRepo(secrets), the keys-required banner and restoring the
// last-opened analysis on boot. Each test reloads the module graph over a
// fresh fake Storage, the same pattern the container tests use, since App.vue
// now touches every module singleton.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createAnalysis } from './domain/analysis'
import { defaultPreferences, defaultProjectContext } from './domain/types'
import { fakeIssue, fakeRepo } from '../tests/fakes/domainFixtures'
import { MemoryStorage } from '../tests/fakes/memoryStorage'
import { saveAnalysis } from './adapters/storage/analysisStore'

type AppModule = typeof import('./App.vue')
type ViewModule = typeof import('./composables/useView')
type AnalysisModule = typeof import('./composables/useAnalysis')
type SecretsModule = typeof import('./composables/useSecrets')
type PreferencesModule = typeof import('./composables/usePreferences')
type RepoModule = typeof import('./composables/useRepo')

let storage: MemoryStorage
let App: AppModule['default']
let viewMod: ViewModule
let analysisMod: AnalysisModule
let secretsMod: SecretsModule
let prefsMod: PreferencesModule
let repoMod: RepoModule

function seedAnalysis(id = 'a1') {
  return createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-06-01T00:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [fakeIssue(1), fakeIssue(2)],
    commentsFetched: false,
  })
}

async function freshEnv() {
  vi.resetModules()
  storage = new MemoryStorage()
  const { setAppStorage } = await import('./adapters/storage/appStorage')
  setAppStorage(storage)
  viewMod = await import('./composables/useView')
  analysisMod = await import('./composables/useAnalysis')
  secretsMod = await import('./composables/useSecrets')
  prefsMod = await import('./composables/usePreferences')
  repoMod = await import('./composables/useRepo')
  analysisMod.configureAnalysis({ clock: () => '2026-06-01T00:00:00Z' })
  repoMod.resetRepoForTests()
  App = (await import('./App.vue')).default
}

const flush = async () => {
  await nextTick()
  await nextTick()
}

beforeEach(async () => {
  await freshEnv()
})

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('App', () => {
  it('mounts and shows the wordmark, with Home as the default view', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('issue-criticity')
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(true)
  })

  it('the Settings gear switches to Settings (SettingsContainer), and the brand returns home', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-test="open-settings"]').trigger('click')
    expect(wrapper.find('[data-test="clear-keys"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(false)

    await wrapper.get('[data-test="brand"]').trigger('click')
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the analysis view (AnalysisViewContainer) once an analysis is opened', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    viewMod.useView().state.view = 'analysis'
    const wrapper = mount(App, { attachTo: document.body })
    await flush()
    expect(wrapper.find('[data-test="issue-count"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="classify-start"]').exists()).toBe(true)
    wrapper.unmount()
  })

  describe('bootstrap ordering', () => {
    it('imports/initialises usePreferences before restoring the last-opened analysis (order test)', async () => {
      const order: string[] = []

      vi.doMock('./composables/usePreferences', async () => {
        const actual =
          await vi.importActual<typeof import('./composables/usePreferences')>('./composables/usePreferences')
        order.push('usePreferences:module-evaluated')
        return {
          ...actual,
          usePreferences: (...args: Parameters<typeof actual.usePreferences>) => {
            order.push('usePreferences:called')
            return actual.usePreferences(...args)
          },
        }
      })

      vi.doMock('./composables/useAnalysis', async () => {
        const actual = await vi.importActual<typeof import('./composables/useAnalysis')>('./composables/useAnalysis')
        return {
          ...actual,
          useAnalysis: () => {
            const store = actual.useAnalysis()
            return {
              ...store,
              restoreLastOpened: (...args: Parameters<typeof store.restoreLastOpened>) => {
                order.push('restoreLastOpened:called')
                return store.restoreLastOpened(...args)
              },
            }
          },
        }
      })

      await freshEnv()
      const wrapper = mount(App)
      await flush()

      expect(order).toContain('usePreferences:module-evaluated')
      expect(order).toContain('restoreLastOpened:called')
      expect(order.indexOf('usePreferences:module-evaluated')).toBeLessThan(order.indexOf('restoreLastOpened:called'))

      wrapper.unmount()
      vi.doUnmock('./composables/usePreferences')
      vi.doUnmock('./composables/useAnalysis')
    })

    it('restores the last-opened analysis and switches to the analysis view on mount', async () => {
      saveAnalysis(storage, seedAnalysis('a1'))
      prefsMod.usePreferences().update({ lastAnalysisId: 'a1' })

      const wrapper = mount(App, { attachTo: document.body })
      await flush()
      expect(viewMod.useView().state.view).toBe('analysis')
      expect(analysisMod.useAnalysis().current.value?.id).toBe('a1')
      expect(wrapper.find('[data-test="issue-count"]').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  describe('secrets wiring (configureRepo)', () => {
    it('wires configureRepo to the secrets GitHub-token getter: fetch sees Authorization only once a token is set', async () => {
      mount(App)
      const authHeaders: (string | undefined)[] = []
      repoMod.configureRepo({
        fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
          const headers = init?.headers as Record<string, string> | undefined
          authHeaders.push(headers?.Authorization)
          return new Response('{"message":"Not Found"}', { status: 404 })
        }) as unknown as typeof fetch,
      })

      await repoMod.useRepo().startNew({ owner: 'acme', repo: 'widgets' }, 'open')
      expect(authHeaders[0]).toBeUndefined()

      repoMod.resetRepoForTests()
      secretsMod.useSecrets().setGitHubToken('ghp_test')
      await repoMod.useRepo().startNew({ owner: 'acme', repo: 'widgets2' }, 'open')
      expect(authHeaders[authHeaders.length - 1]).toBe('Bearer ghp_test')
    })

    it('a 401 from GitHub clears only the GitHub token and shows an inline notice, keeping the Jev key', async () => {
      secretsMod.useSecrets().setJevKey('jev-test')
      secretsMod.useSecrets().setGitHubToken('ghp_test')
      const wrapper = mount(App, { attachTo: document.body })

      repoMod.configureRepo({
        fetchImpl: (async () =>
          new Response('{"message":"Bad credentials"}', { status: 401 })) as unknown as typeof fetch,
      })
      await repoMod.useRepo().startNew({ owner: 'acme', repo: 'widgets' }, 'open')
      await flushPromises()
      await flush()

      expect(secretsMod.useSecrets().state.githubToken).toBe('')
      expect(secretsMod.useSecrets().state.jevApiKey).toBe('jev-test')
      expect(wrapper.text()).toContain('GitHub token')
      wrapper.unmount()
    })
  })

  describe('Clear all local data (Home)', () => {
    it('also clears the in-memory secrets', async () => {
      secretsMod.useSecrets().setJevKey('jev-test')
      secretsMod.useSecrets().setGitHubToken('ghp_test')
      const wrapper = mount(App, { attachTo: document.body })

      await wrapper.get('[data-test="clear-all"]').trigger('click')
      await flush()
      const confirmButton = document.querySelector('[data-test="dialog-confirm"]') as HTMLButtonElement
      const phraseInput = document.querySelector('[data-test="dialog-phrase"]') as HTMLInputElement
      phraseInput.value = 'delete'
      phraseInput.dispatchEvent(new Event('input'))
      await flush()
      confirmButton.click()
      await flush()

      expect(secretsMod.useSecrets().state.jevApiKey).toBe('')
      expect(secretsMod.useSecrets().state.githubToken).toBe('')
      wrapper.unmount()
    })
  })

  describe('Keys required banner', () => {
    it('shows on Home until dismissed, and persists the dismissal', async () => {
      const wrapper = mount(App)
      expect(wrapper.text()).toContain('Your keys are kept in memory only')

      await wrapper.get('[data-test="dismiss-banner"]').trigger('click')
      expect(wrapper.text()).not.toContain('Your keys are kept in memory only')
      expect(prefsMod.usePreferences().state.keysBannerDismissed).toBe(true)
    })

    it('hides once a Jev key is set', async () => {
      const wrapper = mount(App)
      secretsMod.useSecrets().setJevKey('jev-test')
      await flush()
      expect(wrapper.text()).not.toContain('Your keys are kept in memory only')
    })

    it('also shows on the analysis view', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis())
      viewMod.useView().state.view = 'analysis'
      const wrapper = mount(App, { attachTo: document.body })
      await flush()
      expect(wrapper.text()).toContain('Your keys are kept in memory only')
      wrapper.unmount()
    })
  })

  describe('refresh feedback (Task FU): no duplicate dialogs', () => {
    it('only the active view mounts the load feedback: a rate-limited notice appears exactly once', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
      viewMod.useView().state.view = 'analysis'
      const wrapper = mount(App, { attachTo: document.body })
      await flush()

      // App.vue's v-if/v-else-if means HomeContainer (and its RepoLoaderContainer,
      // which mounts the same RepoLoadFeedback) is fully unmounted whenever the
      // analysis view is showing, so a shared load-state notice can only ever
      // render from the one active view.
      repoMod.useRepo().state.phase = 'rate-limited'
      repoMod.useRepo().state.rateLimitResetAt = Date.parse('2026-06-01T01:00:00Z')
      await flush()

      expect(document.querySelectorAll('[data-test="rate-limited-notice"]')).toHaveLength(1)
      expect(wrapper.find('[data-test="home-container"]').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('Shortcuts help', () => {
    it('"?" opens the shortcuts help dialog in the analysis view, ignored while typing', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis())
      viewMod.useView().state.view = 'analysis'
      const wrapper = mount(App, { attachTo: document.body })
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
})
