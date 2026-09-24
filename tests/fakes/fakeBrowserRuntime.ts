// A fake in-browser runtime for useProvider (docs/browser-inference.md): no
// transformers.js, no Cache API, no WebGPU. The model answers every letter
// logit with 0, so every readout is a uniform distribution.
import { vi } from 'vitest'
import type { BrowserRuntime } from '../../src/composables/useProvider'
import type { BrowserSupport } from '../../src/adapters/browser/webgpu'

export function fakeBrowserRuntime(options: { support?: BrowserSupport; cachedBytes?: number } = {}) {
  let cached = options.cachedBytes ?? 0
  const runtime = {
    detectSupport: vi.fn(async () => options.support ?? 'webgpu'),
    loadModel: vi.fn(async (opts) => {
      cached = 578_917_626
      return {
        id: opts.modelId,
        device: opts.backend,
        encode: () => [1],
        letterTokenIds: (letters: readonly string[]) => letters.map((_, i) => i),
        logitsAt: async (_t: readonly number[], ids: readonly number[]) => ids.map(() => 0),
        dispose: async () => {},
      }
    }),
    cachedBytes: vi.fn(async () => cached),
    removeCached: vi.fn(async () => {
      cached = 0
      return 1
    }),
  } satisfies BrowserRuntime
  return runtime
}
