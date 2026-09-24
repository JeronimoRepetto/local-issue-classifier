// Passive hardware-fit (docs/hardware-fit.md): pure parsing of a WebGL/WebGPU
// renderer string, a small hand-maintained GPU → VRAM table, and a verdict per
// local Jev-compatible model tier. Nothing here measures anything: the inputs
// are strings and numbers the browser already exposes, or what the user types.
import { BROWSER_MODELS } from './provider'

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'qualcomm' | 'arm' | 'unknown'
export type GpuSource = 'webgl' | 'webgpu' | 'manual' | 'unknown'
export type HardwareConfidence = 'high' | 'medium' | 'low'

export interface GpuInfo {
  vendor: GpuVendor
  /** Cleaned display name, e.g. "NVIDIA GeForce RTX 5070"; null when masked. */
  model: string | null
  /** Dedicated VRAM, or on unified-memory machines a user-entered memory size. */
  vramGb: number | null
  source: GpuSource
}

export interface HardwareReport {
  gpu: GpuInfo
  ramGb: number | null
  /** true when ramGb is a browser cap (Chrome's deviceMemory stops at 8), i.e. "≥ ramGb". */
  ramIsLowerBound: boolean
  cpuThreads: number | null
  platform: string
  unifiedMemory: boolean
  confidence: HardwareConfidence
}

/** The user's manual correction, persisted in Preferences.hardwareOverride. */
export interface HardwareOverride {
  /** A GPU_TABLE id, or null to keep the detected GPU. */
  gpuId: string | null
  /** VRAM in GB (unified memory on Apple silicon), or null to use the table/detected value. */
  vramGb: number | null
}

export function unknownHardwareReport(): HardwareReport {
  return {
    gpu: { vendor: 'unknown', model: null, vramGb: null, source: 'unknown' },
    ramGb: null,
    ramIsLowerBound: false,
    cpuThreads: null,
    platform: 'unknown',
    unifiedMemory: false,
    confidence: 'low',
  }
}

// ── Renderer string parsing ──────────────────────────────────────────
export interface ParsedRenderer {
  vendor: GpuVendor
  model: string | null
  /** The browser hid the real GPU (Safari "Apple GPU", Firefox ", or similar", generic names). */
  masked: boolean
  /** A CPU rasterizer (SwiftShader, llvmpipe, Microsoft Basic Render). */
  software: boolean
}

const GENERIC_RENDERERS = /^(mozilla|webkit webgl|webkit|generic renderer|apple gpu|google inc\.?)$/i
const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|softpipe|microsoft basic render|software rasterizer/i

/** Splits on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current.trim())
  return parts
}

/** Removes one balanced parenthetical group at the very end, if any. */
function stripTrailingGroup(text: string): string {
  if (!text.endsWith(')')) return text
  let depth = 0
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ')') depth++
    if (text[i] === '(') depth--
    if (depth === 0) {
      // Keep inline trademark marks such as "Intel(R)" / "Arc(TM)".
      if (i > 0 && text[i - 1] !== ' ') return text
      return text.slice(0, i).trimEnd()
    }
  }
  return text
}

