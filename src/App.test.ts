// App shell: a tiny view state (home | analysis | settings), the
// top bar, and the integration wiring (Task INT): usePreferences before any
// restore, configureRepo(secrets), the keys-required banner and restoring the
// last-opened analysis on boot. Each test reloads the module graph over a
// fresh fake Storage, the same pattern the container tests use, since App.vue
// now touches every module singleton.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createApp, nextTick } from 'vue'
import { createAnalysis } from './domain/analysis'
import { defaultPreferences, defaultProjectContext } from './domain/types'
import { fakeIssue, fakeRepo } from '../tests/fakes/domainFixtures'
import { MemoryStorage } from '../tests/fakes/memoryStorage'
import { saveAnalysis } from './adapters/storage/analysisStore'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

/** Mounts the shell and waits for its async boot (migration + restore) to finish. */
async function mountApp(options: Parameters<typeof mount>[1] = {}) {
  const wrapper = mount(App, options)
  await vi.waitFor(() => expect(wrapper.find('[data-test="app-loading"]').exists()).toBe(false))
  await flush()
  return wrapper
}

beforeEach(async () => {
  await freshEnv()
})

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('App', () => {
  it('mounts and shows the wordmark, with Home as the default view', async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain('local-issue-classifier')
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(true)
  })

  it('names the product local-issue-classifier in the wordmark; the document title is the marketing title (tests/linkPreview.test.ts)', async () => {
    const wrapper = await mountApp()
    expect(wrapper.get('[data-test="brand"]').text()).toBe('local-issue-classifier')
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
    expect(html).toContain('<title>Issue Classifier — AI triage for GitHub issues</title>')
  })

  it('the top-bar theme toggle cycles system, light and dark and says which is active', async () => {
    const wrapper = await mountApp()
    const toggle = () => wrapper.get('[data-test="theme-toggle"]')
    expect(toggle().attributes('aria-label')).toBe('Theme: system. Switch to light')
    await toggle().trigger('click')
    expect(prefsMod.usePreferences().state.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(toggle().attributes('aria-label')).toBe('Theme: light. Switch to dark')
    await toggle().trigger('click')
    expect(prefsMod.usePreferences().state.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('the top-bar nav marks the current view and switches between Analyses and Settings', async () => {
    const wrapper = await mountApp()
    expect(wrapper.get('[data-test="nav-analyses"]').attributes('aria-current')).toBe('page')
    await wrapper.get('[data-test="open-settings"]').trigger('click')
    expect(wrapper.get('[data-test="open-settings"]').attributes('aria-current')).toBe('page')
    await wrapper.get('[data-test="nav-analyses"]').trigger('click')
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(true)
  })

  it('the Settings gear switches to Settings (SettingsContainer), and the brand returns home', async () => {
    const wrapper = await mountApp({ attachTo: document.body })
    await wrapper.get('[data-test="open-settings"]').trigger('click')
    expect(wrapper.find('[data-test="forget-keys"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(false)

    await wrapper.get('[data-test="brand"]').trigger('click')
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the analysis view (AnalysisViewContainer) once an analysis is opened', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    viewMod.useView().state.view = 'analysis'
    const wrapper = await mountApp({ attachTo: document.body })
    await flush()
    expect(wrapper.find('[data-test="issue-count"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="classify-start"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // GitHub issue #8 (docs/architecture.md "SEO"): index.html's `<div id="app">` ships static,
  // crawlable markup (a heading + a couple of paragraphs). Unlike the tests above, this one
  // mounts with the real `createApp(...).mount('#app')` (src/main.ts's own call), over that
  // exact static markup extracted straight from index.html, instead of @vue/test-utils' `mount`
  // (which renders into its own throwaway container and never exercises this replacement at
  // all). Vue's docs are explicit that a plain (non-SSR) mount is "not a hydration call" and
  // that "the container's content will be replaced" — this is the regression test for that
  // contract, and for keeping exactly one <h1> (HomeContainer's) once the real app has painted.
  it('mount replaces the static SEO fallback markup inside #app, leaving exactly one h1', async () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
    const appHtml = /<div id="app">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''
    expect(appHtml).toMatch(/<h1/) // sanity: the fixture actually has static content to replace

    document.body.innerHTML = `<div id="app">${appHtml}</div>`
    createApp(App).mount('#app')
    await vi.waitFor(() => expect(document.querySelector('[data-test="app-loading"]')).toBeNull())
    await flush()

    const container = document.getElementById('app')!
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('[data-test="home-container"]')).not.toBeNull()
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
      const wrapper = await mountApp()
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

      const wrapper = await mountApp({ attachTo: document.body })
      await flush()
      expect(viewMod.useView().state.view).toBe('analysis')
      expect(analysisMod.useAnalysis().current.value?.id).toBe('a1')
      expect(wrapper.find('[data-test="issue-count"]').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  describe('boot: IndexedDB migration and loading state (FB IndexedDB lane)', () => {
    it('shows a loading state until the saved analyses are ready, then Home', async () => {
      const wrapper = mount(App)
      expect(wrapper.find('[data-test="app-loading"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="home-container"]').exists()).toBe(false)
      await vi.waitFor(() => expect(wrapper.find('[data-test="home-container"]').exists()).toBe(true))
      expect(wrapper.find('[data-test="app-loading"]').exists()).toBe(false)
    })

    it('moves legacy localStorage analyses into the database once, with a one-line notice', async () => {
      saveAnalysis(storage, seedAnalysis('a1'))
      saveAnalysis(storage, seedAnalysis('a2'))
      const wrapper = await mountApp({ attachTo: document.body })
      expect(document.body.textContent).toContain('Moved 2 analyses to the larger local database.')
      expect(storage.keys().filter((k) => k.includes(':analysis'))).toEqual([])
      expect(wrapper.findAll('[data-test="analysis-card"]')).toHaveLength(2)
      wrapper.unmount()

      // A reload finds nothing left to move: no second notice.
      document.body.innerHTML = ''
      vi.resetModules()
      const { setAppStorage } = await import('./adapters/storage/appStorage')
      setAppStorage(storage)
      App = (await import('./App.vue')).default
      const again = await mountApp({ attachTo: document.body })
      expect(document.body.textContent).not.toContain('Moved')
      again.unmount()
    })
  })

  describe('secrets wiring (configureRepo)', () => {
    it('wires configureRepo to the secrets GitHub-token getter: fetch sees Authorization only once a token is set', async () => {
      await mountApp()
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
      const wrapper = await mountApp({ attachTo: document.body })

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
      const wrapper = await mountApp({ attachTo: document.body })

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
      const wrapper = await mountApp()
      expect(wrapper.text()).toContain('Your keys are kept in memory only')

      await wrapper.get('[data-test="dismiss-banner"]').trigger('click')
      expect(wrapper.text()).not.toContain('Your keys are kept in memory only')
      expect(prefsMod.usePreferences().state.keysBannerDismissed).toBe(true)
    })

    it('hides once a Jev key is set', async () => {
      const wrapper = await mountApp()
      secretsMod.useSecrets().setJevKey('jev-test')
      await flush()
      expect(wrapper.text()).not.toContain('Your keys are kept in memory only')
    })

    it('hides once a local provider with a valid base URL is configured, even without a Jev key (useProvider().ready)', async () => {
      const wrapper = await mountApp()
      expect(wrapper.find('[data-test="dismiss-banner"]').exists()).toBe(true)
      prefsMod.usePreferences().update({ provider: { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' } })
      await flush()
      expect(wrapper.find('[data-test="dismiss-banner"]').exists()).toBe(false)
    })

    it('also shows on the analysis view', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis())
      viewMod.useView().state.view = 'analysis'
      const wrapper = await mountApp({ attachTo: document.body })
      await flush()
      expect(wrapper.text()).toContain('Your keys are kept in memory only')
      wrapper.unmount()
    })
  })

  describe('refresh feedback (Task FU): no duplicate dialogs', () => {
    it('only the active view mounts the load feedback: a rate-limited notice appears exactly once', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis('a1'))
      viewMod.useView().state.view = 'analysis'
      const wrapper = await mountApp({ attachTo: document.body })
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

  describe('Social links (app bar)', () => {
    it('links to the GitHub repo and the LinkedIn profile, safely, before the theme toggle', async () => {
      const wrapper = await mountApp()
      const github = wrapper.get('[data-test="social-github"]')
      const linkedin = wrapper.get('[data-test="social-linkedin"]')

      expect(github.attributes('href')).toBe('https://github.com/JeronimoRepetto/local-issue-classifier')
      expect(github.attributes('target')).toBe('_blank')
      expect(github.attributes('rel')).toBe('noopener noreferrer')
      expect(github.attributes('aria-label')).toBe('Source code on GitHub')

      expect(linkedin.attributes('href')).toBe('https://www.linkedin.com/in/jrepetto92/')
      expect(linkedin.attributes('target')).toBe('_blank')
      expect(linkedin.attributes('rel')).toBe('noopener noreferrer')
      expect(linkedin.attributes('aria-label')).toBe('Author on LinkedIn')

      const nav = wrapper.get('[data-test="open-settings"]').element.parentElement!
      const links = Array.from(nav.children)
      expect(links.indexOf(github.element)).toBeLessThan(links.indexOf(wrapper.get('[data-test="theme-toggle"]').element))
      expect(links.indexOf(linkedin.element)).toBeLessThan(links.indexOf(wrapper.get('[data-test="theme-toggle"]').element))
    })

    it('links to the Ko-fi profile, safely, right after LinkedIn and before the theme toggle', async () => {
      const wrapper = await mountApp()
      const linkedin = wrapper.get('[data-test="social-linkedin"]')
      const kofi = wrapper.get('[data-test="social-kofi"]')
      const themeToggle = wrapper.get('[data-test="theme-toggle"]')

      expect(kofi.attributes('href')).toBe('https://ko-fi.com/jeronimorepetto')
      expect(kofi.attributes('target')).toBe('_blank')
      expect(kofi.attributes('rel')).toBe('noopener noreferrer')
      expect(kofi.attributes('aria-label')).toBe('Support the author on Ko-fi')
      expect(kofi.classes()).toContain('app-shell__social-link')

      const nav = wrapper.get('[data-test="open-settings"]').element.parentElement!
      const links = Array.from(nav.children)
      // Each link's <a> sits inside a UiTooltip wrapper span, which is the
      // actual direct child of <nav>; compare those wrapper positions.
      const linkedinSlot = linkedin.element.closest('.ui-tooltip')!
      const kofiSlot = kofi.element.closest('.ui-tooltip')!
      expect(links.indexOf(linkedinSlot)).toBeGreaterThanOrEqual(0)
      expect(links.indexOf(kofiSlot)).toBeGreaterThanOrEqual(0)
      expect(links.indexOf(linkedinSlot)).toBeLessThan(links.indexOf(kofiSlot))
      expect(links.indexOf(kofiSlot)).toBeLessThan(links.indexOf(themeToggle.element))
    })

    it("renders Ko-fi's icon as an original coffee-mug stroke icon, not a hand-inlined third-party mark", async () => {
      const wrapper = await mountApp()
      const kofi = wrapper.get('[data-test="social-kofi"]')
      const svg = kofi.get('svg')
      expect(svg.attributes('viewBox')).toBe('0 0 24 24')
      expect(svg.attributes('fill')).toBe('none')
      expect(svg.attributes('stroke')).toBe('currentColor')
    })

    it('keeps GitHub on the shared --color-icon-social token color (24-grid currentColor mark)', async () => {
      const wrapper = await mountApp()
      const github = wrapper.get('[data-test="social-github"]')
      expect(github.classes()).toContain('app-shell__social-link')
      expect(github.get('svg').attributes('viewBox')).toBe('0 0 24 24')
    })

    it("renders LinkedIn's official [in] Logo mark, unaltered, in place of the generic external-link icon", async () => {
      const wrapper = await mountApp()
      const linkedin = wrapper.get('[data-test="social-linkedin"]')
      expect(linkedin.classes()).toContain('app-shell__social-link')

      const svg = linkedin.get('svg')
      // 0 0 28 28 is the official [in] Logo's own viewBox (brand.linkedin.com/in-logo),
      // distinct from the 24-grid stroke icons the kit generates (fill="none").
      expect(svg.attributes('viewBox')).toBe('0 0 28 28')
      expect(svg.attributes('fill')).not.toBe('none')

      const path = linkedin.get('path')
      expect(path.attributes('d')).toContain('m25.9 0h-23.8')
    })
  })

  describe('Shortcuts help', () => {
    it('"?" opens the shortcuts help dialog in the analysis view, ignored while typing', async () => {
      analysisMod.useAnalysis().setCurrent(seedAnalysis())
      viewMod.useView().state.view = 'analysis'
      const wrapper = await mountApp({ attachTo: document.body })
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

// Auto-probe (docs/local-providers.md "Connection status"): the local presets
// are probed on load, cached for the session; coming back to Home re-probes
// them only when the last check is at least 30 s old. No polling loop.
describe('App: local server auto-probe', () => {
  const T0 = new Date('2026-09-24T10:00:00Z')
  let urls: string[]

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    urls = []
    const { configureProvider } = await import('./composables/useProvider')
    configureProvider({
      fetch: async (input) => {
        urls.push(String(input))
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('probes the Kev, JevK5 and Laya presets once on load', async () => {
    await mountApp()
    await flushPromises()
    expect(urls.sort()).toEqual([
      'http://localhost:8000/v1/models',
      'http://localhost:8009/v1/models',
      'http://localhost:8090/v1/models',
    ])
  })

  it('re-probes on returning to Home only after 30 s', async () => {
    await mountApp()
    await flushPromises()
    urls = []
    const view = viewMod.useView()

    view.openSettings()
    await flush()
    vi.setSystemTime(new Date(T0.getTime() + 10_000))
    view.goHome()
    await flushPromises()
    expect(urls).toEqual([])

    view.openSettings()
    await flush()
    // mountApp's waitFor may move the fake clock a few ms past T0; the exact
    // 30 000 ms boundary is covered in useProvider.test.ts.
    vi.setSystemTime(new Date(T0.getTime() + 31_000))
    view.goHome()
    await flushPromises()
    expect(urls.sort()).toEqual([
      'http://localhost:8000/v1/models',
      'http://localhost:8009/v1/models',
      'http://localhost:8090/v1/models',
    ])
  })
})
