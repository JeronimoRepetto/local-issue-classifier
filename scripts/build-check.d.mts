// Types for scripts/build-check.mjs, so tests can import it under strict TypeScript.
export interface DistCheckFinding {
  rule: 'missing-required-file' | 'missing-required-dir' | 'forbidden-entry'
  path: string
  message: string
}

export declare const REQUIRED_DIST_FILES: string[]
export declare const REQUIRED_DIST_DIRS: string[]

export declare function checkDistEntries(entries: string[]): DistCheckFinding[]
export declare function listDistEntries(dir: string): string[]
export declare function runBuild(repoRoot: string): boolean
export declare function main(repoRoot?: string): number