function cleanDevice(raw: string): string {
  let device = raw
    .replace(/^ANGLE Metal Renderer:\s*/i, '')
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
    .replace(/\s+Direct3D\d*.*$/i, '')
    .replace(/\/PCIe\/SSE2|\/PCI\/SSE2|\/SSE2/gi, '')
  let previous = ''
  while (previous !== device) {
    previous = device
    device = stripTrailingGroup(device)
  }
  return device
    .replace(/^Mesa\s+/i, '')
    .replace(/\((R|TM)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function vendorOf(text: string): GpuVendor {
  if (/nvidia|geforce|quadro|\brtx\b/i.test(text)) return 'nvidia'
  if (/\bamd\b|radeon|\bati\b/i.test(text)) return 'amd'
  if (/intel/i.test(text)) return 'intel'
  if (/apple/i.test(text)) return 'apple'
  if (/qualcomm|adreno/i.test(text)) return 'qualcomm'
  if (/\bmali\b|\barm\b/i.test(text)) return 'arm'
  return 'unknown'
}

/** Parses the common WebGL renderer shapes (Chrome ANGLE on Windows/macOS/Linux,
 *  Linux Mesa and proprietary drivers, Safari, Firefox). Never throws. */
export function parseRendererString(input: string | null | undefined): ParsedRenderer {
  const text = (input ?? '').trim()
  if (text === '' || GENERIC_RENDERERS.test(text)) {
    return { vendor: vendorOf(text), model: null, masked: true, software: false }
  }
  if (SOFTWARE_RENDERERS.test(text)) {
    return { vendor: 'unknown', model: null, masked: false, software: true }
  }
  // Firefox's privacy-sanitized renderer ends in ", or similar": the vendor is
  // right, the model is only a bucket representative.
  if (/,\s*or similar$/i.test(text)) {
    return { vendor: vendorOf(text), model: null, masked: true, software: false }
  }
  let vendorHint = ''
  let device = text
  const angle = /^ANGLE \((.*)\)$/i.exec(text)
  if (angle) {
    const parts = splitTopLevel(angle[1])
    vendorHint = parts[0] ?? ''
    device = parts[1] ?? parts[0] ?? ''
  }
  const model = cleanDevice(device)
  if (model === '' || GENERIC_RENDERERS.test(model)) {
    return { vendor: vendorOf(text), model: null, masked: true, software: false }
  }
  return { vendor: vendorOf(`${model} ${vendorHint}`), model, masked: false, software: false }
}

// ── GPU → VRAM table ─────────────────────────────────────────────────
export interface GpuTableEntry {
  id: string
  vendor: GpuVendor
  name: string
  /** null for Apple silicon: memory is unified and depends on the configuration. */
  vramGb: number | null
  unifiedMemory: boolean
}

/**
 * Canonical lookup key for a GPU name, or null when the name is not a family we
 * catalog. Examples: "nvidia rtx 4070 ti super", "nvidia rtx 4070 laptop",
 * "amd rx 7600m xt", "intel arc a770m", "apple m2 pro".
 */
export function gpuKey(model: string | null | undefined): string | null {
  if (!model) return null
  const text = model.toLowerCase()
  const nvidia = /rtx\s*(\d{4})(\s+ti)?(\s+super)?/.exec(text)
  if (nvidia) {
    const laptop = /laptop|mobile|max-q/.test(text) ? ' laptop' : ''
    return `nvidia rtx ${nvidia[1]}${nvidia[2] ? ' ti' : ''}${nvidia[3] ? ' super' : ''}${laptop}`
  }
  const amd = /\brx\s*(\d{4}m?)(\s+(xtx|xt|gre))?\b/.exec(text)
  if (amd) return `amd rx ${amd[1]}${amd[3] ? ` ${amd[3]}` : ''}`
  const arc = /\barc\s+([ab]\d{3}m?)\b/.exec(text)
  if (arc) return `intel arc ${arc[1]}`
  const apple = /\bapple\s+(m[1-9])(\s+(pro|max|ultra))?\b/.exec(text)
  if (apple) return `apple ${apple[1]}${apple[3] ? ` ${apple[3]}` : ''}`
  return null
}

type Row = [vendor: GpuVendor, name: string, vramGb: number | null]

// Only models whose VRAM is the same across every SKU are listed (e.g. the
// RTX 3060 ships with 8 or 12 GB, the RTX 4060 Ti with 8 or 16 GB, so they are
// deliberately absent: the user picks the VRAM manually instead).
const ROWS: Row[] = [
  // NVIDIA desktop
  ['nvidia', 'NVIDIA GeForce RTX 3060 Ti', 8],
  ['nvidia', 'NVIDIA GeForce RTX 3070', 8],
  ['nvidia', 'NVIDIA GeForce RTX 3070 Ti', 8],
  ['nvidia', 'NVIDIA GeForce RTX 3080 Ti', 12],
  ['nvidia', 'NVIDIA GeForce RTX 3090', 24],
  ['nvidia', 'NVIDIA GeForce RTX 3090 Ti', 24],
  ['nvidia', 'NVIDIA GeForce RTX 4060', 8],
  ['nvidia', 'NVIDIA GeForce RTX 4070', 12],
  ['nvidia', 'NVIDIA GeForce RTX 4070 SUPER', 12],
  ['nvidia', 'NVIDIA GeForce RTX 4070 Ti', 12],
  ['nvidia', 'NVIDIA GeForce RTX 4070 Ti SUPER', 16],
  ['nvidia', 'NVIDIA GeForce RTX 4080', 16],
  ['nvidia', 'NVIDIA GeForce RTX 4080 SUPER', 16],
  ['nvidia', 'NVIDIA GeForce RTX 4090', 24],
  ['nvidia', 'NVIDIA GeForce RTX 5060', 8],
  ['nvidia', 'NVIDIA GeForce RTX 5070', 12],
  ['nvidia', 'NVIDIA GeForce RTX 5070 Ti', 16],
  ['nvidia', 'NVIDIA GeForce RTX 5080', 16],
  ['nvidia', 'NVIDIA GeForce RTX 5090', 32],
  // NVIDIA laptop
  ['nvidia', 'NVIDIA GeForce RTX 3060 Laptop GPU', 6],
  ['nvidia', 'NVIDIA GeForce RTX 3070 Laptop GPU', 8],
  ['nvidia', 'NVIDIA GeForce RTX 3070 Ti Laptop GPU', 8],
  ['nvidia', 'NVIDIA GeForce RTX 3080 Ti Laptop GPU', 16],
  ['nvidia', 'NVIDIA GeForce RTX 4050 Laptop GPU', 6],
  ['nvidia', 'NVIDIA GeForce RTX 4060 Laptop GPU', 8],
  ['nvidia', 'NVIDIA GeForce RTX 4070 Laptop GPU', 8],
  ['nvidia', 'NVIDIA GeForce RTX 4080 Laptop GPU', 12],
  ['nvidia', 'NVIDIA GeForce RTX 4090 Laptop GPU', 16],
  ['nvidia', 'NVIDIA GeForce RTX 5060 Laptop GPU', 8],
  ['nvidia', 'NVIDIA GeForce RTX 5070 Laptop GPU', 8],
  ['nvidia', 'NVIDIA GeForce RTX 5070 Ti Laptop GPU', 12],
  ['nvidia', 'NVIDIA GeForce RTX 5080 Laptop GPU', 16],
  ['nvidia', 'NVIDIA GeForce RTX 5090 Laptop GPU', 24],
  // AMD RX 6000 / 7000 / 9000 desktop
  ['amd', 'AMD Radeon RX 6400', 4],
  ['amd', 'AMD Radeon RX 6600', 8],
  ['amd', 'AMD Radeon RX 6600 XT', 8],
  ['amd', 'AMD Radeon RX 6650 XT', 8],
  ['amd', 'AMD Radeon RX 6700', 10],
  ['amd', 'AMD Radeon RX 6700 XT', 12],
  ['amd', 'AMD Radeon RX 6750 XT', 12],
  ['amd', 'AMD Radeon RX 6800', 16],
  ['amd', 'AMD Radeon RX 6800 XT', 16],
  ['amd', 'AMD Radeon RX 6900 XT', 16],
  ['amd', 'AMD Radeon RX 6950 XT', 16],
  ['amd', 'AMD Radeon RX 7600', 8],
  ['amd', 'AMD Radeon RX 7600 XT', 16],
  ['amd', 'AMD Radeon RX 7700 XT', 12],
  ['amd', 'AMD Radeon RX 7800 XT', 16],
  ['amd', 'AMD Radeon RX 7900 GRE', 16],
  ['amd', 'AMD Radeon RX 7900 XT', 20],
  ['amd', 'AMD Radeon RX 7900 XTX', 24],
  ['amd', 'AMD Radeon RX 9070', 16],
  ['amd', 'AMD Radeon RX 9070 XT', 16],
  // Intel Arc A / B (desktop and the fixed-VRAM laptop parts)
  ['intel', 'Intel Arc A310', 4],
  ['intel', 'Intel Arc A380', 6],
  ['intel', 'Intel Arc A580', 8],
  ['intel', 'Intel Arc A750', 8],
  ['intel', 'Intel Arc A370M', 4],
  ['intel', 'Intel Arc A550M', 8],
  ['intel', 'Intel Arc A730M', 12],
  ['intel', 'Intel Arc A770M', 16],
  ['intel', 'Intel Arc B570', 10],
  ['intel', 'Intel Arc B580', 12],
  // Apple silicon: unified memory, the size depends on the machine.
  ...(['M1', 'M2', 'M3', 'M4'] as const).flatMap((chip) =>
    ['', ' Pro', ' Max', ' Ultra']
      .filter((suffix) => !(chip === 'M4' && suffix === ' Ultra'))
      .map((suffix): Row => ['apple', `Apple ${chip}${suffix}`, null]),
  ),
]

function idOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/^nvidia geforce /, 'nvidia-')
    .replace(/^amd radeon /, 'amd-')
    .replace(/ laptop gpu$/, ' laptop')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export const GPU_TABLE: readonly GpuTableEntry[] = ROWS.map(([vendor, name, vramGb]) => ({
  id: idOf(name),
  vendor,
  name,
  vramGb,
  unifiedMemory: vendor === 'apple',
}))

const BY_KEY = new Map(GPU_TABLE.map((entry) => [gpuKey(entry.name), entry]))
const BY_ID = new Map(GPU_TABLE.map((entry) => [entry.id, entry]))

export function lookupGpu(model: string | null | undefined): GpuTableEntry | null {
  const key = gpuKey(model)
  return key === null ? null : (BY_KEY.get(key) ?? null)
}

export function gpuById(id: string | null | undefined): GpuTableEntry | null {
  return id ? (BY_ID.get(id) ?? null) : null
}

// ── Manual override ──────────────────────────────────────────────────
const MAX_MEMORY_GB = 512

function validMemory(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_MEMORY_GB ? value : null
}

/** Validates a stored override; anything malformed degrades to null fields, and an empty override to null. */
export function sanitizeHardwareOverride(value: unknown): HardwareOverride | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const gpuId = typeof raw.gpuId === 'string' && BY_ID.has(raw.gpuId) ? raw.gpuId : null
  const vramGb = validMemory(raw.vramGb)
  return gpuId === null && vramGb === null ? null : { gpuId, vramGb }
}

/** The detected report with the user's correction applied on top. */
export function applyHardwareOverride(report: HardwareReport, override: HardwareOverride | null): HardwareReport {
  if (!override) return report
  const entry = gpuById(override.gpuId)
  const vramGb = validMemory(override.vramGb) ?? entry?.vramGb ?? report.gpu.vramGb
  const gpu: GpuInfo = entry
    ? { vendor: entry.vendor, model: entry.name, vramGb, source: 'manual' }
    : { ...report.gpu, vramGb, source: 'manual' }
  const unifiedMemory = entry ? entry.unifiedMemory : report.unifiedMemory
  const known = unifiedMemory ? vramGb !== null || report.ramGb !== null : vramGb !== null
  return { ...report, gpu, unifiedMemory, confidence: known ? 'high' : report.confidence }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// ── Tier fit ─────────────────────────────────────────────────────────
export type TierId = 'kev-0.8b' | 'kev-4b' | 'jevk5' | 'kev-9b' | 'browser-small'
export type TierVerdictKind = 'ok' | 'tight' | 'no' | 'unknown'

export interface LocalTier {
  id: TierId
  label: string
  /** Approximate GPU (or unified) memory needed to run the model, in GB. */
  requiredGb: number
}

// Requirement sources:
// - Kev README: the 4B and 9B models fit on a 32 GB Mac (unified memory); the
//   ~10 GB / ~20 GB figures are the working-set estimates handed to this task.
// - JevK5 README: ~9 GB of GPU memory in bf16 → rounded up to 10 GB.
// - Kev 0.8B: ~3 GB working-set estimate.
export const LOCAL_TIERS: readonly LocalTier[] = [
  { id: 'kev-0.8b', label: 'Kev 0.8B', requiredGb: 3 },
  { id: 'kev-4b', label: 'Kev 4B', requiredGb: 10 },
  { id: 'jevk5', label: 'JevK5', requiredGb: 10 },
  { id: 'kev-9b', label: 'Kev 9B', requiredGb: 20 },
]

/** An in-browser model needs about this multiple of its download (weights + activations + KV cache). */
export const BROWSER_MEMORY_FACTOR = 1.5

/**
 * The in-browser tier (docs/browser-inference.md): the default browser model's
 * WebGPU download × 1.5, in GB. Judged on its own (FitResult.browser) so it
 * never changes the local-server recommendation.
 */
export const BROWSER_TIER: LocalTier = {
  id: 'browser-small',
  label: `In-browser ${BROWSER_MODELS[0].label}`,
  requiredGb: round1((BROWSER_MODELS[0].downloadBytes.webgpu * BROWSER_MEMORY_FACTOR) / 1e9),
}

/** A tier is "ok" when it uses at most this share of the available memory. */
export const OK_HEADROOM = 0.85
/** Unified memory keeps this share of RAM for the OS and the browser... */
export const UNIFIED_RESERVE_FRACTION = 0.25
/** ...but never less than this many GB. */
export const UNIFIED_MIN_RESERVE_GB = 4

export interface TierVerdict extends LocalTier {
  verdict: TierVerdictKind
  reasons: string[]
}

export interface FitResult {
  memory: { availableGb: number | null; basis: 'vram' | 'unified' | 'none'; lowerBound: boolean }
  tiers: TierVerdict[]
  /** The in-browser tier: VRAM (WebGPU) when known, otherwise RAM (the WASM fallback runs on the CPU). */
  browser: TierVerdict
  recommendation: { tier: TierId | 'cloud'; reason: string }
  cloud: string
}

export const CLOUD_FALLBACK =
  'Cloud (TypeSafe Jev API): works on any hardware; needs a Jev API key and sends issue text to the API.'

const MANUAL_HINT = 'Pick your GPU or enter its memory manually below.'


function availableMemory(report: HardwareReport): FitResult['memory'] {
  if (report.unifiedMemory) {
    const manual = report.gpu.source === 'manual' && report.gpu.vramGb !== null
    const pool = manual ? report.gpu.vramGb : report.ramGb
    if (pool === null) return { availableGb: null, basis: 'none', lowerBound: false }
    const reserve = Math.max(UNIFIED_MIN_RESERVE_GB, pool * UNIFIED_RESERVE_FRACTION)
    return {
      availableGb: round1(Math.max(0, pool - reserve)),
      basis: 'unified',
      lowerBound: !manual && report.ramIsLowerBound,
    }
  }
  if (report.gpu.vramGb === null) return { availableGb: null, basis: 'none', lowerBound: false }
  return { availableGb: report.gpu.vramGb, basis: 'vram', lowerBound: false }
}

type MemoryBasis = FitResult['memory']['basis'] | 'ram'
type Memory = { availableGb: number | null; basis: MemoryBasis; lowerBound: boolean }

const POOL_TEXT: Record<MemoryBasis, string> = {
  vram: 'VRAM',
  unified: 'usable unified memory (RAM minus a reserve)',
  ram: 'RAM (the browser falls back to the CPU)',
  none: 'VRAM',
}

function judge(tier: LocalTier, memory: Memory, report: HardwareReport): TierVerdict {
  const { availableGb, basis, lowerBound } = memory
  if (availableGb === null) {
    const why = report.unifiedMemory
      ? 'The browser did not report how much memory this machine has.'
      : "Your GPU's memory could not be determined."
    return { ...tier, verdict: 'unknown', reasons: [why, MANUAL_HINT] }
  }
  const pool = POOL_TEXT[basis]
  const needs = `Needs ~${tier.requiredGb} GB; ${availableGb} GB of ${pool} available.`
  if (tier.requiredGb <= availableGb * OK_HEADROOM) return { ...tier, verdict: 'ok', reasons: [needs] }
  if (tier.requiredGb <= availableGb) {
    return { ...tier, verdict: 'tight', reasons: [needs, 'Fits with little headroom; other apps may push it out.'] }
  }
  if (lowerBound) {
    return {
      ...tier,
      verdict: 'unknown',
      reasons: [needs, `The browser only reports at least ${report.ramGb} GB of RAM.`, MANUAL_HINT],
    }
  }
  return { ...tier, verdict: 'no', reasons: [needs] }
}

/** Verdict per local model tier plus a recommendation; the cloud always works. */
export function fitTiers(report: HardwareReport): FitResult {
  const memory = availableMemory(report)
  const tiers = LOCAL_TIERS.map((tier) => judge(tier, memory, report))
  // The last matching tier in LOCAL_TIERS order wins, so equal requirements
  // prefer the later (JevK5 over Kev 4B).
  const lastWith = (verdict: TierVerdictKind) => [...tiers].reverse().find((t) => t.verdict === verdict)
  const best = lastWith('ok') ?? lastWith('tight')
  const recommendation = best
    ? { tier: best.id, reason: `${best.label} is the largest local model that ${best.verdict === 'ok' ? 'fits' : 'just fits'}.` }
    : {
        tier: 'cloud' as const,
        reason:
          memory.availableGb === null
            ? `No local verdict without a memory figure. ${MANUAL_HINT}`
            : 'No local model fits this hardware; use the cloud API.',
      }
  const browserMemory: Memory =
    memory.availableGb === null && report.ramGb !== null
      ? { availableGb: report.ramGb, basis: 'ram', lowerBound: report.ramIsLowerBound }
      : memory
  const browser = judge(BROWSER_TIER, browserMemory, report)
  return { memory, tiers, browser, recommendation, cloud: CLOUD_FALLBACK }
}
