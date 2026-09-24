// browserModel: loads a model with transformers.js and exposes the readout
// primitive (last-position logits for a few token ids). transformers.js is
// replaced by a fake runtime, so nothing is downloaded and no ONNX runs here.
import { describe, expect, it, vi } from 'vitest'
import { PREFILL_CHUNK, loadBrowserModel } from './browserModel'
import type { TransformersRuntime } from './browserModel'

const VOCAB = 8

class FakeTensor {
  constructor(
    readonly type: string,
    readonly data: ArrayLike<number | bigint>,
    readonly dims: number[],
  ) {}
  location = 'cpu'
  dispose = vi.fn()
}

/** fp32 → IEEE half bits, for the float16 logits case (exact for small integers). */
function toHalf(value: number): number {
  const f = new Float32Array([value])
  const bits = new Uint32Array(f.buffer)[0]
  const sign = (bits >>> 16) & 0x8000
  const exp = ((bits >>> 23) & 0xff) - 127 + 15
  const mant = (bits >>> 13) & 0x3ff
  if (value === 0) return sign
  return sign | (exp << 10) | mant
}

function fakeRuntime(options: { failDevice?: string; logitsType?: 'float32' | 'float16' } = {}) {
  const calls: { inputs: Record<string, FakeTensor>; }[] = []
  const modelLoads: { id: string; opts: Record<string, unknown> }[] = []
  const tokenizerLoads: { id: string; opts: Record<string, unknown> }[] = []
  const env = { allowLocalModels: true, useBrowserCache: false, backends: { onnx: { wasm: {} as Record<string, unknown> } } }

  const model = Object.assign(
    vi.fn(async (inputs: Record<string, FakeTensor>) => {
      calls.push({ inputs })
      const len = inputs.input_ids.dims[1]
      const ids = Array.from(inputs.input_ids.data as ArrayLike<bigint>, Number)
      // logits[pos][v] = token id at pos + v: the last row reveals the last token.
      const values = Array.from({ length: len * VOCAB }, (_, k) => ids[Math.floor(k / VOCAB)] + (k % VOCAB))
      const data = options.logitsType === 'float16' ? Uint16Array.from(values.map(toHalf)) : Float32Array.from(values)
      return {
        logits: new FakeTensor(options.logitsType ?? 'float32', data, [1, len, VOCAB]),
        'present.0.key': Object.assign(new FakeTensor('float32', [], [1, 1, len, 1]), { location: 'gpu-buffer' }),
      }
    }),
    {
      getPastKeyValues: vi.fn((out: Record<string, FakeTensor>) => ({ 'past_key_values.0.key': out['present.0.key'] })),
      dispose: vi.fn(async () => {}),
    },
  )

  const runtime: TransformersRuntime = {
    env,
    Tensor: FakeTensor as never,
    AutoTokenizer: {
      from_pretrained: vi.fn(async (id: string, opts: Record<string, unknown>) => {
        tokenizerLoads.push({ id, opts })
        return {
          encode: (text: string) => (text.length === 1 ? [text.charCodeAt(0)] : Array.from(text, (c) => c.charCodeAt(0))),
        }
      }),
    },
    AutoModelForCausalLM: {
      from_pretrained: vi.fn(async (id: string, opts: Record<string, unknown>) => {
        modelLoads.push({ id, opts })
        if (opts.device === options.failDevice) throw new Error('no adapter')
        ;(opts.progress_callback as ((e: unknown) => void) | undefined)?.({
          status: 'progress',
          file: 'onnx/model_q4f16.onnx',
          loaded: 50,
          total: 100,
          progress: 50,
        })
        return model as never
      }),
    },
  }
  return { runtime, env, model, calls, modelLoads, tokenizerLoads }
}

