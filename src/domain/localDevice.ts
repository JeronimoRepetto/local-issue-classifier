// GPU vs CPU readout for a local Kev/JevK5 server (docs/local-providers.md
// "GPU or CPU"). Pure: no Vue, no fetch.
//
// Kev's `GET /v1/models` reports, per model, the `device` it runs on ("cuda"
// or "cpu") and its `dtype`. Together with the passive hardware detection
// (domain/hardware.ts) that decides what the Home card and Settings say:
// - the server runs on a GPU: an `info` readout, "Running on GPU (cuda · bf16)";
// - the server runs on the CPU: a `warning` with the measured slowdown and,
//   when an NVIDIA GPU was detected, the exact CUDA torch step (from
//   kevCommands, OS-aware) — only the NVIDIA driver is needed, since the torch
//   wheels bundle the CUDA runtime;
// - no NVIDIA GPU detected: an `info` note, before any server answers, that
//   Kev will run on the CPU and RAM, with what to pick and what accelerates.
// Tones follow docs/design.md "Callout": info for context, warning for
// something that works but needs attention.
import type { GpuVendor } from './hardware'
import { kevCommands } from './localCommands'
import type { KevOs } from './localCommands'

export interface ModelRuntime {
  /** The first model's name (or id), when listed. */
  name: string | null
  /** As reported, e.g. "cuda", "cpu", "mps". */
  device: string
  /** Short form (bf16, fp16, fp32) when reported; null otherwise. */
  dtype: string | null
}

/** The UiCallout tones this advice uses (kept here so the domain never imports UI). */
export type AdviceTone = 'info' | 'warning'

export interface DeviceAdvice {
  id: 'running-gpu' | 'running-cpu' | 'cuda-fix' | 'no-nvidia'
  tone: AdviceTone
  title: string
  text: string
  /** A command to copy (the CUDA torch step). */
  command?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const DTYPES: Record<string, string> = {
  bfloat16: 'bf16',
  float16: 'fp16',
  half: 'fp16',
  float32: 'fp32',
  float: 'fp32',
}

/** "torch.bfloat16" → "bf16"; an unknown spelling is kept as is. */
export function normalizeDtype(raw: string): string {
  const bare = raw.trim().toLowerCase().replace(/^torch\./, '')
  return DTYPES[bare] ?? bare
}

/** The first model of `/v1/models` (`{ models: [...] }` or `{ data: [...] }`), or null without a device. */
export function parseModelRuntime(body: unknown): ModelRuntime | null {
  if (!isObject(body)) return null
  const list = Array.isArray(body.models) ? body.models : Array.isArray(body.data) ? body.data : null
  const first = list?.[0]
  if (!isObject(first)) return null
  const device = typeof first.device === 'string' ? first.device.trim() : ''
  if (device === '') return null
  const name = typeof first.name === 'string' ? first.name : typeof first.id === 'string' ? first.id : null
  const dtype = typeof first.dtype === 'string' && first.dtype.trim() !== '' ? normalizeDtype(first.dtype) : null
  return { name, device, dtype }
}

const isCpu = (runtime: ModelRuntime) => runtime.device.toLowerCase() === 'cpu'

function gpuDetail(runtime: ModelRuntime): string {
  return runtime.dtype ? `${runtime.device} · ${runtime.dtype}` : runtime.device
}

/** "Running on GPU (cuda · bf16)" or "Running on CPU and RAM". */
export function runtimeReadout(runtime: ModelRuntime): string {
  return isCpu(runtime) ? 'Running on CPU and RAM' : `Running on GPU (${gpuDetail(runtime)})`
}

/** The provider switch's compact form: "GPU (cuda · bf16)" or "CPU"; null when unknown. */
export function shortRuntimeLabel(runtime: ModelRuntime | null): string | null {
  if (!runtime) return null
  return isCpu(runtime) ? 'CPU' : `GPU (${gpuDetail(runtime)})`
}

/** Measured on an RTX 5070 (docs/local-providers.md "Measured on 2026-09-24"). */
export const CPU_SLOW_TEXT =
  'Running on CPU and RAM — works, but slow (measured 0.8B: ≈470 ms vs ≈197 ms per request on GPU; 4B impractical on CPU).'

const CUDA_FIX_TEXT =
  'An NVIDIA GPU was detected, but this server runs on the CPU: its torch build is CPU-only. Run this once inside the kev folder, then restart the server with --no-sync. Only the NVIDIA driver is required — the torch wheels bundle the CUDA runtime, so no CUDA Toolkit install.'

const NO_NVIDIA_TEXT =
  'No NVIDIA GPU was detected, so Kev will run on the CPU and RAM. Pick Kev 0.8B (about 4 GB of RAM); larger models are impractical on a CPU. AMD GPUs accelerate only on Linux with ROCm; Apple Silicon accelerates automatically.'

export interface DeviceAdviceInput {
  /** The configured server's runtime from its last probe; null before one answers. */
  runtime: ModelRuntime | null
  /** Detected GPU vendor; null or 'unknown' when detection has not found one. */
  gpuVendor: GpuVendor | null
  os: KevOs
}

/** The callouts, in display order, for the Home card and Settings. */
export function localDeviceAdvice({ runtime, gpuVendor, os }: DeviceAdviceInput): DeviceAdvice[] {
  const advice: DeviceAdvice[] = []
  const knownNonNvidia = gpuVendor !== null && gpuVendor !== 'unknown' && gpuVendor !== 'nvidia' && gpuVendor !== 'apple'
  if (knownNonNvidia) advice.push({ id: 'no-nvidia', tone: 'info', title: 'Runs on CPU and RAM here', text: NO_NVIDIA_TEXT })
  if (!runtime) return advice

  if (!isCpu(runtime)) {
    advice.push({
      id: 'running-gpu',
      tone: 'info',
      title: runtimeReadout(runtime),
      text: 'The server reports a GPU device, so classification runs at full speed.',
    })
    return advice
  }

  advice.push({ id: 'running-cpu', tone: 'warning', title: 'Running on CPU and RAM', text: CPU_SLOW_TEXT })
  if (gpuVendor === 'nvidia') {
    const cuda = kevCommands({ model: 'kev-0.8b', port: 8009, os, shortcut: false }).find((step) => step.id === 'cuda')
    if (cuda?.command) {
      advice.push({ id: 'cuda-fix', tone: 'warning', title: 'Use your NVIDIA GPU', text: CUDA_FIX_TEXT, command: cuda.command })
    }
  }
  return advice
}
