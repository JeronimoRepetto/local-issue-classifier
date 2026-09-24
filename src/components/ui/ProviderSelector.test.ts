// T16 — ProviderSelector: presentational provider picker (TypeSafe cloud or a
// local Jev-compatible server) plus the batching "Advanced" fields. It owns no
// persistence: it emits values, and `probe` is injected by the container.
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProviderSelector from './ProviderSelector.vue'
import type { ProviderConfig, ProviderProbeResult } from '../../domain/provider'
import { defaultBrowserProviderConfig } from '../../domain/provider'

const LOCAL: ProviderConfig = { kind: 'local', baseUrl: 'http://localhost:8009', model: 'kev-latest' }

function mountSelector(
  props: Partial<{
    modelValue: ProviderConfig
    apiKey: string
    probe: () => Promise<ProviderProbeResult>
  }> = {},
) {
  return mount(ProviderSelector, {
    props: {
      modelValue: { kind: 'typesafe' },
      apiKey: '',
      classifyMode: 'batched',
      trimmingFloor: 'minimal',
      probe: async () => ({ status: 'direct', models: null }),
      ...props,
    },
  })
}

describe('ProviderSelector', () => {
  it('shows TypeSafe selected and hides the local fields by default', () => {
    const wrapper = mountSelector()
    expect((wrapper.get('[data-test="kind-typesafe"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('[data-test="base-url"]').exists()).toBe(false)
  })

  it('switching to Local emits the Kev preset', async () => {
    const wrapper = mountSelector()
    await wrapper.get('[data-test="kind-local"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([LOCAL])
  })

  it('switching back to TypeSafe emits the cloud config', async () => {
    const wrapper = mountSelector({ modelValue: LOCAL })
    await wrapper.get('[data-test="kind-typesafe"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ kind: 'typesafe' }])
  })

  it('applies a preset', async () => {
    const wrapper = mountSelector({ modelValue: LOCAL })
    expect((wrapper.get('[data-test="preset"] select').element as HTMLSelectElement).value).toBe('kev')
    await wrapper.get('[data-test="preset"] select').setValue('jevk5')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
      { kind: 'local', baseUrl: 'http://localhost:8090', model: 'alibiserikbay/JevK5' },
    ])
  })

  it('shows "Custom" for a base URL that matches no preset', () => {
    const wrapper = mountSelector({ modelValue: { ...LOCAL, baseUrl: 'http://10.0.0.5:9000' } })
    expect((wrapper.get('[data-test="preset"] select').element as HTMLSelectElement).value).toBe('custom')
  })

  it('emits base URL and model edits', async () => {
    const wrapper = mountSelector({ modelValue: LOCAL })
    await wrapper.get('[data-test="base-url"] input').setValue('http://192.168.1.20:8009')
    await wrapper.get('[data-test="model"] input').setValue('kev-4b')
    expect(wrapper.emitted('update:modelValue')).toEqual([
      [{ ...LOCAL, baseUrl: 'http://192.168.1.20:8009' }],
      [{ ...LOCAL, model: 'kev-4b' }],
    ])
  })

  it('shows the validation message for a public host and disables Test connection', () => {
    const wrapper = mountSelector({ modelValue: { ...LOCAL, baseUrl: 'https://api.example.com' } })
    expect(wrapper.get('[data-test="base-url"] [data-test="error"]').text()).toMatch(/localhost|private/i)
    expect(wrapper.get('[data-test="test-connection"]').attributes('disabled')).toBeDefined()
  })

  it('emits the optional key without storing it', async () => {
    const wrapper = mountSelector({ modelValue: LOCAL })
    await wrapper.get('[data-test="local-key"] input').setValue('kev-key')
    expect(wrapper.emitted('update:apiKey')?.[0]).toEqual(['kev-key'])
  })

  it('tests the connection and shows the route and the model list', async () => {
    let resolve!: (value: ProviderProbeResult) => void
    const probe = vi.fn(() => new Promise<ProviderProbeResult>((r) => (resolve = r)))
    const wrapper = mountSelector({ modelValue: LOCAL, probe })
    await wrapper.get('[data-test="test-connection"]').trigger('click')
    expect(probe).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-test="probe-status"]').text()).toMatch(/checking/i)

    resolve({ status: 'direct', models: ['kev-latest', 'kev-4b'] })
    await flushPromises()
    expect(wrapper.get('[data-test="probe-status"]').text()).toMatch(/direct/i)
    expect(wrapper.findAll('[data-test="probe-models"] li').map((li) => li.text())).toEqual(['kev-latest', 'kev-4b'])
  })

  it.each([
    ['proxied', /proxy/i],
    ['unreachable', /could not reach/i],
  ] as const)('reports a %s result', async (status, text) => {
    const wrapper = mountSelector({ modelValue: LOCAL, probe: async () => ({ status, models: null }) })
    await wrapper.get('[data-test="test-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="probe-status"]').text()).toMatch(text)
    expect(wrapper.find('[data-test="probe-models"]').exists()).toBe(false)
  })

  it('forgets the last probe result when the base URL changes', async () => {
    const wrapper = mountSelector({ modelValue: LOCAL })
    await wrapper.get('[data-test="test-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="probe-status"]').exists()).toBe(true)
    await wrapper.setProps({ modelValue: { ...LOCAL, baseUrl: 'http://localhost:8090' } })
    expect(wrapper.find('[data-test="probe-status"]').exists()).toBe(false)
  })

  it('exposes classify mode and trimming floor under Advanced', async () => {
    const wrapper = mountSelector()
    await wrapper.get('[data-test="classify-mode"] select').setValue('per-issue')
    await wrapper.get('[data-test="trimming-floor"] select').setValue('compact')
    expect(wrapper.emitted('update:classifyMode')?.[0]).toEqual(['per-issue'])
    expect(wrapper.emitted('update:trimmingFloor')?.[0]).toEqual(['compact'])
  })

  it('offers the local state budget in Advanced for a local provider only, and emits it as a number', async () => {
    expect(mountSelector().find('[data-test="local-max-state-tokens"]').exists()).toBe(false)
    const wrapper = mount(ProviderSelector, {
      props: {
        modelValue: LOCAL,
        apiKey: '',
        classifyMode: 'batched',
        trimmingFloor: 'minimal',
        localMaxStateTokens: 8_000,
        probe: async () => ({ status: 'direct', models: null }),
      },
    })
    const input = wrapper.get('[data-test="local-max-state-tokens"] input')
    expect((input.element as HTMLInputElement).value).toBe('8000')
    await input.setValue('6000')
    expect(wrapper.emitted('update:localMaxStateTokens')?.[0]).toEqual([6_000])
  })

  it('renders the GPU vs CPU callouts it is given, with a copyable command, for a local provider', () => {
    const wrapper = mount(ProviderSelector, {
      props: {
        modelValue: LOCAL,
        apiKey: '',
        classifyMode: 'batched',
        trimmingFloor: 'minimal',
        probe: async () => ({ status: 'direct', models: null }),
        deviceAdvice: [
          { id: 'running-cpu', tone: 'warning', title: 'Running on CPU and RAM', text: 'Slow.' },
          { id: 'cuda-fix', tone: 'warning', title: 'Use your NVIDIA GPU', text: 'Driver only.', command: 'uv pip install x' },
        ],
      },
    })
    expect(wrapper.get('[data-test="device-callout-running-cpu"]').text()).toContain('Slow.')
    expect(wrapper.get('[data-test="device-callout-cuda-fix"] [data-test="command-cuda-fix"]').text()).toBe('uv pip install x')
  })

  it('labels the local option as advanced on a hosted page, and plainly when running locally', () => {
    const label = (hosted?: boolean) =>
      mount(ProviderSelector, {
        props: {
          modelValue: { kind: 'typesafe' },
          apiKey: '',
          classifyMode: 'batched',
          trimmingFloor: 'minimal',
          probe: async () => ({ status: 'direct', models: null }),
          hosted,
        },
      })
        .get('[data-test="kind-local-label"]')
        .text()
    expect(label(true)).toBe('Advanced: a Kev/JevK5/Laya server on your machine')
    expect(label(false)).toBe('Local server (Kev, JevK5, Laya)')
    expect(label()).toBe('Local server (Kev, JevK5, Laya)')
  })

  // FB-4 — the local setup guide, and a hint pointing to it when unreachable.
  it('mounts the local setup guide only for a local provider', () => {
    expect(mountSelector().find('[data-test="local-setup-guide"]').exists()).toBe(false)
    expect(mountSelector({ modelValue: LOCAL }).find('[data-test="local-setup-guide"]').exists()).toBe(true)
  })

  it('shows no unreachable hint before testing or after a successful test', async () => {
    const wrapper = mountSelector({ modelValue: LOCAL })
    expect(wrapper.find('[data-test="unreachable-hint"]').exists()).toBe(false)
    await wrapper.get('[data-test="test-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="unreachable-hint"]').exists()).toBe(false)
  })

  it('hints at the setup guide, naming the port, when the server is unreachable', async () => {
    const wrapper = mountSelector({ modelValue: LOCAL, probe: async () => ({ status: 'unreachable', models: null }) })
    await wrapper.get('[data-test="test-connection"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="unreachable-hint"]').text()).toMatch(/port 8009/)
  })

  // In-browser inference (docs/browser-inference.md): a third, experimental kind.
  it('offers "In this browser (experimental)" and emits the default browser model', async () => {
    const wrapper = mountSelector()
    expect(wrapper.get('[data-test="kind-browser-label"]').text()).toBe('In this browser (experimental)')
    await wrapper.get('[data-test="kind-browser"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([defaultBrowserProviderConfig()])
  })

  it('mounts the browser model panel only for the browser kind, and relays its intents', async () => {
    expect(mountSelector().find('[data-test="browser-model-panel"]').exists()).toBe(false)
    const wrapper = mountSelector({ modelValue: defaultBrowserProviderConfig() })
    expect((wrapper.get('[data-test="kind-browser"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('[data-test="base-url"]').exists()).toBe(false)
    await wrapper.get('[data-test="download-model"]').trigger('click')
    expect(wrapper.emitted('download-model')).toHaveLength(1)
  })

  it('gates the download on browser support: disabled without WebGPU or WASM', () => {
    const wrapper = mount(ProviderSelector, {
      props: {
        modelValue: defaultBrowserProviderConfig(),
        apiKey: '',
        classifyMode: 'batched',
        trimmingFloor: 'minimal',
        probe: async () => ({ status: 'direct', models: null }),
        browser: { phase: 'unsupported', progress: null, support: 'none', device: null, cachedBytes: null, error: null },
      },
    })
    expect(wrapper.get('[data-test="download-model"]').attributes('disabled')).toBeDefined()
  })

  it('notes that the browser always runs per issue', () => {
    const wrapper = mountSelector({ modelValue: defaultBrowserProviderConfig() })
    expect(wrapper.get('[data-test="browser-per-issue-note"]').text()).toMatch(/one issue at a time/i)
  })
})
