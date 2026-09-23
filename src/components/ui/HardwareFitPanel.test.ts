import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HardwareFitPanel from './HardwareFitPanel.vue'
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

function mountPanel(detect: () => Promise<HardwareReport>, override: HardwareOverride | null = null) {
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
  it('shows the privacy note and runs nothing until Detect is pressed', () => {
    const detect = vi.fn(async () => RTX_5070)
    const wrapper = mountPanel(detect)
    expect(wrapper.text()).toContain('runs in your browser, nothing is sent')
    expect(detect).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="tier-kev-4b"]').exists()).toBe(false)
  })

  it('detects on click and renders the report, verdicts and recommendation', async () => {
    const detect = vi.fn(async () => RTX_5070)
    const wrapper = mountPanel(detect)
    await wrapper.find('[data-test="detect"]').trigger('click')
    await flushPromises()
    expect(detect).toHaveBeenCalledTimes(1)
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
  })

  it('shows unknown verdicts with a manual hint when VRAM is unknown', async () => {
    const wrapper = mountPanel(async () => ({
      ...unknownHardwareReport(),
      gpu: { vendor: 'intel', model: 'Intel UHD Graphics 620', vramGb: null, source: 'webgl' },
      confidence: 'medium',
    }))
    await wrapper.find('[data-test="detect"]').trigger('click')
    await flushPromises()
    expect(verdictOf(wrapper, 'kev-4b')).toBe('Unknown')
    expect(wrapper.find('[data-test="tier-kev-4b"]').text()).toMatch(/manual/i)
  })

  it('applies a manual GPU pick and a VRAM number, re-running the fit and emitting the override', async () => {
    const wrapper = mountPanel(async () => unknownHardwareReport())
    await wrapper.find('[data-test="detect"]').trigger('click')
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

  it('renders a persisted override even before detection, and clears it', async () => {
    const wrapper = mountPanel(async () => RTX_5070, { gpuId: 'apple-m2-pro', vramGb: 32 })
    expect(verdictOf(wrapper, 'kev-9b')).toBe('Fits')
    expect(wrapper.text()).toContain('unified')
    await wrapper.find('[data-test="clear-override"]').trigger('click')
    expect(wrapper.emitted('update:override')?.at(-1)).toEqual([null])
    expect(wrapper.find('[data-test="tier-kev-9b"]').exists()).toBe(false)
  })

  it('ignores an invalid VRAM number', async () => {
    const wrapper = mountPanel(async () => unknownHardwareReport(), { gpuId: 'nvidia-rtx-4060', vramGb: null })
    await wrapper.find('[data-test="override-vram"] input').setValue('-3')
    expect(wrapper.emitted('update:override')?.at(-1)).toEqual([{ gpuId: 'nvidia-rtx-4060', vramGb: null }])
  })
})
