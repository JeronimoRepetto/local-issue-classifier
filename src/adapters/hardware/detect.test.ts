import { describe, expect, it, vi } from 'vitest'
import { detectHardware } from './detect'
import type { CanvasLike, GpuLike, NavigatorLike } from './detect'

const DEBUG_EXT = { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 }
const GL_VENDOR = 0x1f00
const GL_RENDERER = 0x1f01

function fakeCanvas(opts: {
  renderer?: string
  vendor?: string
  masked?: { renderer: string; vendor: string }
  debugExtension?: boolean
  contexts?: Array<'webgl2' | 'webgl'>
  throws?: boolean
}): { canvas: CanvasLike; asked: string[]; lost: () => boolean } {
  const asked: string[] = []
  let lost = false
  const gl = {
    VENDOR: GL_VENDOR,
    RENDERER: GL_RENDERER,
    getExtension(name: string) {
      if (name === 'WEBGL_debug_renderer_info') return opts.debugExtension === false ? null : DEBUG_EXT
      if (name === 'WEBGL_lose_context') return { loseContext: () => (lost = true) }
      return null
    },
    getParameter(p: number) {
      if (p === DEBUG_EXT.UNMASKED_RENDERER_WEBGL) return opts.renderer ?? null
      if (p === DEBUG_EXT.UNMASKED_VENDOR_WEBGL) return opts.vendor ?? null
      if (p === GL_RENDERER) return opts.masked?.renderer ?? 'WebKit WebGL'
      if (p === GL_VENDOR) return opts.masked?.vendor ?? 'WebKit'
      return null
    },
  }
  const canvas: CanvasLike = {
    getContext(kind: string) {
      asked.push(kind)
      if (opts.throws) throw new Error('blocked')
      const allowed = opts.contexts ?? ['webgl2', 'webgl']
      return allowed.includes(kind as 'webgl2' | 'webgl') ? gl : null
    },
  }
  return { canvas, asked, lost: () => lost }
}

const WIN_NAV: NavigatorLike = {
  deviceMemory: 8,
  hardwareConcurrency: 16,
  platform: 'Win32',
  userAgentData: { platform: 'Windows' },
}

