import { describe, expect, it } from 'vitest'
import {
  GPU_TABLE,
  LOCAL_TIERS,
  UNIFIED_MIN_RESERVE_GB,
  applyHardwareOverride,
  fitTiers,
  gpuKey,
  lookupGpu,
  parseRendererString,
  sanitizeHardwareOverride,
  unknownHardwareReport,
} from './hardware'
import type { HardwareReport } from './hardware'

describe('parseRendererString', () => {
  const cases: Array<{ input: string; vendor: string; model: string | null; masked?: boolean; software?: boolean }> = [
    {
      input: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      vendor: 'nvidia',
      model: 'NVIDIA GeForce RTX 5070',
    },
    {
      input: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002860) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      vendor: 'nvidia',
      model: 'NVIDIA GeForce RTX 4070 Laptop GPU',
    },
    {
      input: 'ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      vendor: 'amd',
      model: 'AMD Radeon RX 7900 XTX',
    },
    {
      input: 'ANGLE (Intel, Intel(R) Arc(TM) B580 Graphics (0x0000E20B) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      vendor: 'intel',
      model: 'Intel Arc B580 Graphics',
    },
    {
      input: 'ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004680) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      vendor: 'intel',
      model: 'Intel UHD Graphics 770',
    },
    {
      input: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
      vendor: 'apple',
      model: 'Apple M2 Pro',
    },
    { input: 'Apple M1', vendor: 'apple', model: 'Apple M1' },
    { input: 'Apple GPU', vendor: 'apple', model: null, masked: true },
    {
      input: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
      vendor: 'intel',
      model: 'Intel UHD Graphics 620',
    },
    {
      input: 'AMD Radeon RX 6800 XT (navi21, LLVM 15.0.7, DRM 3.49, 6.1.0-13-amd64)',
      vendor: 'amd',
      model: 'AMD Radeon RX 6800 XT',
    },
    {
      input: 'ANGLE (AMD, AMD Radeon RX 6800 XT (navi21, LLVM 15.0.7, DRM 3.49, 6.1.0-13-amd64), OpenGL 4.6 (Core Profile) Mesa 23.0.4)',
      vendor: 'amd',
      model: 'AMD Radeon RX 6800 XT',
    },
    {
      input: 'NVIDIA GeForce RTX 3080/PCIe/SSE2',
      vendor: 'nvidia',
      model: 'NVIDIA GeForce RTX 3080',
    },
    {
      input: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL 4.5.0 NVIDIA 535.54.03)',
      vendor: 'nvidia',
      model: 'NVIDIA GeForce RTX 4090',
    },
    {
      input: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar',
      vendor: 'nvidia',
      model: null,
      masked: true,
    },
    { input: 'NVIDIA GeForce GTX 980, or similar', vendor: 'nvidia', model: null, masked: true },
    { input: 'Mozilla', vendor: 'unknown', model: null, masked: true },
    { input: 'Google Inc. (NVIDIA)', vendor: 'nvidia', model: null, masked: true },
    { input: 'WebKit WebGL', vendor: 'unknown', model: null, masked: true },
    { input: '', vendor: 'unknown', model: null, masked: true },
    { input: 'llvmpipe (LLVM 15.0.6, 256 bits)', vendor: 'unknown', model: null, software: true },
    {
      input: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      vendor: 'unknown',
      model: null,
      software: true,
    },
  ]

  it.each(cases)('parses "$input"', ({ input, vendor, model, masked = false, software = false }) => {
    const parsed = parseRendererString(input)
    expect(parsed.vendor).toBe(vendor)
    expect(parsed.model).toBe(model)
    expect(parsed.masked).toBe(masked)
    expect(parsed.software).toBe(software)
  })

  it('treats null and undefined as masked unknown', () => {
    expect(parseRendererString(null)).toEqual({ vendor: 'unknown', model: null, masked: true, software: false })
    expect(parseRendererString(undefined).masked).toBe(true)
  })
})

