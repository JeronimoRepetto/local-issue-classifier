// local-issue-classifier — which in-browser backend this browser offers
// (docs/browser-inference.md). Passive: it asks for a WebGPU adapter and
// checks that WebAssembly exists; it never runs a benchmark.

/** webgpu: fast path; wasm: works, but slow on CPU; none: cannot run a model at all. */
export type BrowserSupport = 'webgpu' | 'wasm' | 'none'

export interface BrowserSupportProbe {
  gpu: { requestAdapter(): Promise<unknown> } | undefined
  wasm: boolean
}

function currentProbe(): BrowserSupportProbe {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { gpu?: BrowserSupportProbe['gpu'] })
  return { gpu: nav?.gpu, wasm: typeof WebAssembly === 'object' }
}

export async function detectBrowserSupport(probe: BrowserSupportProbe = currentProbe()): Promise<BrowserSupport> {
  if (probe.gpu) {
    try {
      if (await probe.gpu.requestAdapter()) return 'webgpu'
    } catch {
      // No adapter for this page (blocklisted GPU, headless, policy): fall through.
    }
  }
  return probe.wasm ? 'wasm' : 'none'
}
