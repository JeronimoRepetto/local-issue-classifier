// Task 4 — SPEC.md §2.1 / §6.1 Settings screen. Each test reloads the module
// graph over a fresh fake Storage (the useAnalysis.test.ts pattern), because
// useSecrets, usePreferences, useAnalyses and useAnalysis are module singletons
// wired together by SettingsContainer.vue.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

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

  it('Clear keys empties both in-memory secrets', async () => {
    const { useSecrets } = await import('../../composables/useSecrets')
    useSecrets().setJevKey('sk-test')
    useSecrets().setGitHubToken('ghp_test')

    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    await wrapper.get('[data-test="clear-keys"]').trigger('click')

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
    wrapper.unmount()
  })

  it('shows an About / credits block that points to the third-party notices', async () => {
    const { default: SettingsContainer } = await import('./SettingsContainer.vue')
    const wrapper = mount(SettingsContainer)
    expect(wrapper.text()).toContain('THIRD_PARTY_NOTICES.md')
  })
})
