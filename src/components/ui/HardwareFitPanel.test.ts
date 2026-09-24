import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { unknownHardwareReport } from '../../domain/hardware'
import type { HardwareOverride, HardwareReport } from '../../domain/hardware'

const RTX_5070: HardwareReport = {
  gpu: { vendor: 'nvidia', model: 'NVIDIA GeForce RTX 5070', vramGb: 12, source: 'webgl' },
  ramGb: 8,
  ramIsLowerBound: true,
  cpuThreads: 16,
  platform: 'Windows',
  unifiedMemory: false,
  confidence: 'high',
}

// Detection is cached at module scope (once per page load), so every test
// reloads the module graph over a fresh instance of that cache.
beforeEach(() => {
  vi.resetModules()
})

async function loadPanel() {
  const { default: HardwareFitPanel } = await import('./HardwareFitPanel.vue')
  return HardwareFitPanel
}

function mountPanel(
  HardwareFitPanel: Awaited<ReturnType<typeof loadPanel>>,
  detect: () => Promise<HardwareReport>,
  override: HardwareOverride | null = null,
) {
  const wrapper = mount(HardwareFitPanel, {
    props: {
      detect,
      override,
      'onUpdate:override': (value: HardwareOverride | null) => wrapper.setProps({ override: value }),
    },
  })
  return wrapper
}

function verdictOf(wrapper: ReturnType<typeof mountPanel>, tier: string) {
  return wrapper.find(`[data-test="tier-${tier}"] [data-test="verdict"]`).text()
}

describe('HardwareFitPanel', () => {
  it('shows the privacy note and a quiet Detecting… state immediately on mount, before any report', async () => {
    const HardwareFitPanel = await loadPanel()
    const detect = vi.fn(async () => RTX_5070)
    const wrapper = mountPanel(HardwareFitPanel, detect)
    expect(wrapper.text()).toContain('runs in your browser, nothing is sent')
    expect(wrapper.text()).toContain('Detecting…')
    expect(wrapper.find('[data-test="report"]').exists()).toBe(false)
  })

  it('auto-detects on mount exactly once, then renders the report, verdicts and recommendation', async () => {
    const HardwareFitPanel = await loadPanel()
    const detect = vi.fn(async () => RTX_5070)
    const wrapper = mountPanel(HardwareFitPanel, detect)
    await flushPromises()
    expect(detect).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).not.toContain('Detecting…')
    const report = wrapper.find('[data-test="report"]').text()
    expect(report).toContain('NVIDIA GeForce RTX 5070')
    expect(report).toContain('12 GB')
    expect(report).toContain('≥ 8 GB')
    expect(report).toContain('16')
    expect(verdictOf(wrapper, 'kev-0.8b')).toBe('Fits')
    expect(verdictOf(wrapper, 'jevk5')).toBe('Fits')
    expect(verdictOf(wrapper, 'kev-9b')).toBe("Won't fit")
    expect(wrapper.find('[data-test="recommendation"]').text()).toContain('JevK5')
    expect(wrapper.find('[data-test="cloud"]').text()).toMatch(/cloud/i)
    expect(wrapper.find('[data-test="detect"]').text()).toBe('Detect again')
  })

  it('caches the report across remounts of the same page load, never re-running detect', async () => {
    const HardwareFitPanel = await loadPanel()
    const detect = vi.fn(async () => RTX_5070)
    const first = mountPanel(HardwareFitPanel, detect)
    await flushPromises()
    expect(detect).toHaveBeenCalledTimes(1)
    first.unmount()

    const second = mountPanel(HardwareFitPanel, detect)
    expect(second.text()).not.toContain('Detecting…')
    expect(second.find('[data-test="report"]').text()).toContain('NVIDIA GeForce RTX 5070')
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('"Detect again" re-runs detection', async () => {
    const HardwareFitPanel = await loadPanel()
    const detect = vi.fn(async () => RTX_5070)
    const wrapper = mountPanel(HardwareFitPanel, detect)
    await flushPromises()
    expect(detect).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-test="detect"]').trigger('click')
    await flushPromises()
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it('shows unknown verdicts with a manual hint when VRAM is unknown', async () => {
    const HardwareFitPanel = await loadPanel()
    const wrapper = mountPanel(HardwareFitPanel, async () => ({
      ...unknownHardwareReport(),
      gpu: { vendor: 'intel', model: 'Intel UHD Graphics 620', vramGb: null, source: 'webgl' },
      confidence: 'medium',
    }))
    await flushPromises()
    expect(verdictOf(wrapper, 'kev-4b')).toBe('Unknown')
    expect(wrapper.find('[data-test="tier-kev-4b"]').text()).toMatch(/manual/i)
  })

  it('applies a manual GPU pick and a VRAM number, re-running the fit and emitting the override', async () => {
    const HardwareFitPanel = await loadPanel()
    const wrapper = mountPanel(HardwareFitPanel, async () => unknownHardwareReport())
    await flushPromises()

    await wrapper.find('[data-test="override-gpu"] select').setValue('nvidia-rtx-4060')
    expect(wrapper.emitted('update:override')?.at(-1)).toEqual([{ gpuId: 'nvidia-rtx-4060', vramGb: null }])
    expect(verdictOf(wrapper, 'kev-0.8b')).toBe('Fits')
    expect(verdictOf(wrapper, 'kev-4b')).toBe("Won't fit")

    await wrapper.find('[data-test="override-vram"] input').setValue('24')
    expect(wrapper.emitted('update:override')?.at(-1)).toEqual([{ gpuId: 'nvidia-rtx-4060', vramGb: 24 }])
    expect(verdictOf(wrapper, 'kev-9b')).toBe('Fits')
    expect(wrapper.find('[data-test="report"]').text()).toContain('manual')
  })

  it('renders a persisted override even before detection completes, and clears it', async () => {
    const HardwareFitPanel = await loadPanel()
    const pending = new Promise<HardwareReport>(() => {})
    const wrapper = mountPanel(HardwareFitPanel, () => pending, { gpuId: 'apple-m2-pro', vramGb: 32 })
    expect(verdictOf(wrapper, 'kev-9b')).toBe('Fits')
    expect(wrapper.text()).toContain('unified')
    await wrapper.find('[data-test="clear-override"]').trigger('click')
    expect(wrapper.emitted('update:override')?.at(-1)).toEqual([null])
    expect(wrapper.find('[data-test="tier-kev-9b"]').exists()).toBe(false)
  })

  it('ignores an invalid VRAM number', async () => {
    const HardwareFitPanel = await loadPanel()
    const wrapper = mountPanel(HardwareFitPanel, async () => unknownHardwareReport(), {
      gpuId: 'nvidia-rtx-4060',
      vramGb: null,
    })
    await wrapper.find('[data-test="override-vram"] input').setValue('-3')
    expect(wrapper.emitted('update:override')?.at(-1)).toEqual([{ gpuId: 'nvidia-rtx-4060', vramGb: null }])
  })
})