describe('detectHardware (passive reads only)', () => {
  it('reads the unmasked WebGL renderer, looks up VRAM and releases the context', async () => {
    const fake = fakeCanvas({
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      vendor: 'Google Inc. (NVIDIA)',
    })
    const report = await detectHardware({ createCanvas: () => fake.canvas, navigator: WIN_NAV, gpu: null })
    expect(fake.asked[0]).toBe('webgl2')
    expect(fake.lost()).toBe(true)
    expect(report.gpu).toEqual({ vendor: 'nvidia', model: 'NVIDIA GeForce RTX 5070', vramGb: 12, source: 'webgl' })
    expect(report.ramGb).toBe(8)
    expect(report.ramIsLowerBound).toBe(true)
    expect(report.cpuThreads).toBe(16)
    expect(report.platform).toBe('Windows')
    expect(report.unifiedMemory).toBe(false)
    expect(report.confidence).toBe('high')
  })

  it('falls back to webgl when webgl2 is unavailable', async () => {
    const fake = fakeCanvas({ renderer: 'NVIDIA GeForce RTX 3080 Ti/PCIe/SSE2', contexts: ['webgl'] })
    const report = await detectHardware({ createCanvas: () => fake.canvas, navigator: WIN_NAV, gpu: null })
    expect(fake.asked).toEqual(['webgl2', 'webgl'])
    expect(report.gpu.vramGb).toBe(12)
  })

  it('uses the plain RENDERER when the debug extension is missing', async () => {
    const fake = fakeCanvas({ debugExtension: false, masked: { renderer: 'Apple M2 Pro', vendor: 'Apple' } })
    const report = await detectHardware({
      createCanvas: () => fake.canvas,
      navigator: { deviceMemory: 8, hardwareConcurrency: 12, platform: 'MacIntel' },
      gpu: null,
    })
    expect(report.gpu.model).toBe('Apple M2 Pro')
    expect(report.unifiedMemory).toBe(true)
    expect(report.platform).toBe('MacIntel')
  })

  it('marks Safari\'s masked "Apple GPU" as unified memory with medium confidence', async () => {
    const fake = fakeCanvas({ renderer: 'Apple GPU', vendor: 'Apple Inc.' })
    const report = await detectHardware({ createCanvas: () => fake.canvas, navigator: { platform: 'MacIntel' }, gpu: null })
    expect(report.gpu).toEqual({ vendor: 'apple', model: null, vramGb: null, source: 'webgl' })
    expect(report.unifiedMemory).toBe(true)
    expect(report.ramGb).toBeNull()
    expect(report.confidence).toBe('medium')
  })

  it('uses the WebGPU adapter info when WebGL is masked', async () => {
    const fake = fakeCanvas({ renderer: 'Mozilla', vendor: 'Mozilla' })
    const gpu: GpuLike = {
      requestAdapter: async () => ({
        info: { vendor: 'amd', architecture: 'rdna-3', device: '', description: 'AMD Radeon RX 7900 XTX' },
      }),
    }
    const report = await detectHardware({ createCanvas: () => fake.canvas, navigator: WIN_NAV, gpu })
    expect(report.gpu).toEqual({ vendor: 'amd', model: 'AMD Radeon RX 7900 XTX', vramGb: 24, source: 'webgpu' })
  })

  it('supports the older requestAdapterInfo() and a vendor-only answer', async () => {
    const fake = fakeCanvas({ renderer: '' })
    const gpu: GpuLike = {
      requestAdapter: async () => ({ requestAdapterInfo: async () => ({ vendor: 'nvidia', architecture: 'blackwell' }) }),
    }
    const report = await detectHardware({ createCanvas: () => fake.canvas, navigator: WIN_NAV, gpu })
    expect(report.gpu).toEqual({ vendor: 'nvidia', model: null, vramGb: null, source: 'webgpu' })
    expect(report.confidence).toBe('low')
  })

  it('treats a null adapter, a rejecting and a hanging requestAdapter as absent', async () => {
    const fake = () => fakeCanvas({ renderer: 'Mozilla' }).canvas
    for (const gpu of [
      { requestAdapter: async () => null },
      { requestAdapter: async () => Promise.reject(new Error('no')) },
      { requestAdapter: () => new Promise<never>(() => {}) },
    ] as GpuLike[]) {
      const report = await detectHardware({ createCanvas: fake, navigator: WIN_NAV, gpu, timeoutMs: 5 })
      expect(report.gpu.source).toBe('unknown')
    }
  })

  it('takes the vendor from the WebGL VENDOR string when the renderer is masked', async () => {
    const fake = fakeCanvas({ renderer: 'Mozilla', vendor: 'Google Inc. (NVIDIA)' })
    const report = await detectHardware({ createCanvas: () => fake.canvas, navigator: WIN_NAV, gpu: null })
    expect(report.gpu).toEqual({ vendor: 'nvidia', model: null, vramGb: null, source: 'webgl' })
  })

  it('reports low deviceMemory values as exact', async () => {
    const report = await detectHardware({ createCanvas: () => null, navigator: { deviceMemory: 4 }, gpu: null })
    expect(report.ramGb).toBe(4)
    expect(report.ramIsLowerBound).toBe(false)
  })

  it('never throws and returns an all-unknown report when every API is absent', async () => {
    const report = await detectHardware({ createCanvas: () => null, navigator: null, gpu: null })
    expect(report).toEqual({
      gpu: { vendor: 'unknown', model: null, vramGb: null, source: 'unknown' },
      ramGb: null,
      ramIsLowerBound: false,
      cpuThreads: null,
      platform: 'unknown',
      unifiedMemory: false,
      confidence: 'low',
    })
  })

  it('survives a canvas that throws', async () => {
    const fake = fakeCanvas({ throws: true })
    const report = await detectHardware({ createCanvas: () => fake.canvas, navigator: null, gpu: null })
    expect(report.gpu.source).toBe('unknown')
  })

  it('makes no network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await detectHardware({ createCanvas: () => null, navigator: WIN_NAV, gpu: null })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
