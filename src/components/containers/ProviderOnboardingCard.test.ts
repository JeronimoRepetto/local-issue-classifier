// Home provider-onboarding card (PoC, odd/tasks/home-provider-onboarding.md):
// surfaces the classifier-provider choice on Home (not only in Settings),
// together with the hardware-fit result and a condensed local-setup summary.
// Same reload-the-module-graph pattern as HomeContainer.test.ts /
// SettingsContainer.test.ts: usePreferences, useSecrets, useProvider and
// useHardwareDetection are module singletons wired together by this
// container, so each test starts from a fresh module graph and fake storage.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defaultLocalProviderConfig } from '../../domain/provider'
import { unknownHardwareReport } from '../../domain/hardware'
import type { HardwareReport } from '../../domain/hardware'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

let storage: MemoryStorage

const RTX_5070: HardwareReport = {
  gpu: { vendor: 'nvidia', model: 'NVIDIA GeForce RTX 5070', vramGb: 12, source: 'webgl' },
  ramGb: 8,
  ramIsLowerBound: true,
  cpuThreads: 16,
  platform: 'Windows',
  unifiedMemory: false,
  confidence: 'high',
}

beforeEach(async () => {
  vi.resetModules()
  storage = new MemoryStorage()
  const { setAppStorage } = await import('../../adapters/storage/appStorage')
  setAppStorage(storage)
})

/** Pre-seeds the shared hardware-detection cache (passive: no real detection
 *  runs in jsdom), then mounts the card fresh over the current module graph. */
async function mountCard(hardware: HardwareReport = RTX_5070) {
  const { useHardwareDetection } = await import('../../composables/useHardwareDetection')
  await useHardwareDetection().run(async () => hardware)
  const { default: ProviderOnboardingCard } = await import('./ProviderOnboardingCard.vue')
  return mount(ProviderOnboardingCard)
}