describe('GPU table', () => {
  it('builds canonical keys from real model strings', () => {
    expect(gpuKey('NVIDIA GeForce RTX 5070')).toBe('nvidia rtx 5070')
    expect(gpuKey('NVIDIA GeForce RTX 4070 Laptop GPU')).toBe('nvidia rtx 4070 laptop')
    expect(gpuKey('NVIDIA GeForce RTX 4070 Ti SUPER')).toBe('nvidia rtx 4070 ti super')
    expect(gpuKey('NVIDIA GeForce RTX 3070 Ti Laptop GPU')).toBe('nvidia rtx 3070 ti laptop')
    expect(gpuKey('AMD Radeon RX 7900 XTX')).toBe('amd rx 7900 xtx')
    expect(gpuKey('AMD Radeon RX 7600M XT')).toBe('amd rx 7600m xt')
    expect(gpuKey('Intel Arc B580 Graphics')).toBe('intel arc b580')
    expect(gpuKey('Intel Arc A770M Graphics')).toBe('intel arc a770m')
    expect(gpuKey('Apple M2 Pro')).toBe('apple m2 pro')
    expect(gpuKey('Apple M4')).toBe('apple m4')
    expect(gpuKey('Intel UHD Graphics 620')).toBeNull()
  })

  it('looks up VRAM for desktop and laptop variants', () => {
    expect(lookupGpu('NVIDIA GeForce RTX 5070')?.vramGb).toBe(12)
    expect(lookupGpu('NVIDIA GeForce RTX 5090')?.vramGb).toBe(32)
    expect(lookupGpu('NVIDIA GeForce RTX 4090 Laptop GPU')?.vramGb).toBe(16)
    expect(lookupGpu('NVIDIA GeForce RTX 4090')?.vramGb).toBe(24)
    expect(lookupGpu('NVIDIA GeForce RTX 3080 Ti')?.vramGb).toBe(12)
    expect(lookupGpu('AMD Radeon RX 7900 XTX')?.vramGb).toBe(24)
    expect(lookupGpu('AMD Radeon RX 6700 XT')?.vramGb).toBe(12)
    expect(lookupGpu('AMD Radeon RX 9070 XT')?.vramGb).toBe(16)
    expect(lookupGpu('Intel Arc B580 Graphics')?.vramGb).toBe(12)
    expect(lookupGpu('Intel Arc A380 Graphics')?.vramGb).toBe(6)
  })

  it('marks Apple silicon as unified memory with no fixed VRAM', () => {
    const m2 = lookupGpu('Apple M2 Pro')
    expect(m2?.unifiedMemory).toBe(true)
    expect(m2?.vramGb).toBeNull()
    expect(lookupGpu('Apple M4 Max')?.unifiedMemory).toBe(true)
    expect(lookupGpu('Apple M1 Ultra')?.unifiedMemory).toBe(true)
  })

  it('omits models whose VRAM varies between SKUs, and unknown models', () => {
    expect(lookupGpu('NVIDIA GeForce RTX 3060')).toBeNull() // 8 GB and 12 GB SKUs
    expect(lookupGpu('NVIDIA GeForce RTX 4060 Ti')).toBeNull() // 8 GB and 16 GB SKUs
    expect(lookupGpu('Intel UHD Graphics 620')).toBeNull()
    expect(lookupGpu(null)).toBeNull()
  })

  it('has unique ids and keys', () => {
    const ids = GPU_TABLE.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of GPU_TABLE) expect(lookupGpu(entry.name)?.id).toBe(entry.id)
  })
})

function report(patch: Omit<Partial<HardwareReport>, 'gpu'> & { gpu?: Partial<HardwareReport['gpu']> }): HardwareReport {
  const base = unknownHardwareReport()
  return { ...base, ...patch, gpu: { ...base.gpu, ...patch.gpu } }
}

function verdicts(r: HardwareReport) {
  return Object.fromEntries(fitTiers(r).tiers.map((t) => [t.id, t.verdict]))
}

