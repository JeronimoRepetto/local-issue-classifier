// @vitest-environment node
// ONNX Runtime Web's wasm + loader files (docs/browser-inference.md) are served
// by this app under /ort/, in dev and in the build, never from a CDN.
import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { ORT_BASE, ORT_FILES, ortAssets, ortDistDir } from '../../server/ortAssets'

describe('ortAssets', () => {
  it('names the JSEP (WebGPU + WASM) build that ships with @huggingface/transformers', () => {
    expect(ORT_BASE).toBe('ort')
    expect(ORT_FILES).toEqual(['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'])
    for (const file of ORT_FILES) expect(existsSync(`${ortDistDir()}/${file}`), file).toBe(true)
  })

  it('emits both files into the build under ort/', () => {
    const plugin = ortAssets()
    const emitFile = vi.fn()
    ;(plugin.generateBundle as unknown as (this: unknown) => void).call({ emitFile })
    expect(emitFile.mock.calls.map(([asset]) => asset.fileName)).toEqual(ORT_FILES.map((f) => `ort/${f}`))
    expect(emitFile.mock.calls.every(([asset]) => asset.type === 'asset' && asset.source.length > 0)).toBe(true)
  })

  it('serves them in dev with the right content types, and passes everything else on', () => {
    const plugin = ortAssets()
    let middleware!: (req: { url?: string }, res: unknown, next: () => void) => void
    ;(plugin.configureServer as unknown as (server: unknown) => void)({
      middlewares: { use: (fn: typeof middleware) => (middleware = fn) },
    })

    const respond = (url: string) => {
      const headers: Record<string, string> = {}
      const res = Object.assign(new EventEmitter(), {
        statusCode: 0,
        setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
        end: vi.fn(),
      })
      const next = vi.fn()
      middleware({ url }, res, next)
      return { headers, res, next }
    }

    const wasm = respond('/ort/ort-wasm-simd-threaded.jsep.wasm')
    expect(wasm.headers['content-type']).toBe('application/wasm')
    expect(wasm.res.end).toHaveBeenCalled()
    expect(respond('/ort/ort-wasm-simd-threaded.jsep.mjs?import').headers['content-type']).toBe('text/javascript')
    expect(respond('/ort/../package.json').next).toHaveBeenCalled()
    expect(respond('/src/main.ts').next).toHaveBeenCalled()
  })
})
