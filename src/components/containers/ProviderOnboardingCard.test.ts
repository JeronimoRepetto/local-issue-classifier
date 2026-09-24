// Home provider-onboarding card (PoC, odd/tasks/home-provider-onboarding.md):
// surfaces the classifier-provider choice ("Use Jev in the cloud" vs "Run a
// model locally") on Home, not only in Settings, together with the
// hardware-fit result and a compact local-setup summary, so a first-time
// user decides where the AI runs before loading a repo.
// Same reload-the-module-graph pattern as HomeContainer.test.ts /
// SettingsContainer.test.ts: usePreferences, useSecrets, useProvider and
// useHardwareDetection are module singletons wired together by this
// container, so each test starts from a fresh module graph and fake storage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { fakeBrowserRuntime } from '../../../tests/fakes/fakeBrowserRuntime'
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

/** 24 GB card: the largest local tier (Kev 9B, needs ~20 GB) fits comfortably. */
const RTX_4090: HardwareReport = {
  gpu: { vendor: 'nvidia', model: 'NVIDIA GeForce RTX 4090', vramGb: 24, source: 'webgl' },
  ramGb: 32,
  ramIsLowerBound: false,
  cpuThreads: 24,
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

interface MountOptions {
  hardware?: HardwareReport
  isDev?: boolean
  /** Test-only override for useRuntime's hostname check (see useRuntime.ts). */
  hostname?: string
  /** Test-only override for the OS toggle's initial value (defaults to detectOs(navigator)). */
  initialOs?: 'windows' | 'macos' | 'linux'
}

/** Pre-seeds the shared hardware-detection cache (passive: no real detection
 *  runs in jsdom), then mounts the card fresh over the current module graph. */
async function mountCard(opts: MountOptions = {}) {
  const { hardware = RTX_5070, isDev, hostname, initialOs } = opts
  const { useHardwareDetection } = await import('../../composables/useHardwareDetection')
  await useHardwareDetection().run(async () => hardware)
  const { default: ProviderOnboardingCard } = await import('./ProviderOnboardingCard.vue')
  const props: Record<string, unknown> = {}
  if (isDev !== undefined) props.isDev = isDev
  if (hostname !== undefined) props.hostname = hostname
  if (initialOs !== undefined) props.initialOs = initialOs
  return mount(ProviderOnboardingCard, { props })
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
    const wrapper = await mountCard({ hardware: unknownHardwareReport() })
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

  it('choosing Local applies the Kev preset via usePreferences and shows the setup summary', async () => {
    const wrapper = await mountCard({ isDev: true, initialOs: 'windows' })
    await wrapper.get('[data-test="choice-local"]').trigger('click')

    const { usePreferences } = await import('../../composables/usePreferences')
    expect(usePreferences().state.provider).toEqual(defaultLocalProviderConfig())

    expect(wrapper.get('[data-test="command-shortcut"]').text()).toBe('pnpm local:kev --model kev-4b')
    expect(wrapper.get('[data-test="command-clone"]').text()).toBe('git clone https://github.com/jaredpalmer/kev.git')
    expect(wrapper.get('[data-test="command-cd"]').text()).toBe('cd kev')
    expect(wrapper.get('[data-test="command-sync"]').text()).toBe('uv sync --extra serve')
    expect(wrapper.get('[data-test="command-serve"]').text()).toBe(
      'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8009',
    )
    expect(wrapper.find('[data-test="test-connection"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="open-settings-local"]').exists()).toBe(true)
  })

  describe('recommended model follows the detected hardware', () => {
    it('recommends Kev 4B for a 12 GB GPU', async () => {
      const wrapper = await mountCard({ hardware: RTX_5070 })
      await wrapper.get('[data-test="choice-local"]').trigger('click')
      expect(wrapper.get('[data-test="recommended-model-line"]').text()).toBe('Recommended for your GPU: Kev 4B')
      expect(wrapper.get('[data-test="command-serve"]').text()).toContain('jaredpalmer/kev-4b')
    })

    it('recommends Kev 9B for a 24 GB GPU', async () => {
      const wrapper = await mountCard({ hardware: RTX_4090 })
      await wrapper.get('[data-test="choice-local"]').trigger('click')
      expect(wrapper.get('[data-test="recommended-model-line"]').text()).toBe('Recommended for your GPU: Kev 9B')
      expect(wrapper.get('[data-test="command-serve"]').text()).toContain('jaredpalmer/kev-9b')
    })

    it('recommends the smallest Kev with a hint when hardware detection is unknown', async () => {
      const wrapper = await mountCard({ hardware: unknownHardwareReport() })
      await wrapper.get('[data-test="choice-local"]').trigger('click')
      expect(wrapper.get('[data-test="recommended-model-line"]').text()).toBe(
        'Recommended for your GPU: Kev 0.8B (smallest; detection unknown)',
      )
      expect(wrapper.get('[data-test="command-serve"]').text()).toContain('jaredpalmer/kev-0.8b')
    })
  })

  describe('OS toggle (same options as the Settings guide)', () => {
    it('defaults to the given initialOs (test override for detectOs(navigator))', async () => {
      const wrapper = await mountCard({ initialOs: 'macos' })
      await wrapper.get('[data-test="choice-local"]').trigger('click')
      expect(wrapper.get('[data-test="segment-macos"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('[data-test="command-clone"]').text()).toBe(
        'git clone https://github.com/jaredpalmer/kev.git && cd kev',
      )
    })

    it('switching to Windows splits clone/cd into two lines', async () => {
      const wrapper = await mountCard({ initialOs: 'linux' })
      await wrapper.get('[data-test="choice-local"]').trigger('click')
      await wrapper.get('[data-test="segment-windows"]').trigger('click')
      expect(wrapper.get('[data-test="command-clone"]').text()).toBe('git clone https://github.com/jaredpalmer/kev.git')
      expect(wrapper.get('[data-test="command-cd"]').text()).toBe('cd kev')
    })
  })

  describe('the repo shortcut only makes sense from the repo dev server', () => {
    it('shows "From the project folder", the shortcut and the --dir hint in dev mode', async () => {
      const wrapper = await mountCard({ isDev: true, initialOs: 'windows' })
      await wrapper.get('[data-test="choice-local"]').trigger('click')
      expect(wrapper.find('[data-test="command-shortcut"]').exists()).toBe(true)
      expect(wrapper.get('[data-test="command-project-folder"]').text()).toBe('cd local-issue-classifier')
      expect(wrapper.text()).toMatch(/from the project folder/i)
      expect(wrapper.text()).toMatch(/--dir `?C:\\path\\to\\kev/)
      expect(wrapper.text()).toMatch(/skips clone and sync/)
    })

    it('hides the shortcut and the project-folder step outside dev mode', async () => {
      const wrapper = await mountCard({ isDev: false, hostname: 'localhost' })
      await wrapper.get('[data-test="choice-local"]').trigger('click')
      expect(wrapper.find('[data-test="command-shortcut"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="command-project-folder"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('pnpm local:kev')
    })
  })

  describe('critical-information callouts (UiCallout)', () => {
    it('shows Prerequisites, the GPU-optional note and what will not work', async () => {
      const wrapper = await mountCard()
      await wrapper.get('[data-test="choice-local"]').trigger('click')

      const prereqs = wrapper.get('[data-test="callout-prereqs"]')
      expect(prereqs.classes()).toContain('ui-callout--warning')
      expect(prereqs.text()).toMatch(/git, python 3\.12 or 3\.13, and uv/i)

      const gpu = wrapper.get('[data-test="callout-gpu-optional"]')
      expect(gpu.classes()).toContain('ui-callout--warning')
      expect(gpu.text()).toMatch(/nvidia gpu is optional/i)

      const unsupported = wrapper.get('[data-test="callout-unsupported"]')
      expect(unsupported.classes()).toContain('ui-callout--danger')
      expect(unsupported.attributes('role')).toBe('alert')
      expect(unsupported.text()).toMatch(/won't work/i)
    })
  })

  describe('copy buttons (CopyCommandLine, icon-only)', () => {
    const originalClipboard = navigator.clipboard

    afterEach(() => {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
      vi.restoreAllMocks()
    })

    it('copies the exact command text for a line via navigator.clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

      const wrapper = await mountCard({ isDev: true })
      await wrapper.get('[data-test="choice-local"]').trigger('click')
      await wrapper.get('[data-test="copy-serve"]').trigger('click')

      expect(writeText).toHaveBeenCalledWith(
        'uv run --no-sync --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8009',
      )
      expect(wrapper.get('[data-test="copy-serve"]').attributes('aria-label')).toBe('Copy command')
      expect(wrapper.get('[data-test="copied-serve"]').text()).toMatch(/copied/i)
    })
  })

  it('choosing "On this computer" probes the server at once and shows the live status, no click needed', async () => {
    const { configureProvider } = await import('../../composables/useProvider')
    const urls: string[] = []
    configureProvider({
      fetch: async (input) => {
        urls.push(String(input))
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })
    const wrapper = await mountCard()
    await wrapper.get('[data-test="choice-local"]').trigger('click')
    expect(wrapper.get('[data-test="probe-status"]').text()).toBe('Looking for a local server…')
    await flushPromises()
    expect(urls).toContain('http://localhost:8009/v1/models')
    expect(wrapper.get('[data-test="probe-status"]').text()).toBe('Connected')
  })

  it('says "Not reachable on :8009" when nothing answers, and Test connection retries', async () => {
    const wrapper = await mountCard()
    await wrapper.get('[data-test="choice-local"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="probe-status"]').text()).toBe('Not reachable on :8009')

    const { configureProvider } = await import('../../composables/useProvider')
    configureProvider({
      fetch: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    })
    await wrapper.get('[data-test="test-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="probe-status"]').text()).toBe('Connected')
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

  it('the choice cards share the same base classes and an equal, wrapping auto-fit grid', async () => {
    const wrapper = await mountCard()
    const cloud = wrapper.get('[data-test="choice-cloud"]')
    const local = wrapper.get('[data-test="choice-local"]')
    const base = (el: { classes(): string[] }) => el.classes().filter((c) => c !== 'provider-onboarding__choice--active')
    expect(base(cloud)).toEqual(base(local))

    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(__dirname, 'ProviderOnboardingCard.vue'), 'utf8')
    expect(source).toMatch(
      /\.provider-onboarding__choices\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(14rem,\s*1fr\)\)/,
    )
    expect(source).toMatch(/\.provider-onboarding__choices\s*\{[^}]*align-items:\s*stretch/)
  })

  it('never renders a primary-variant button (RepoInput stays Home\'s one primary action)', async () => {
    const wrapper = await mountCard()
    await wrapper.get('[data-test="choice-cloud"]').trigger('click')
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

  // In-browser inference (docs/browser-inference.md): a third choice, only
  // where WebGPU is available (the WASM fallback stays a Settings-only option).
  it('offers "In this browser" only when WebGPU is available', async () => {
    const { configureProvider } = await import('../../composables/useProvider')
    configureProvider({ browser: fakeBrowserRuntime({ support: 'wasm' }) })
    const withoutGpu = await mountCard()
    await flushPromises()
    expect(withoutGpu.find('[data-test="choice-browser"]').exists()).toBe(false)
  })

  it('choosing "In this browser" selects the browser model and shows its download panel', async () => {
    const runtime = fakeBrowserRuntime({ support: 'webgpu' })
    const { configureProvider } = await import('../../composables/useProvider')
    configureProvider({ browser: runtime })
    const wrapper = await mountCard()
    await flushPromises()
    await wrapper.get('[data-test="choice-browser"]').trigger('click')

    const { usePreferences } = await import('../../composables/usePreferences')
    expect(usePreferences().state.provider).toEqual({ kind: 'browser', modelId: 'onnx-community/Qwen3-0.6B-ONNX' })
    await wrapper.get('[data-test="browser-panel"] [data-test="download-model"]').trigger('click')
    await flushPromises()
    expect(runtime.loadModel).toHaveBeenCalledTimes(1)
  })

  // Bugfix (2026-09-24): the old `isDev`-only gate showed the "hosted page"
  // hint even on a plain localhost dev server, because it never accounted
  // for the loopback hostname (see domain/runtime.ts, useRuntime.ts).
  describe('local vs. hosted runtime (domain/runtime.ts isLocalRuntime)', () => {
    it('local runtime (dev server): renders the local card and no hosted hint', async () => {
      const wrapper = await mountCard({ isDev: true, hostname: 'localhost' })
      expect(wrapper.find('[data-test="choice-local"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="local-in-settings-hint"]').exists()).toBe(false)
    })

    it('local runtime via loopback hostname alone (e.g. `vite preview`, dev=false): still shows the local card', async () => {
      const wrapper = await mountCard({ isDev: false, hostname: '127.0.0.1' })
      expect(wrapper.find('[data-test="choice-local"]').exists()).toBe(true)
    })

    it('hosted mode (not local runtime): hides the "On this computer" card entirely (v-if, no placeholder), keeps only Cloud, and shows the Settings link instead', async () => {
      const wrapper = await mountCard({ isDev: false, hostname: 'example.com' })
      expect(wrapper.find('[data-test="choice-local"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="choice-cloud"]').exists()).toBe(true)

      const hint = wrapper.get('[data-test="local-in-settings-hint"]')
      expect(hint.text()).toMatch(/have a kev\/jevk5 server on your machine\?/i)
      expect(hint.text()).toMatch(/configure it in settings/i)

      expect(wrapper.find('[data-test="hosted-hint"]').exists()).toBe(false)
    })

    it('hosted mode never renders the local panel even if a local provider was already configured', async () => {
      const { usePreferences } = await import('../../composables/usePreferences')
      usePreferences().update({ provider: defaultLocalProviderConfig() })

      const wrapper = await mountCard({ isDev: false, hostname: 'example.com' })
      expect(wrapper.find('[data-test="local-panel"]').exists()).toBe(false)
    })

    it('clicking the Settings link in hosted mode opens Settings', async () => {
      const wrapper = await mountCard({ isDev: false, hostname: 'example.com' })
      const { useView } = await import('../../composables/useView')
      await wrapper.get('[data-test="local-in-settings-hint"] button').trigger('click')
      expect(useView().state.view).toBe('settings')
    })
  })

  // Card matrix (merge of the local-runtime gate and the WebGPU gate): every
  // card is `v-if`-rendered in one auto-fit grid, so the grid holds exactly
  // the cards that apply — never an empty slot or placeholder element.
  describe('choice-card matrix (runtime x WebGPU)', () => {
    const cases = [
      { name: 'local + WebGPU', hostname: 'localhost', support: 'webgpu', cards: ['choice-cloud', 'choice-local', 'choice-browser'] },
      { name: 'local without WebGPU', hostname: 'localhost', support: 'wasm', cards: ['choice-cloud', 'choice-local'] },
      { name: 'hosted + WebGPU', hostname: 'example.com', support: 'webgpu', cards: ['choice-cloud', 'choice-browser'] },
      { name: 'hosted without WebGPU', hostname: 'example.com', support: 'wasm', cards: ['choice-cloud'] },
    ] as const

    for (const c of cases) {
      it(`${c.name}: renders exactly ${c.cards.length} card(s) and no placeholder`, async () => {
        const { configureProvider } = await import('../../composables/useProvider')
        configureProvider({ browser: fakeBrowserRuntime({ support: c.support }) })
        const wrapper = await mountCard({ isDev: false, hostname: c.hostname })
        await flushPromises()

        const grid = wrapper.get('.provider-onboarding__choices')
        const children = grid.element.children
        expect(children).toHaveLength(c.cards.length)
        expect(Array.from(children).map((el) => el.getAttribute('data-test'))).toEqual([...c.cards])
        expect(wrapper.findAll('.provider-onboarding__choice')).toHaveLength(c.cards.length)
      })
    }

    it('the grid never switches to a fixed three-column modifier', async () => {
      const { configureProvider } = await import('../../composables/useProvider')
      configureProvider({ browser: fakeBrowserRuntime({ support: 'webgpu' }) })
      const wrapper = await mountCard({ isDev: true, hostname: 'localhost' })
      await flushPromises()
      expect(wrapper.get('.provider-onboarding__choices').classes()).toEqual(['provider-onboarding__choices'])
    })

    it('reflects an already-configured browser provider as the active choice on mount', async () => {
      const { configureProvider } = await import('../../composables/useProvider')
      configureProvider({ browser: fakeBrowserRuntime({ support: 'webgpu' }) })
      const { usePreferences } = await import('../../composables/usePreferences')
      usePreferences().update({ provider: { kind: 'browser', modelId: 'onnx-community/Qwen3-0.6B-ONNX' } })

      const wrapper = await mountCard({ isDev: true, hostname: 'localhost' })
      await flushPromises()
      expect(wrapper.get('[data-test="choice-browser"]').classes()).toContain('provider-onboarding__choice--active')
      expect(wrapper.get('[data-test="choice-local"]').classes()).not.toContain('provider-onboarding__choice--active')
      expect(wrapper.get('[data-test="choice-cloud"]').classes()).not.toContain('provider-onboarding__choice--active')
    })
  })
})
