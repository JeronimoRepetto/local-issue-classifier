// Types for scripts/check-hygiene.mjs, so tests can import it under strict TypeScript.
export interface HygieneFile {
  path: string
  content: string | null
}

export interface HygieneFinding {
  rule: string
  path: string
  message: string
}

export declare function findTrackedEnvFiles(paths: string[]): HygieneFinding[]
export declare function findTokenLikeStrings(files: HygieneFile[]): HygieneFinding[]
export declare function isFixtureOrDoc(path: string): boolean
export declare function findPersonalData(
  files: HygieneFile[],
  options?: { scope?: (path: string) => boolean },
): HygieneFinding[]
export declare function findStrayStreamlineAssets(paths: string[]): HygieneFinding[]
export declare function runHygieneChecks(files: HygieneFile[]): HygieneFinding[]
export declare function loadTrackedFiles(repoRoot: string): HygieneFile[]
export declare function main(repoRoot?: string): number
