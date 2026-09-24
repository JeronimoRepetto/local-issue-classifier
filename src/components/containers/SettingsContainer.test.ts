// Task 4 — Settings screen. Each test reloads the module
// graph over a fresh fake Storage (the useAnalysis.test.ts pattern), because
// useSecrets, usePreferences, useAnalyses and useAnalysis are module singletons
// wired together by SettingsContainer.vue.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { fakeBrowserRuntime } from '../../../tests/fakes/fakeBrowserRuntime'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'
import { createAnalysis } from '../../domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'

let storage: MemoryStorage

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  const { setAppStorage } = await import('../../adapters/storage/appStorage')
  setAppStorage(storage)
})

describe('SettingsContainer', () => {
  it('has one Settings heading and an About block naming the product and its fonts', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    const headings = wrapper.findAll('h1')
    expect(headings.map((h) => h.text())).toEqual(['Settings'])
    const about = wrapper.get('[data-test="about"]').text()
    expect(about).toContain('local-issue-classifier')
    expect(about).toContain('Geist')
    expect(about).not.toMatch(/Inter|Silkscreen/)
  })

  it('shows the keys-required banner until a Jev key is set', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    expect(wrapper.text()).toContain('Your saved analyses are still here')

    const { useSecrets } = await import('../../composables/useSecrets')
    useSecrets().setJevKey('sk-test')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Your saved analyses are still here')
  })

  it('dismissing the banner hides it and persists the preference', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)

    await wrapper.get('[data-test="dismiss-banner"]').trigger('click')
    expect(wrapper.text()).not.toContain('Your saved analyses are still here')

    const { usePreferences } = await import('../../composables/usePreferences')
    expect(usePreferences().state.keysBannerDismissed).toBe(true)
  })

  it('typing the Jev key updates useSecrets and the status indicator', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)

    await wrapper.get('[data-test="jev-key-field"] input[type="password"]').setValue('sk-test-123')

    const { useSecrets } = await import('../../composables/useSecrets')
    expect(useSecrets().state.jevApiKey).toBe('sk-test-123')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Jev key: in memory')
  })

  it('renders the "Where do I get this?" disclosures for both key fields', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    const summaries = wrapper.findAll('summary')
    expect(summaries.length).toBeGreaterThanOrEqual(2)
    expect(summaries[0]?.text()).toBe('Where do I get this?')
  })

  it('the Jev and GitHub disclosures show 3-5 concrete steps inline, ending with a README anchor link', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)

    const jevSteps = wrapper.get('[data-test="jev-key-field"] ol').findAll('li')
    expect(jevSteps.length).toBeGreaterThanOrEqual(3)
    expect(jevSteps.length).toBeLessThanOrEqual(5)
    expect(wrapper.get('[data-test="jev-key-field"] ol').text()).toContain('console.typesafe.ai/keys')
    expect(wrapper.get('[data-test="jev-key-field"] a').attributes('href')).toBe(
      'README.md#getting-a-jev-api-key',
    )

    const githubSteps = wrapper.get('[data-test="github-token-field"] ol').findAll('li')
    expect(githubSteps.length).toBeGreaterThanOrEqual(3)
    expect(githubSteps.length).toBeLessThanOrEqual(5)
    const githubStepsText = wrapper.get('[data-test="github-token-field"] ol').text()
    expect(githubStepsText).toMatch(/Fine-grained/)
    expect(githubStepsText).toMatch(/Issues/)
    expect(githubStepsText).toMatch(/Contents/)
    expect(wrapper.get('[data-test="github-token-field"] a').attributes('href')).toBe(
      'README.md#getting-a-github-token',
    )
  })

  it('SecretsPersistenceToggle mounts in the Keys section and Forget keys clears secrets', async () => {
    const { useSecrets } = await import('../../composables/useSecrets')
    useSecrets().setJevKey('sk-test')
    useSecrets().setGitHubToken('ghp_test')

    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)

    // Verify the toggle renders in the Keys section
    expect(wrapper.find('[data-test="secrets-note"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="forget-keys"]').exists()).toBe(true)

    // Verify Forget keys clears the secrets
    await wrapper.get('[data-test="forget-keys"]').trigger('click')
    expect(useSecrets().state.jevApiKey).toBe('')
    expect(useSecrets().state.githubToken).toBe('')
  })

  it('changing a preference persists it through usePreferences', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    await wrapper.get('[data-test="theme"] [data-test="segment-dark"]').trigger('click')

    const { usePreferences } = await import('../../composables/usePreferences')
    expect(usePreferences().state.theme).toBe('dark')
  })

  it('Clear all local data requires typed confirmation, then clears storage and secrets', async () => {
    const { useSecrets } = await import('../../composables/useSecrets')
    useSecrets().setJevKey('sk-test')
    const { getAnalysisDb } = await import('../../adapters/storage/analysisDb')
    await getAnalysisDb().saveAnalysis(
      createAnalysis({
        id: 'a1',
        repo: fakeRepo(),
        stateFilter: 'open',
        now: '2026-06-01T00:00:00Z',
        prefs: defaultPreferences(),
        projectContext: defaultProjectContext('acme/widgets'),
        issues: [fakeIssue(1)],
        commentsFetched: false,
      }),
    )

    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer, { attachTo: document.body })

    await wrapper.get('[data-test="clear-all"]').trigger('click')
    await wrapper.vm.$nextTick()

    const confirmButton = document.querySelector('[data-test="dialog-confirm"]') as HTMLButtonElement
    expect(confirmButton.disabled).toBe(true)

    const phraseInput = document.querySelector('[data-test="dialog-phrase"]') as HTMLInputElement
    phraseInput.value = 'delete'
    phraseInput.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()

    confirmButton.click()
    await wrapper.vm.$nextTick()

    expect(useSecrets().state.jevApiKey).toBe('')
    // Clear all also empties the IndexedDB database of saved analyses.
    const { useAnalyses } = await import('../../composables/useAnalyses')
    await useAnalyses().settled()
    expect(await getAnalysisDb().loadIndex()).toEqual([])
    wrapper.unmount()
  })

  it.each([
    [{ persisted: async () => true }, 'Persistent storage: on.'],
    [{ persisted: async () => false }, 'Persistent storage: not granted.'],
    [{}, 'Persistent storage: not supported by this browser.'],
  ])('Local data shows whether the browser keeps saved analyses under storage pressure (%#)', async (manager, text) => {
    const { setStorageManager } = await import('../../adapters/storage/analysisDb')
    const persist = vi.fn(async () => true)
    setStorageManager({ ...manager, persist })
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    const { useAnalyses } = await import('../../composables/useAnalyses')
    await useAnalyses().settled()
    await flushPromises()
    expect(wrapper.get('[data-test="storage-persistence"]').text()).toContain(text)
    // Settings only reads the state; the request itself happens once, on the first save.
    expect(persist).not.toHaveBeenCalled()
  })

  it('shows an About / credits block that points to the third-party notices', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    expect(wrapper.text()).toContain('THIRD_PARTY_NOTICES.md')
  })

  it('credits midudev\'s canirun.ai as inspiration in the About block', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    const about = wrapper.get('[data-test="about"]').text()
    expect(about).toContain('canirun.ai')
    expect(about).toContain('midudev')
  })

  describe('Classifier (T16, WIRE-2)', () => {
    it('mounts ProviderSelector, showing the current provider label', async () => {
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      expect(wrapper.find('[data-test="kind-typesafe"]').exists()).toBe(true)
      expect(wrapper.get('[data-test="provider-label"]').text()).toBe('TypeSafe cloud (Jev)')
      expect(wrapper.find('[data-test="provider-status-chip"]').exists()).toBe(false)
    })

    it('switching to Local updates usePreferences().state.provider', async () => {
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      await wrapper.get('[data-test="kind-local"]').setValue(true)

      const { usePreferences } = await import('../../composables/usePreferences')
      expect(usePreferences().state.provider).toEqual({
        kind: 'local',
        baseUrl: 'http://localhost:8009',
        model: 'kev-latest',
      })
      expect(wrapper.get('[data-test="provider-label"]').text()).toContain('Kev')
    })

    it('typing the local server key updates useSecrets().state.localApiKey, not usePreferences', async () => {
      const { usePreferences } = await import('../../composables/usePreferences')
      usePreferences().update({ provider: { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' } })

      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      await wrapper.get('[data-test="local-key"] input').setValue('kev-key')

      const { useSecrets } = await import('../../composables/useSecrets')
      expect(useSecrets().state.localApiKey).toBe('kev-key')
    })

    it('exposes classifyMode and trimmingFloor, persisted through usePreferences', async () => {
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)

      await wrapper.get('[data-test="classify-mode"] select').setValue('per-issue')
      await wrapper.get('[data-test="trimming-floor"] select').setValue('compact')

      const { usePreferences } = await import('../../composables/usePreferences')
      expect(usePreferences().state.classifyMode).toBe('per-issue')
      expect(usePreferences().state.trimmingFloor).toBe('compact')
    })

    it('shows the probe status chip for a local provider, reflecting useProvider().status after Test connection', async () => {
      const { usePreferences } = await import('../../composables/usePreferences')
      usePreferences().update({ provider: { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' } })
      const { configureProvider } = await import('../../composables/useProvider')
      configureProvider({ fetch: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) })

      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      expect(wrapper.get('[data-test="provider-status-chip"]').text()).toBe('Looking for a local server…')

      await wrapper.get('[data-test="test-connection"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-test="provider-status-chip"]').text()).toBe('Connected')
    })

    it('selecting the local server probes it at once and shows the live status, no click needed', async () => {
      const { configureProvider } = await import('../../composables/useProvider')
      const urls: string[] = []
      configureProvider({
        fetch: async (input) => {
          urls.push(String(input))
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
        },
      })
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      await wrapper.get('[data-test="kind-local"]').setValue(true)
      await flushPromises()
      expect(urls).toContain('http://localhost:8009/v1/models')
      expect(wrapper.get('[data-test="probe-status"]').text()).toBe('Connected')
    })

    it('shows the GPU readout from the server in the Settings selector', async () => {
      const { usePreferences } = await import('../../composables/usePreferences')
      usePreferences().update({ provider: { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' } })
      const { configureProvider, useProvider } = await import('../../composables/useProvider')
      configureProvider({
        fetch: async () =>
          new Response(JSON.stringify({ models: [{ name: 'kev-0.8b', device: 'cuda', dtype: 'bfloat16' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      })
      await useProvider().autoProbe({ presets: false })
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      expect(wrapper.get('[data-test="device-callout-running-gpu"]').text()).toContain('Running on GPU (cuda · bf16)')
    })

    it('shows "Not reachable on :8009" when nothing answers', async () => {
      const { usePreferences } = await import('../../composables/usePreferences')
      usePreferences().update({ provider: { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' } })
      const { useProvider } = await import('../../composables/useProvider')
      await useProvider().autoProbe({ presets: false })
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      expect(wrapper.get('[data-test="probe-status"]').text()).toBe('Not reachable on :8009')
    })
  })

  describe('Hardware fit (WIRE-2)', () => {
    it('mounts HardwareFitPanel, wired to the persisted hardwareOverride', async () => {
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      expect(wrapper.text()).toContain('Can this machine run a local model?')

      await wrapper.get('[data-test="override-gpu"] select').setValue('nvidia-rtx-4060')
      const { usePreferences } = await import('../../composables/usePreferences')
      expect(usePreferences().state.hardwareOverride).toEqual({ gpuId: 'nvidia-rtx-4060', vramGb: null })
    })

    it('"Use Kev locally" applies the Kev preset to the provider config, and links to the local-providers docs', async () => {
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)

      await wrapper.get('[data-test="use-kev-locally"]').trigger('click')
      const { usePreferences } = await import('../../composables/usePreferences')
      expect(usePreferences().state.provider).toEqual({
        kind: 'local',
        baseUrl: 'http://localhost:8009',
        model: 'kev-latest',
      })

      expect(wrapper.get('[data-test="local-providers-link"]').attributes('href')).toBe('docs/local-providers.md')
    })
  })

  // In-browser inference (docs/browser-inference.md).
  describe('Browser provider', () => {
    it('selecting "In this browser" and downloading loads the model through useProvider', async () => {
      const runtime = fakeBrowserRuntime()
      const { configureProvider } = await import('../../composables/useProvider')
      configureProvider({ browser: runtime })
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      await wrapper.get('[data-test="kind-browser"]').setValue(true)

      const { usePreferences } = await import('../../composables/usePreferences')
      expect(usePreferences().state.provider).toEqual({ kind: 'browser', modelId: 'onnx-community/Qwen3-0.6B-ONNX' })
      expect(wrapper.get('[data-test="provider-label"]').text()).toMatch(/In this browser/)

      await wrapper.get('[data-test="download-model"]').trigger('click')
      await flushPromises()
      expect(runtime.loadModel).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[data-test="browser-model-status"]').text()).toMatch(/ready/i)
    })

    it('Local data shows the downloaded model size and removes it', async () => {
      const runtime = fakeBrowserRuntime({ cachedBytes: 578_917_626 })
      const { configureProvider } = await import('../../composables/useProvider')
      configureProvider({ browser: runtime })
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      await flushPromises()

      expect(wrapper.get('[data-test="downloaded-model"]').text()).toMatch(/Downloaded model: 579 MB/)
      await wrapper.get('[data-test="remove-downloaded-model"]').trigger('click')
      await flushPromises()
      expect(runtime.removeCached).toHaveBeenCalledWith('onnx-community/Qwen3-0.6B-ONNX')
      expect(wrapper.find('[data-test="downloaded-model"]').exists()).toBe(false)
    })

    it('Local data has no model line when nothing was downloaded', async () => {
      const { configureProvider } = await import('../../composables/useProvider')
      configureProvider({ browser: fakeBrowserRuntime() })
      const { default: SettingsContainer } = await import('./SettingsContainer.vue')
      const wrapper = mount(SettingsContainer)
      await flushPromises()
      expect(wrapper.find('[data-test="downloaded-model"]').exists()).toBe(false)
    })
  })
})
