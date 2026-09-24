// GPU vs CPU readout for a local Kev/JevK5 server (docs/local-providers.md
// "GPU or CPU"): Kev's `/v1/models` reports per model `device` ("cuda" |
// "cpu") and `dtype`; the app turns that, plus the passive hardware detection,
// into a short label and the callouts the Home card and Settings show.
import { describe, expect, it } from 'vitest'
import { localDeviceAdvice, normalizeDtype, parseModelRuntime, runtimeReadout, shortRuntimeLabel } from './localDevice'
import type { ModelRuntime } from './localDevice'
import { CUDA_TORCH_INDEX_URL } from './localCommands'

const CUDA: ModelRuntime = { name: 'kev-0.8b', device: 'cuda', dtype: 'bf16' }
const CPU: ModelRuntime = { name: 'kev-0.8b', device: 'cpu', dtype: 'fp32' }

describe('parseModelRuntime', () => {
  it("reads the first model's name, device and dtype (Kev's and the OpenAI-style shapes)", () => {
    expect(parseModelRuntime({ models: [{ name: 'kev-0.8b', device: 'cuda', dtype: 'bfloat16' }] })).toEqual(CUDA)
    expect(parseModelRuntime({ data: [{ id: 'kev-0.8b', device: 'cpu', dtype: 'torch.float32' }] })).toEqual(CPU)
  })

  it('tolerates a missing dtype, and is null without a device', () => {
    expect(parseModelRuntime({ models: [{ name: 'kev-0.8b', device: 'cuda' }] })).toEqual({
      name: 'kev-0.8b',
      device: 'cuda',
      dtype: null,
    })
    expect(parseModelRuntime({ models: [{ name: 'kev-0.8b' }] })).toBeNull()
    expect(parseModelRuntime(null)).toBeNull()
    expect(parseModelRuntime({ models: [] })).toBeNull()
  })
})

describe('normalizeDtype', () => {
  it('shortens the torch spellings and keeps unknown ones', () => {
    expect(normalizeDtype('bfloat16')).toBe('bf16')
    expect(normalizeDtype('torch.float16')).toBe('fp16')
    expect(normalizeDtype('float32')).toBe('fp32')
    expect(normalizeDtype('int8')).toBe('int8')
  })
})

describe('runtimeReadout / shortRuntimeLabel', () => {
  it('reads GPU with device and dtype, or CPU and RAM', () => {
    expect(runtimeReadout(CUDA)).toBe('Running on GPU (cuda · bf16)')
    expect(runtimeReadout({ ...CUDA, dtype: null })).toBe('Running on GPU (cuda)')
    expect(runtimeReadout(CPU)).toBe('Running on CPU and RAM')
    expect(shortRuntimeLabel(CUDA)).toBe('GPU (cuda · bf16)')
    expect(shortRuntimeLabel(CPU)).toBe('CPU')
    expect(shortRuntimeLabel(null)).toBeNull()
  })
})

describe('localDeviceAdvice', () => {
  it('the server runs on the GPU: one info callout with the readout', () => {
    const advice = localDeviceAdvice({ runtime: CUDA, gpuVendor: 'nvidia', os: 'windows' })
    expect(advice).toEqual([{ id: 'running-gpu', tone: 'info', title: 'Running on GPU (cuda · bf16)', text: expect.any(String) }])
  })

  it('the server runs on the CPU although an NVIDIA GPU was detected: warning plus the exact CUDA torch step', () => {
    const advice = localDeviceAdvice({ runtime: CPU, gpuVendor: 'nvidia', os: 'windows' })
    expect(advice.map((a) => a.id)).toEqual(['running-cpu', 'cuda-fix'])
    const [cpu, fix] = advice
    expect(cpu.tone).toBe('warning')
    expect(cpu.text).toBe(
      'Running on CPU and RAM — works, but slow (measured 0.8B: ≈470 ms vs ≈197 ms per request on GPU; 4B impractical on CPU).',
    )
    expect(fix.tone).toBe('warning')
    expect(fix.command).toBe(`uv pip install --python .venv torch torchvision --index-url ${CUDA_TORCH_INDEX_URL}`)
    expect(fix.text).toMatch(/only the NVIDIA driver is required/i)
    expect(fix.text).toMatch(/bundle the CUDA runtime/i)
    expect(fix.text).toMatch(/--no-sync/)
  })

  it('the CUDA step is OS-aware: none on macOS', () => {
    const advice = localDeviceAdvice({ runtime: CPU, gpuVendor: 'nvidia', os: 'macos' })
    expect(advice.map((a) => a.id)).toEqual(['running-cpu'])
  })

  it('no NVIDIA GPU: says upfront it runs on CPU and RAM, before any server answers', () => {
    const advice = localDeviceAdvice({ runtime: null, gpuVendor: 'amd', os: 'windows' })
    expect(advice.map((a) => a.id)).toEqual(['no-nvidia'])
    const [upfront] = advice
    expect(upfront.tone).toBe('info')
    expect(upfront.text).toMatch(/CPU and RAM/)
    expect(upfront.text).toMatch(/0\.8B.*4 GB/)
    expect(upfront.text).toMatch(/AMD.*Linux.*ROCm/)
    expect(upfront.text).toMatch(/Apple Silicon.*automatically/)
  })

  it('no NVIDIA GPU and the server reports cpu: the upfront note plus the slow-CPU warning, no CUDA step', () => {
    const advice = localDeviceAdvice({ runtime: CPU, gpuVendor: 'intel', os: 'linux' })
    expect(advice.map((a) => a.id)).toEqual(['no-nvidia', 'running-cpu'])
  })

  it('says nothing upfront when detection is unknown or finds Apple Silicon', () => {
    expect(localDeviceAdvice({ runtime: null, gpuVendor: 'unknown', os: 'windows' })).toEqual([])
    expect(localDeviceAdvice({ runtime: null, gpuVendor: 'apple', os: 'macos' })).toEqual([])
    expect(localDeviceAdvice({ runtime: null, gpuVendor: null, os: 'windows' })).toEqual([])
  })
})
