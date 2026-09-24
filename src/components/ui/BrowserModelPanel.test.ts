// BrowserModelPanel (docs/browser-inference.md): the in-browser model's
// support check, size, download with progress, cache note and removal.
// Presentational: it only renders the state it is given and emits intents.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BrowserModelPanel from './BrowserModelPanel.vue'
import type { BrowserPanelState } from './BrowserModelPanel.vue'
import { BROWSER_MODELS } from '../../domain/provider'

const IDLE: BrowserPanelState = {
  phase: 'idle',
  progress: null,
  support: 'webgpu',
  device: null,
  cachedBytes: 0,
  error: null,
}

const mountPanel = (state: Partial<BrowserPanelState> = {}) =>
  mount(BrowserModelPanel, { props: { model: BROWSER_MODELS[0], state: { ...IDLE, ...state } } })

describe('BrowserModelPanel', () => {
  it('names the model, its download size and the placeholder caveat', () => {
    const text = mountPanel().text()
    expect(text).toContain('Qwen3 0.6B')
    expect(text).toMatch(/579 MB/)
    expect(text).toMatch(/not Jev/i)
  })

  it('lists every real provider the placeholder is not, including Laya', () => {
    const text = mountPanel().text()
    expect(text).toMatch(/not Jev, JevK5, Kev or Laya/i)
  })

  it('says WebGPU runs on the GPU', () => {
    expect(mountPanel().get('[data-test="browser-support"]').text()).toMatch(/WebGPU/)
  })

  it('warns that the WASM fallback is slow, and shows its larger download', () => {
    const wrapper = mountPanel({ support: 'wasm' })
    expect(wrapper.get('[data-test="browser-support"]').text()).toMatch(/slow/i)
    expect(wrapper.text()).toMatch(/928 MB/)
    expect(wrapper.get('[data-test="download-model"]').attributes('disabled')).toBeUndefined()
  })

  it('cannot download when the browser supports neither', () => {
    const wrapper = mountPanel({ support: 'none', phase: 'unsupported' })
    expect(wrapper.get('[data-test="browser-support"]').text()).toMatch(/cannot run/i)
    expect(wrapper.get('[data-test="download-model"]').attributes('disabled')).toBeDefined()
  })

  it('emits download and shows progress while downloading', async () => {
    const wrapper = mountPanel()
    await wrapper.get('[data-test="download-model"]').trigger('click')
    expect(wrapper.emitted('download')).toHaveLength(1)

    const downloading = mountPanel({ phase: 'downloading', progress: 0.42 })
    expect(downloading.get('[data-test="download-progress"]').text()).toMatch(/42%/)
    expect(downloading.get('[data-test="download-model"]').attributes('disabled')).toBeDefined()
  })

  it('reports a loaded model and its device', () => {
    const wrapper = mountPanel({ phase: 'ready', device: 'webgpu', cachedBytes: 578_917_626 })
    expect(wrapper.get('[data-test="browser-model-status"]').text()).toMatch(/ready.*WebGPU/i)
  })

  it('reports a load error', () => {
    const wrapper = mountPanel({ phase: 'error', error: 'WebGPU device lost' })
    expect(wrapper.get('[data-test="browser-model-status"]').text()).toMatch(/WebGPU device lost/)
  })

  it('explains the cache and offers removal only when something is cached', async () => {
    expect(mountPanel().find('[data-test="remove-model"]').exists()).toBe(false)
    const wrapper = mountPanel({ cachedBytes: 578_917_626 })
    expect(wrapper.get('[data-test="cache-note"]').text()).toMatch(/cache/i)
    expect(wrapper.get('[data-test="cached-size"]').text()).toMatch(/579 MB/)
    await wrapper.get('[data-test="remove-model"]').trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)
  })
})
