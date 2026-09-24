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

async function setup(handler: Handler, withKey = true, provider?: ProviderConfig) {
  vi.resetModules()
  const { setAppStorage } = await import('../../adapters/storage/appStorage')
  setAppStorage(new MemoryStorage())
  const { useAnalysis } = await import('../../composables/useAnalysis')
  const { useSecrets } = await import('../../composables/useSecrets')
  const { usePreferences } = await import('../../composables/usePreferences')
  const { configureClassifier } = await import('../../composables/useClassifier')
  configureClassifier({ createClient: () => scriptedClient(handler), sleep: async () => undefined })
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
  return { wrapper: mount(ClassifyContainer, { attachTo: document.body }), useSecrets }
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
