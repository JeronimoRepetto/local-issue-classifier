// Types for scripts/compare-batching.mjs, so tests can import it under strict TypeScript.
export interface HarnessTarget {
  baseUrl: string
  /** True for the TypeSafe cloud; a local server (JEV_BASE_URL) may run without a key. */
  keyRequired: boolean
  /** JEV_MODEL, else jev-latest; --model overrides it. */
  model: string
}

export declare function resolveTarget(env?: Record<string, string | undefined>): HarnessTarget