describe('ProviderOnboardingCard', () => {
  it('renders both choice cards and a hardware-fit line naming the detected GPU', async () => {
    const wrapper = await mountCard()
    expect(wrapper.get('[data-test="choice-cloud"]').text()).toContain('Cloud (Jev by TypeSafe)')
    expect(wrapper.get('[data-test="choice-local"]').text()).toContain('On this computer')
    const fitLine = wrapper.get('[data-test="hardware-fit-line"]').text()
    expect(fitLine).toContain('RTX 5070')
    expect(fitLine.toLowerCase()).toContain('fits')
  })

  it('shows a cloud-recommended fit line when no suitable GPU is detected', async () => {
    const wrapper = await mountCard(unknownHardwareReport())
    expect(wrapper.get('[data-test="hardware-fit-line"]').text().toLowerCase()).toContain('cloud')
  })

  it('choosing Cloud reveals the Jev key field, which writes through useSecrets, plus a Settings link', async () => {
    const wrapper = await mountCard()
    await wrapper.get('[data-test="choice-cloud"]').trigger('click')
    await wrapper.get('[data-test="jev-key-field"] input').setValue('sk-test-123')

    const { useSecrets } = await import('../../composables/useSecrets')
    expect(useSecrets().state.jevApiKey).toBe('sk-test-123')
    expect(wrapper.find('[data-test="open-settings-cloud"]').exists()).toBe(true)
  })

  it('choosing Local applies the Kev preset via usePreferences and shows the condensed setup summary', async () => {
    const wrapper = await mountCard()
    await wrapper.get('[data-test="choice-local"]').trigger('click')

    const { usePreferences } = await import('../../composables/usePreferences')
    expect(usePreferences().state.provider).toEqual(defaultLocalProviderConfig())

    const summary = wrapper.get('[data-test="local-setup-summary"]').text()
    expect(summary).toContain('pnpm local:kev')
    expect(summary).toContain('uv run --extra serve')
    expect(wrapper.find('[data-test="test-connection"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="open-settings-local"]').exists()).toBe(true)
  })

  it('Test connection calls useProvider().probe() and shows the result', async () => {
    const wrapper = await mountCard()
    await wrapper.get('[data-test="choice-local"]').trigger('click')

    const { configureProvider } = await import('../../composables/useProvider')
    configureProvider({
      fetch: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    })

    await wrapper.get('[data-test="test-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="probe-status"]').text()).toMatch(/connected/i)
  })

  // Layout change (user decisions 2026-09-24): the card is not dismissible
  // any more — it is the one place to choose/see the provider, so it stays
  // on Home always, including once the provider is ready.
  it('never renders a dismiss/"Not now" button', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('[data-test="dismiss"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Not now')
  })

  it('stays visible once the provider is ready (a Jev key is set)', async () => {
    const { useSecrets } = await import('../../composables/useSecrets')
    useSecrets().setJevKey('sk-test')

    const wrapper = await mountCard()
    expect(wrapper.find('[data-test="provider-onboarding-card"]').exists()).toBe(true)
  })

  it('stays visible even when a stored homeProviderCardDismissed=true preference is tolerated from old data', async () => {
    const { useSecrets } = await import('../../composables/useSecrets')
    useSecrets().setJevKey('sk-test')
    const { usePreferences } = await import('../../composables/usePreferences')
    usePreferences().update({ homeProviderCardDismissed: true })

    const wrapper = await mountCard()
    expect(wrapper.find('[data-test="provider-onboarding-card"]').exists()).toBe(true)
  })

  it('reflects an already-configured local provider as the active choice on mount', async () => {
    const { usePreferences } = await import('../../composables/usePreferences')
    usePreferences().update({ provider: defaultLocalProviderConfig() })

    const wrapper = await mountCard()
    expect(wrapper.get('[data-test="choice-local"]').classes()).toContain('provider-onboarding__choice--active')
    expect(wrapper.get('[data-test="choice-cloud"]').classes()).not.toContain('provider-onboarding__choice--active')
  })

  it('reflects an already-configured cloud provider (Jev key set) as the active choice on mount', async () => {
    const { useSecrets } = await import('../../composables/useSecrets')
    useSecrets().setJevKey('sk-test')

    const wrapper = await mountCard()
    expect(wrapper.get('[data-test="choice-cloud"]').classes()).toContain('provider-onboarding__choice--active')
    expect(wrapper.get('[data-test="choice-local"]').classes()).not.toContain('provider-onboarding__choice--active')
  })

  it('neither choice is active on a fresh, never-configured install', async () => {
    const wrapper = await mountCard()
    expect(wrapper.get('[data-test="choice-cloud"]').classes()).not.toContain('provider-onboarding__choice--active')
    expect(wrapper.get('[data-test="choice-local"]').classes()).not.toContain('provider-onboarding__choice--active')
  })

  it('the two choice cards share the same base classes and an equal-columns grid (equal width/height)', async () => {
    const wrapper = await mountCard()
    const cloud = wrapper.get('[data-test="choice-cloud"]')
    const local = wrapper.get('[data-test="choice-local"]')
    const base = (el: { classes(): string[] }) => el.classes().filter((c) => c !== 'provider-onboarding__choice--active')
    expect(base(cloud)).toEqual(base(local))

    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(__dirname, 'ProviderOnboardingCard.vue'), 'utf8')
    expect(source).toMatch(/\.provider-onboarding__choices\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expect(source).toMatch(/\.provider-onboarding__choices\s*\{[^}]*align-items:\s*stretch/)
  })

  it('never renders a primary-variant button (RepoInput stays Home\'s one primary action)', async () => {
    const wrapper = await mountCard()
    await wrapper.get('[data-test="choice-cloud"]').trigger('click')
    await wrapper.get('[data-test="choice-local"]').trigger('click')
    expect(wrapper.find('.ui-button--primary').exists()).toBe(false)
  })

  // The "Your computer" hardware box moved out of this card into its own
  // sibling component: see HardwareSummaryPanel.vue / .test.ts (layout
  // change, user decisions 2026-09-24). This card no longer renders it.
  it('no longer renders the "Your computer" hardware box (moved to a sibling panel)', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('[data-test="hardware-box"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="hardware-summary-panel"]').exists()).toBe(false)
  })
})
