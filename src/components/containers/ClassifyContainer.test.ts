// Task 11 — ClassifyContainer, mounted standalone over the
// real singletons (fresh module graph per test) and a fake Jev client.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createAnalysis } from '../../domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'
import { http, ok, scriptedClient } from '../../../tests/fakes/fakeJev'
import type { Handler } from '../../../tests/fakes/fakeJev'
import type { ProviderConfig } from '../../domain/provider'

interface SetupOptions {
  /** Test override for useRuntime's `dev` check, passed as ClassifyContainer's `isDev` prop. */
  isDev?: boolean
  /** Test override for useRuntime's `hostname` check, passed as ClassifyContainer's `hostname` prop. */
  hostname?: string
  /** Records every fetch call instead of the default fixed 404 responder. */
  fetch?: typeof fetch
}

async function setup(handler: Handler, withKey = true, provider?: ProviderConfig, options: SetupOptions = {}) {
  vi.resetModules()
  const { setAppStorage } = await import('../../adapters/storage/appStorage')
  setAppStorage(new MemoryStorage())
  const { useAnalysis } = await import('../../composables/useAnalysis')
  const { useSecrets } = await import('../../composables/useSecrets')
  const { usePreferences } = await import('../../composables/usePreferences')
  const { configureClassifier } = await import('../../composables/useClassifier')
  const { configureProvider, useProvider } = await import('../../composables/useProvider')
  configureClassifier({ createClient: () => scriptedClient(handler), sleep: async () => undefined })
  // Every candidate probe goes through this fake fetch too; nothing real is contacted.
  configureProvider({ fetch: options.fetch ?? (async () => new Response(JSON.stringify({ models: [] }), { status: 404 })) })
  if (provider) usePreferences().update({ provider })
  useAnalysis().setCurrent(
    createAnalysis({
      id: 'a1',
      repo: fakeRepo(),
      stateFilter: 'open',
      now: '2026-09-23T00:00:00Z',
      prefs: defaultPreferences(),
      projectContext: defaultProjectContext('acme/widgets'),
      issues: [fakeIssue(1), fakeIssue(2)],
      commentsFetched: false,
    }),
  )
  if (withKey) useSecrets().setJevKey('jev-test')
  const { default: ClassifyContainer } = await import('./ClassifyContainer.vue')
  const props: Record<string, unknown> = {}
  if (options.isDev !== undefined) props.isDev = options.isDev
  if (options.hostname !== undefined) props.hostname = options.hostname
  return { wrapper: mount(ClassifyContainer, { attachTo: document.body, props }), useSecrets, useProvider }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('ClassifyContainer', () => {
  it('without a Jev key, the button is disabled and Settings can be requested', async () => {
    const { wrapper } = await setup(() => ok(), false)
    expect(wrapper.get('[data-test="classify-start"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="classify-open-settings"]').trigger('click')
    expect(wrapper.emitted('open-settings')).toEqual([['jev-key-missing']])
  })

  it('with a local provider and a valid base URL, the button is enabled without any key (useProvider().ready gate)', async () => {
    const { wrapper } = await setup(() => ok(), false, {
      kind: 'local',
      baseUrl: 'http://localhost:8009',
      model: 'kev-latest',
    })
    expect(wrapper.get('[data-test="classify-start"]').attributes('disabled')).toBeUndefined()
  })

  it('runs, shows progress, then the summary and a success toast', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { wrapper } = await setup(async () => {
      await gate
      return ok()
    })
    expect(wrapper.get('[data-test="classify-start"]').text()).toBe('Classify unclassified (2)')

    await wrapper.get('[data-test="classify-start"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true)

    release()
    await flushPromises()
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="summary-counts"]').text()).toBe('2 classified · 0 failed · 0 low-confidence')
    expect(wrapper.get('[role="status"]').text()).toContain('2 classified')
    wrapper.unmount()
  })

  it('an authentication failure clears the key, raises an error toast and asks for Settings', async () => {
    const { wrapper, useSecrets } = await setup(() => http(403, { error_type: 'authentication_error' }))
    await wrapper.get('[data-test="classify-start"]').trigger('click')
    await flushPromises()
    expect(useSecrets().hasJevKey.value).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('The Jev key was rejected')
    expect(wrapper.emitted('open-settings')).toEqual([['jev-key-rejected']])
    wrapper.unmount()
  })

  it('the filtered scope sends only the unclassified issues of the given view', async () => {
    const calls: number[] = []
    vi.resetModules()
    const { wrapper } = await setup((issue) => {
      calls.push(issue)
      return ok()
    })
    await wrapper.setProps({ filteredNumbers: [2] })
    await wrapper.get('select').setValue('filtered')
    expect(wrapper.get('[data-test="classify-start"]').text()).toBe('Classify filtered view (1)')
    await wrapper.get('[data-test="classify-start"]').trigger('click')
    await flushPromises()
    expect(calls).toEqual([2])
    wrapper.unmount()
  })
})

describe('ClassifyContainer: provider switcher', () => {
  it('mounts the provider switch and probes candidates on mount', async () => {
    const { wrapper } = await setup(() => ok())
    await flushPromises()
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="provider-option-typesafe"]').attributes('aria-checked')).toBe('true')
  })

  it('selecting another candidate replaces the active provider', async () => {
    const { wrapper, useProvider } = await setup(() => ok())
    await flushPromises()
    await wrapper.get('[data-test="provider-option-local:kev"]').trigger('click')
    expect(useProvider().config.value).toEqual({ kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' })
    wrapper.unmount()
  })

  it('disables the switch while a run is active', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { wrapper } = await setup(async () => {
      await gate
      return ok()
    })
    await flushPromises()
    await wrapper.get('[data-test="classify-start"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="provider-option-local:kev"]').attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    wrapper.unmount()
  })
})

// Bugfix (2026-09-24, T-FIX-HOSTED-PROBE): on the hosted site
// (local-issue-classifier.pages.dev), opening the analysis view was probing
// every LOCAL_PRESETS URL unconditionally, which is exactly what triggers
// Chrome's Local Network Access prompt ("wants to access other apps and
// services on this device"). Mirrors ProviderOnboardingCard's isDev/hostname
// test-override props (see useRuntime.ts) to simulate a hosted runtime.
describe('ClassifyContainer: skips localhost probes on a hosted runtime', () => {
  it('issues no request to any local preset URL when hosted (isDev=false, non-loopback hostname)', async () => {
    const calls: string[] = []
    const fetchSpy: typeof fetch = async (input) => {
      calls.push(String(input))
      return new Response(JSON.stringify({ models: [] }), { status: 404 })
    }
    const { wrapper } = await setup(() => ok(), true, undefined, {
      fetch: fetchSpy,
      isDev: false,
      hostname: 'local-issue-classifier.pages.dev',
    })
    await flushPromises()
    expect(calls.some((u) => u.includes(':8009') || u.includes(':8090'))).toBe(false)
    wrapper.unmount()
  })

  it('still probes both local presets when the runtime is local (default: dev mode under vitest)', async () => {
    const calls: string[] = []
    const fetchSpy: typeof fetch = async (input) => {
      calls.push(String(input))
      return new Response(JSON.stringify({ models: [] }), { status: 404 })
    }
    const { wrapper } = await setup(() => ok(), true, undefined, { fetch: fetchSpy })
    await flushPromises()
    expect(calls.some((u) => u.includes(':8009'))).toBe(true)
    expect(calls.some((u) => u.includes(':8090'))).toBe(true)
    wrapper.unmount()
  })
})
