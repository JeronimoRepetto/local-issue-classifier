// Passive hardware detection (docs/hardware-fit.md). Reads only values the
// browser already exposes: the WebGL renderer/vendor strings, the WebGPU
// adapter info, navigator.deviceMemory, hardwareConcurrency and the platform.
// It never renders, benchmarks, times a loop or touches the network, and it
// never throws: anything unavailable becomes "unknown".
import { lookupGpu, parseRendererString, unknownHardwareReport } from '../../domain/hardware'
import type { GpuInfo, GpuVendor, HardwareConfidence, HardwareReport, ParsedRenderer } from '../../domain/hardware'

// Minimal structural shapes, so tests can pass plain fakes.
export interface WebGlLike {
  VENDOR: number
  RENDERER: number
  getExtension(name: string): unknown
  getParameter(pname: number): unknown
}
export interface CanvasLike {
  getContext(kind: string): unknown
}
export interface GpuAdapterInfoLike {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
}
export interface GpuAdapterLike {
  info?: GpuAdapterInfoLike
  requestAdapterInfo?: () => Promise<GpuAdapterInfoLike>
}
export interface GpuLike {
  requestAdapter(): Promise<GpuAdapterLike | null>
}
export interface NavigatorLike {
  deviceMemory?: number
  hardwareConcurrency?: number
  platform?: string
  userAgentData?: { platform?: string }
  gpu?: GpuLike
}

export interface DetectDeps {
  createCanvas?: () => CanvasLike | null
  navigator?: NavigatorLike | null
  /** WebGPU entry point; defaults to navigator.gpu. Pass null to skip WebGPU. */
  gpu?: GpuLike | null
  /** Upper bound for requestAdapter(), which some drivers never resolve. */
  timeoutMs?: number
}

/** Chrome rounds deviceMemory down to a power of two and caps it at 8. */
const DEVICE_MEMORY_CAP_GB = 8
const DEFAULT_TIMEOUT_MS = 1500

function defaultCanvas(): CanvasLike | null {
  return typeof document === 'undefined' ? null : document.createElement('canvas')
}

function defaultNavigator(): NavigatorLike | null {
  return typeof navigator === 'undefined' ? null : (navigator as unknown as NavigatorLike)
}

function isWebGl(value: unknown): value is WebGlLike {
  return typeof value === 'object' && value !== null && typeof (value as WebGlLike).getParameter === 'function'
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

interface WebGlStrings {
  renderer: string | null
  vendor: string | null
}

function readWebGl(createCanvas: () => CanvasLike | null): WebGlStrings | null {
  try {
    const canvas = createCanvas()
    if (!canvas) return null
    const first = canvas.getContext('webgl2')
    const gl = isWebGl(first) ? first : canvas.getContext('webgl')
    if (!isWebGl(gl)) return null
    const debug = gl.getExtension('WEBGL_debug_renderer_info') as
      | { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number }
      | null
    const strings: WebGlStrings = {
      renderer: asString(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null) ?? asString(gl.getParameter(gl.RENDERER)),
      vendor: asString(debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null) ?? asString(gl.getParameter(gl.VENDOR)),
    }
    const lose = gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null
    lose?.loseContext?.()
    return strings
  } catch {
    return null
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}

async function readWebGpu(gpu: GpuLike | null | undefined, timeoutMs: number): Promise<GpuAdapterInfoLike | null> {
  if (!gpu || typeof gpu.requestAdapter !== 'function') return null
  try {
    const adapter = await withTimeout(Promise.resolve().then(() => gpu.requestAdapter()), timeoutMs)
    if (!adapter) return null
    if (adapter.info) return adapter.info
    if (typeof adapter.requestAdapterInfo === 'function') {
      return await withTimeout(Promise.resolve().then(() => adapter.requestAdapterInfo!()), timeoutMs)
    }
    return null
  } catch {
    return null
  }
}

const WEBGPU_VENDORS: Record<string, GpuVendor> = {
  nvidia: 'nvidia',
  amd: 'amd',
  intel: 'intel',
  apple: 'apple',
  qualcomm: 'qualcomm',
  arm: 'arm',
}

function fromWebGpu(info: GpuAdapterInfoLike | null): ParsedRenderer | null {
  if (!info) return null
  const described = parseRendererString(asString(info.description) ?? asString(info.device))
  if (described.model) return described
  const vendor = WEBGPU_VENDORS[(info.vendor ?? '').toLowerCase()] ?? described.vendor
  return vendor === 'unknown' ? null : { vendor, model: null, masked: true, software: false }
}

function pickGpu(webgl: ParsedRenderer | null, webgpu: ParsedRenderer | null): GpuInfo {
  const none: GpuInfo = { vendor: 'unknown', model: null, vramGb: null, source: 'unknown' }
  const usable = (p: ParsedRenderer | null) => (p && !p.software ? p : null)
  const gl = usable(webgl)
  const wg = usable(webgpu)
  const withModel = gl?.model ? { parsed: gl, source: 'webgl' as const } : wg?.model ? { parsed: wg, source: 'webgpu' as const } : null
  if (withModel) {
    const entry = lookupGpu(withModel.parsed.model)
    return { vendor: withModel.parsed.vendor, model: withModel.parsed.model, vramGb: entry?.vramGb ?? null, source: withModel.source }
  }
  if (gl && gl.vendor !== 'unknown') return { ...none, vendor: gl.vendor, source: 'webgl' }
  if (wg && wg.vendor !== 'unknown') return { ...none, vendor: wg.vendor, source: 'webgpu' }
  return none
}

function confidenceOf(gpu: GpuInfo): HardwareConfidence {
  if (lookupGpu(gpu.model)) return 'high'
  if (gpu.model || gpu.vendor === 'apple') return 'medium'
  return 'low'
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Detects the hardware passively. Every dependency is injectable for tests. */
export async function detectHardware(deps: DetectDeps = {}): Promise<HardwareReport> {
  const report = unknownHardwareReport()
  try {
    const nav = deps.navigator === undefined ? defaultNavigator() : deps.navigator
    const gpuApi = deps.gpu === undefined ? nav?.gpu : deps.gpu
    const strings = readWebGl(deps.createCanvas ?? defaultCanvas)
    let webgl = strings ? parseRendererString(strings.renderer) : null
    // A masked renderer can still come with an honest vendor string ("Google Inc. (NVIDIA)").
    if (strings && webgl && webgl.vendor === 'unknown' && !webgl.software) {
      webgl = { ...webgl, vendor: parseRendererString(strings.vendor).vendor }
    }
    const webgpu = fromWebGpu(await readWebGpu(gpuApi, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS))
    const gpu = pickGpu(webgl, webgpu)
    const ram = readNumber(nav?.deviceMemory)
    return {
      gpu,
      ramGb: ram,
      ramIsLowerBound: ram !== null && ram >= DEVICE_MEMORY_CAP_GB,
      cpuThreads: readNumber(nav?.hardwareConcurrency),
      platform: asString(nav?.userAgentData?.platform) ?? asString(nav?.platform) ?? 'unknown',
      unifiedMemory: gpu.vendor === 'apple' || (lookupGpu(gpu.model)?.unifiedMemory ?? false),
      confidence: confidenceOf(gpu),
    }
  } catch {
    return report
  }
}
