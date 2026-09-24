// ONNX Runtime Web's runtime files for the in-browser provider (docs/browser-inference.md).
//
// transformers.js v3 loads ORT-Web's WebAssembly binary and its ES-module
// loader at run time, from `env.backends.onnx.wasm.wasmPaths` — a jsDelivr URL
// by default. This app serves its own copies instead, so no code comes from a
// CDN and the CSP can keep `script-src 'self'`: the two files of the JSEP build
// (WebGPU + WASM in one binary) that ship inside @huggingface/transformers/dist
// are served under /ort/ by the dev server and emitted to dist/ort/ by the build.
// browserModel.ts points wasmPaths at `${BASE_URL}ort/`.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export const ORT_BASE = 'ort'
export const ORT_FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'] as const

const CONTENT_TYPES: Record<string, string> = { '.mjs': 'text/javascript', '.wasm': 'application/wasm' }

/** node_modules/@huggingface/transformers/dist of this checkout. */
export function ortDistDir(): string {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  return join(root, 'node_modules', '@huggingface', 'transformers', 'dist')
}

export function ortAssets(): Plugin {
  const dist = ortDistDir()
  return {
    name: 'local-issue-classifier:ort-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        const file = ORT_FILES.find((f) => path === `/${ORT_BASE}/${f}`)
        if (!file) return next()
        res.statusCode = 200
        res.setHeader('content-type', CONTENT_TYPES[file.slice(file.lastIndexOf('.'))])
        res.end(readFileSync(join(dist, file)))
      })
    },
    generateBundle() {
      for (const file of ORT_FILES) {
        this.emitFile({ type: 'asset', fileName: `${ORT_BASE}/${file}`, source: readFileSync(join(dist, file)) })
      }
    },
  }
}
