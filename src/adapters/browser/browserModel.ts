// local-issue-classifier — loads a causal LM in the browser with transformers.js v3
// (ONNX Runtime Web) and exposes the one primitive the readout needs: the
// next-token logits at the last prompt position, for a few token ids
// (docs/browser-inference.md).
//
// - WebGPU with q4f16 weights first; WASM with q4 weights when the browser has
//   no WebGPU or the WebGPU load fails.
// - Weights come from the Hugging Face Hub and are cached by transformers.js
//   in the Cache API ('transformers-cache'); modelCache.ts measures and clears it.
// - ORT-Web's wasm/worker files are served by this app (vite.config.ts copies
//   them to /ort/), never from a CDN.
// - The prompt is prefilled in chunks with the KV cache carried over, so the
//   logits tensor holds PREFILL_CHUNK rows at a time instead of the whole
//   prompt (a 4k-token prompt × 152k vocabulary would be a 1.2 GB tensor).
// - transformers.js is imported lazily, so it stays out of the main bundle
//   until the user picks the browser provider. Nothing here logs.
import type { ReadoutModel } from './browserJevTransport'

export type BrowserBackend = 'webgpu' | 'wasm'

/** Tokens per forward pass while prefilling a prompt. */
export const PREFILL_CHUNK = 256

/** Weight variant per backend: fp16 activations need WebGPU; WASM gets the fp32-activation q4. */
export const DTYPE_BY_BACKEND: Readonly<Record<BrowserBackend, 'q4f16' | 'q4'>> = { webgpu: 'q4f16', wasm: 'q4' }

// ── The slice of transformers.js this file uses ─────────────────────
interface TensorLike {
  readonly type: string
  readonly data: ArrayLike<number | bigint>
  readonly dims: readonly number[]
  readonly location?: string
  dispose?(): void
}

type Outputs = Record<string, TensorLike>

interface CausalLmLike {
  (inputs: Record<string, unknown>): Promise<Outputs>
  getPastKeyValues(outputs: Outputs, past: Outputs | null | undefined): Outputs
  dispose(): Promise<unknown>
}

interface TokenizerLike {
  encode(text: string, options?: { add_special_tokens?: boolean }): number[]
}

export interface ProgressEvent {
  file: string
  loaded: number
  total: number
}

export interface TransformersRuntime {
  env: {
    allowLocalModels: boolean
    useBrowserCache: boolean
    backends: { onnx: { wasm?: Record<string, unknown> } }
  }
  Tensor: new (type: string, data: ArrayLike<number | bigint>, dims: number[]) => TensorLike
  AutoTokenizer: { from_pretrained(id: string, options?: Record<string, unknown>): Promise<TokenizerLike> }
  AutoModelForCausalLM: { from_pretrained(id: string, options?: Record<string, unknown>): Promise<CausalLmLike> }
}

export interface LoadedBrowserModel extends ReadoutModel {
  readonly device: BrowserBackend
  dispose(): Promise<void>
}

export interface LoadBrowserModelOptions {
  modelId: string
  /** The best backend this browser offers (webgpu.ts). */
  backend: BrowserBackend
  onProgress?: (event: ProgressEvent) => void
  /** transformers.js itself; injected by tests. */
  runtime?: () => Promise<TransformersRuntime>
  /** Where ORT-Web's .wasm/.mjs files are served; default `${BASE_URL}ort/`. */
  wasmPaths?: string
}

const defaultRuntime = async () => (await import('@huggingface/transformers')) as unknown as TransformersRuntime

const defaultWasmPaths = () => `${import.meta.env.BASE_URL ?? '/'}ort/`

/** IEEE 754 half → number. */
function halfToFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1
  const exp = (bits >> 10) & 0x1f
  const mant = bits & 0x3ff
  if (exp === 0) return sign * 2 ** -14 * (mant / 1024)
  if (exp === 0x1f) return mant ? NaN : sign * Infinity
  return sign * 2 ** (exp - 15) * (1 + mant / 1024)
}

function readLogit(tensor: TensorLike, index: number): number {
  const raw = Number(tensor.data[index])
  return tensor.type === 'float16' ? halfToFloat(raw) : raw
}

function disposeAll(outputs: Outputs | null): void {
  if (!outputs) return
  for (const tensor of Object.values(outputs)) if (tensor.location === 'gpu-buffer') tensor.dispose?.()
}

export async function loadBrowserModel(options: LoadBrowserModelOptions): Promise<LoadedBrowserModel> {
  const rt = await (options.runtime ?? defaultRuntime)()
  rt.env.allowLocalModels = false
  rt.env.useBrowserCache = true
  // ONNX Runtime's own env object: mutate it (replacing it would detach ORT from the setting).
  const ortWasm = (rt.env.backends.onnx.wasm ??= {})
  ortWasm.wasmPaths = options.wasmPaths ?? defaultWasmPaths()

  const progress_callback = (event: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (event.status !== 'progress' || typeof event.file !== 'string') return
    options.onProgress?.({ file: event.file, loaded: event.loaded ?? 0, total: event.total ?? 0 })
  }

  const tokenizer = await rt.AutoTokenizer.from_pretrained(options.modelId, { progress_callback })

  async function load(device: BrowserBackend): Promise<CausalLmLike> {
    return rt.AutoModelForCausalLM.from_pretrained(options.modelId, {
      device,
      dtype: DTYPE_BY_BACKEND[device],
      progress_callback,
    })
  }

  let device: BrowserBackend = options.backend
  let model: CausalLmLike
  try {
    model = await load(device)
  } catch (error) {
    if (device !== 'webgpu') throw error
    device = 'wasm'
    model = await load(device)
  }

  const int64 = (values: readonly number[]) => BigInt64Array.from(values, (v) => BigInt(v))
  const ones = (length: number) => new BigInt64Array(length).fill(1n)

  return {
    id: options.modelId,
    device,
    encode: (text) => tokenizer.encode(text, { add_special_tokens: false }),
    letterTokenIds(letters) {
      const ids = letters.map((letter) => tokenizer.encode(letter, { add_special_tokens: false }))
      return ids.every((t) => t.length === 1) ? ids.map((t) => t[0]) : []
    },
    async logitsAt(promptTokens, candidateTokenIds) {
      if (promptTokens.length === 0) throw new Error('logitsAt needs a non-empty prompt')
      let past: Outputs | null = null
      let result: number[] = []
      try {
        for (let start = 0; start < promptTokens.length; start += PREFILL_CHUNK) {
          const chunk = promptTokens.slice(start, start + PREFILL_CHUNK)
          const end = start + chunk.length
          const outputs: Outputs = await model({
            input_ids: new rt.Tensor('int64', int64(chunk), [1, chunk.length]),
            attention_mask: new rt.Tensor('int64', ones(end), [1, end]),
            ...(past ? { past_key_values: past } : {}),
          })
          const logits = outputs.logits
          if (end === promptTokens.length) {
            const vocab = logits.dims[2]
            const row = (chunk.length - 1) * vocab
            result = candidateTokenIds.map((id) => readLogit(logits, row + id))
          }
          logits.dispose?.()
          // Replaces the previous cache and frees its GPU buffers.
          past = model.getPastKeyValues(outputs, past)
        }
      } finally {
        disposeAll(past)
      }
      return result
    },
    async dispose() {
      await model.dispose()
    },
  }
}