describe('fitTiers', () => {
  it('declares the four local tiers with sourced requirements', () => {
    expect(LOCAL_TIERS.map((t) => [t.id, t.requiredGb])).toEqual([
      ['kev-0.8b', 3],
      ['kev-4b', 10],
      ['jevk5', 10],
      ['kev-9b', 20],
    ])
  })

  it('returns unknown for every tier with a manual-override hint when VRAM is unknown', () => {
    const fit = fitTiers(report({ gpu: { vendor: 'intel', model: 'Intel UHD Graphics 620', source: 'webgl' } }))
    expect(fit.tiers.every((t) => t.verdict === 'unknown')).toBe(true)
    expect(fit.tiers[0].reasons.join(' ')).toMatch(/manual/i)
    expect(fit.recommendation.tier).toBe('cloud')
    expect(fit.cloud).toMatch(/cloud/i)
  })

  it('grades a 12 GB RTX 5070: 0.8b/4b/jevk5 ok, 9b no', () => {
    const r = report({ gpu: { vendor: 'nvidia', model: 'NVIDIA GeForce RTX 5070', vramGb: 12, source: 'webgl' } })
    expect(verdicts(r)).toEqual({ 'kev-0.8b': 'ok', 'kev-4b': 'ok', jevk5: 'ok', 'kev-9b': 'no' })
    const fit = fitTiers(r)
    expect(fit.recommendation.tier).toBe('jevk5')
    expect(fit.memory).toEqual({ availableGb: 12, basis: 'vram', lowerBound: false })
  })

  it('marks a requirement that fits without headroom as tight', () => {
    const r = report({ gpu: { vendor: 'nvidia', model: 'X', vramGb: 10, source: 'manual' } })
    expect(verdicts(r)).toEqual({ 'kev-0.8b': 'ok', 'kev-4b': 'tight', jevk5: 'tight', 'kev-9b': 'no' })
    expect(fitTiers(r).recommendation.tier).toBe('kev-0.8b')
  })

  it('recommends a tight tier only when no tier is ok', () => {
    const r = report({ gpu: { vendor: 'nvidia', model: 'X', vramGb: 3, source: 'manual' } })
    expect(verdicts(r)['kev-0.8b']).toBe('tight')
    expect(fitTiers(r).recommendation.tier).toBe('kev-0.8b')
  })

  it('recommends cloud when nothing fits', () => {
    const r = report({ gpu: { vendor: 'nvidia', model: 'X', vramGb: 2, source: 'manual' } })
    expect(Object.values(verdicts(r))).toEqual(['no', 'no', 'no', 'no'])
    expect(fitTiers(r).recommendation.tier).toBe('cloud')
  })

  it('uses RAM minus a reserve on Apple unified memory (32 GB Mac fits 4B and 9B)', () => {
    const r = report({
      gpu: { vendor: 'apple', model: 'Apple M2 Pro', source: 'manual', vramGb: 32 },
      unifiedMemory: true,
    })
    const fit = fitTiers(r)
    expect(fit.memory.basis).toBe('unified')
    expect(fit.memory.availableGb).toBe(24)
    expect(verdicts(r)).toEqual({ 'kev-0.8b': 'ok', 'kev-4b': 'ok', jevk5: 'ok', 'kev-9b': 'ok' })
    expect(fit.recommendation.tier).toBe('kev-9b')
  })

  it('applies the minimum reserve on small unified-memory machines', () => {
    const r = report({ gpu: { vendor: 'apple', model: 'Apple M1' }, unifiedMemory: true, ramGb: 8 })
    expect(fitTiers(r).memory.availableGb).toBe(8 - UNIFIED_MIN_RESERVE_GB)
  })

  it('reports unknown instead of no when RAM is only a browser lower bound', () => {
    const r = report({ gpu: { vendor: 'apple', model: 'Apple M2 Pro' }, unifiedMemory: true, ramGb: 8, ramIsLowerBound: true })
    const fit = fitTiers(r)
    expect(fit.memory.lowerBound).toBe(true)
    expect(verdicts(r)).toEqual({ 'kev-0.8b': 'ok', 'kev-4b': 'unknown', jevk5: 'unknown', 'kev-9b': 'unknown' })
    expect(fit.tiers[1].reasons.join(' ')).toMatch(/at least 8 GB/)
  })

  it('returns unknown on unified memory with no RAM figure', () => {
    const r = report({ gpu: { vendor: 'apple', model: null }, unifiedMemory: true })
    expect(Object.values(verdicts(r))).toEqual(['unknown', 'unknown', 'unknown', 'unknown'])
  })

  it('gives every tier at least one reason', () => {
    const r = report({ gpu: { vendor: 'nvidia', model: 'X', vramGb: 16, source: 'manual' } })
    for (const tier of fitTiers(r).tiers) expect(tier.reasons.length).toBeGreaterThan(0)
  })
})

describe('applyHardwareOverride', () => {
  it('replaces the GPU with a table entry and marks it manual/high', () => {
    const detected = report({ gpu: { vendor: 'intel', model: 'Intel UHD Graphics 620', source: 'webgl' }, confidence: 'medium' })
    const r = applyHardwareOverride(detected, { gpuId: 'nvidia-rtx-4070', vramGb: null })
    expect(r.gpu).toEqual({ vendor: 'nvidia', model: 'NVIDIA GeForce RTX 4070', vramGb: 12, source: 'manual' })
    expect(r.confidence).toBe('high')
    expect(r.unifiedMemory).toBe(false)
  })

  it('lets a VRAM number override the table value, keeping the detected model', () => {
    const detected = report({ gpu: { vendor: 'intel', model: 'Intel UHD Graphics 620', source: 'webgl' } })
    const r = applyHardwareOverride(detected, { gpuId: null, vramGb: 6 })
    expect(r.gpu.model).toBe('Intel UHD Graphics 620')
    expect(r.gpu.vramGb).toBe(6)
    expect(r.gpu.source).toBe('manual')
  })

  it('switches to unified memory for an Apple entry', () => {
    const r = applyHardwareOverride(unknownHardwareReport(), { gpuId: 'apple-m3-max', vramGb: 64 })
    expect(r.unifiedMemory).toBe(true)
    expect(fitTiers(r).memory).toEqual({ availableGb: 48, basis: 'unified', lowerBound: false })
  })
})

describe('sanitizeHardwareOverride', () => {
  it('accepts a known id and a positive VRAM', () => {
    expect(sanitizeHardwareOverride({ gpuId: 'nvidia-rtx-5070', vramGb: 12 })).toEqual({ gpuId: 'nvidia-rtx-5070', vramGb: 12 })
  })

  it('drops unknown ids, invalid numbers and empty overrides', () => {
    expect(sanitizeHardwareOverride({ gpuId: 'nope', vramGb: 8 })).toEqual({ gpuId: null, vramGb: 8 })
    expect(sanitizeHardwareOverride({ gpuId: 'nope', vramGb: -1 })).toBeNull()
    expect(sanitizeHardwareOverride({ gpuId: null, vramGb: Number.NaN })).toBeNull()
    expect(sanitizeHardwareOverride('x')).toBeNull()
    expect(sanitizeHardwareOverride(null)).toBeNull()
    expect(sanitizeHardwareOverride(undefined)).toBeNull()
  })
})