describe('loadBrowserModel', () => {
  it('loads on WebGPU with q4f16 weights, browser cache on, local ORT wasm files', async () => {
    const fake = fakeRuntime()
    const ortWasmEnv = fake.env.backends.onnx.wasm
    const loaded = await loadBrowserModel({ modelId: 'org/model', backend: 'webgpu', runtime: async () => fake.runtime, wasmPaths: '/ort/' })
    // ONNX Runtime reads this very object: it must be mutated, never replaced.
    expect(fake.env.backends.onnx.wasm).toBe(ortWasmEnv)
    expect(loaded.device).toBe('webgpu')
    expect(loaded.id).toBe('org/model')
    expect(fake.modelLoads).toHaveLength(1)
    expect(fake.modelLoads[0]).toMatchObject({ id: 'org/model', opts: { device: 'webgpu', dtype: 'q4f16' } })
    expect(fake.env).toMatchObject({ allowLocalModels: false, useBrowserCache: true })
    expect(fake.env.backends.onnx.wasm.wasmPaths).toBe('/ort/')
  })

  it('falls back to WASM with q4 weights when WebGPU fails', async () => {
    const fake = fakeRuntime({ failDevice: 'webgpu' })
    const loaded = await loadBrowserModel({ modelId: 'org/model', backend: 'webgpu', runtime: async () => fake.runtime })
    expect(loaded.device).toBe('wasm')
    expect(fake.modelLoads.map((l) => [l.opts.device, l.opts.dtype])).toEqual([
      ['webgpu', 'q4f16'],
      ['wasm', 'q4'],
    ])
  })

  it('goes straight to WASM when the browser has no WebGPU', async () => {
    const fake = fakeRuntime()
    const loaded = await loadBrowserModel({ modelId: 'org/model', backend: 'wasm', runtime: async () => fake.runtime })
    expect(loaded.device).toBe('wasm')
    expect(fake.modelLoads).toHaveLength(1)
  })

  it('reports download progress per file', async () => {
    const fake = fakeRuntime()
    const onProgress = vi.fn()
    await loadBrowserModel({ modelId: 'org/model', backend: 'webgpu', runtime: async () => fake.runtime, onProgress })
    expect(onProgress).toHaveBeenCalledWith({ file: 'onnx/model_q4f16.onnx', loaded: 50, total: 100 })
  })

  it('maps each letter to its single token id', async () => {
    const fake = fakeRuntime()
    const loaded = await loadBrowserModel({ modelId: 'org/model', backend: 'wasm', runtime: async () => fake.runtime })
    expect(loaded.letterTokenIds(['A', 'B'])).toEqual([65, 66])
    expect(loaded.encode('hi')).toEqual([104, 105])
  })

  it('reads the last-position logits for the candidate ids only', async () => {
    const fake = fakeRuntime()
    const loaded = await loadBrowserModel({ modelId: 'org/model', backend: 'wasm', runtime: async () => fake.runtime })
    // Last token 40 → last row is [40, 41, …]; candidates 1 and 3 → 41 and 43.
    expect(await loaded.logitsAt([10, 20, 30, 40], [1, 3])).toEqual([41, 43])
  })

  it('decodes float16 logits', async () => {
    const fake = fakeRuntime({ logitsType: 'float16' })
    const loaded = await loadBrowserModel({ modelId: 'org/model', backend: 'wasm', runtime: async () => fake.runtime })
    expect(await loaded.logitsAt([5, 6], [0, 2])).toEqual([6, 8])
  })

  it('prefills a long prompt in chunks, carrying the KV cache, and frees it afterwards', async () => {
    const fake = fakeRuntime()
    const loaded = await loadBrowserModel({ modelId: 'org/model', backend: 'wasm', runtime: async () => fake.runtime })
    const tokens = Array.from({ length: PREFILL_CHUNK * 2 + 3 }, (_, i) => i % 50)
    const logits = await loaded.logitsAt(tokens, [0])
    expect(logits).toEqual([tokens.at(-1)])
    expect(fake.calls.map((c) => c.inputs.input_ids.dims[1])).toEqual([PREFILL_CHUNK, PREFILL_CHUNK, 3])
    expect(fake.calls.map((c) => c.inputs.attention_mask.dims[1])).toEqual([PREFILL_CHUNK, PREFILL_CHUNK * 2, PREFILL_CHUNK * 2 + 3])
    expect(fake.calls[0].inputs.past_key_values).toBeUndefined()
    expect(fake.calls[1].inputs.past_key_values).toBeDefined()
    // The last cache is on the GPU and is disposed once the readout is done.
    const lastPast = fake.model.getPastKeyValues.mock.results.at(-1)?.value as Record<string, FakeTensor>
    expect(lastPast['past_key_values.0.key'].dispose).toHaveBeenCalled()
  })

  it('refuses an empty prompt', async () => {
    const fake = fakeRuntime()
    const loaded = await loadBrowserModel({ modelId: 'org/model', backend: 'wasm', runtime: async () => fake.runtime })
    await expect(loaded.logitsAt([], [0])).rejects.toThrow()
  })
})
