// Shared, module-scope passive hardware-detection cache (docs/hardware-fit.md):
// HardwareFitPanel (Settings) and ProviderOnboardingCard (Home) both read this
// one cache so detection runs at most once per page load, regardless of which
// one mounts first. Each test reloads the module graph (vi.resetModules()) so
// the cache starts fresh, exactly like HardwareFitPanel.test.ts already does.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { unknownHardwareReport } from '../domain/hardware'
import type { HardwareReport } from '../domain/hardware'

const RTX_5070: HardwareReport = {
  gpu: { vendor: 'nvidia', model: 'NVIDIA GeForce RTX 5070', vramGb: 12, source: 'webgl' },
  ramGb: 8,
  ramIsLowerBound: true,
  cpuThreads: 16,
  platform: 'Windows',
  unifiedMemory: false,
  confidence: 'high',
}

beforeEach(() => {
  vi.resetModules()
})

describe('useHardwareDetection', () => {
  it('has not started and reports no cached value before run() is ever called', async () => {
    const { useHardwareDetection } = await import('./useHardwareDetection')
    const hw = useHardwareDetection()
    expect(hw.hasStarted()).toBe(false)
    expect(hw.report.value).toBeNull()
  })

  it('caches the result of run() so a second consumer sees it without detecting again', async () => {
    const { useHardwareDetection } = await import('./useHardwareDetection')
    const detect = vi.fn(async () => RTX_5070)

    const first = useHardwareDetection()
    expect(first.hasStarted()).toBe(false)
    const result = await first.run(detect)
    expect(result).toEqual(RTX_5070)
    expect(first.report.value).toEqual(RTX_5070)

    // A second call site (a different component instance) sees the same
    // cache and the same started flag without calling detect again.
    const second = useHardwareDetection()
    expect(second.hasStarted()).toBe(true)
    expect(second.report.value).toEqual(RTX_5070)
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('marks detection as started synchronously, before the detect promise resolves', async () => {
    const { useHardwareDetection } = await import('./useHardwareDetection')
    let resolveDetect: (value: HardwareReport) => void = () => {}
    const pending = new Promise<HardwareReport>((resolve) => {
      resolveDetect = resolve
    })

    const hw = useHardwareDetection()
    const runPromise = hw.run(() => pending)
    // Started immediately, before the promise settles.
    expect(hw.hasStarted()).toBe(true)
    expect(hw.report.value).toBeNull()

    resolveDetect(RTX_5070)
    await runPromise
    expect(hw.report.value).toEqual(RTX_5070)
  })

  it('falls back to unknownHardwareReport() when detect() rejects', async () => {
    const { useHardwareDetection } = await import('./useHardwareDetection')
    const hw = useHardwareDetection()
    const result = await hw.run(() => Promise.reject(new Error('boom')))
    expect(result).toEqual(unknownHardwareReport())
    expect(hw.report.value).toEqual(unknownHardwareReport())
  })
})
