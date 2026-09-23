// Types for scripts/build-icons.mjs, so tests can import it under strict TypeScript.
export declare const SOURCE_DIRS: string[]
export declare const OUT_DIR: string

export interface NormalizedSvg {
  viewBox: string
  inner: string
}

export declare function componentName(fileName: string): string
export declare function normalizeSvg(source: string): NormalizedSvg
export declare function renderIconComponent(icon: NormalizedSvg & { source: string }): string
export declare function buildIcons(options: {
  rootDir: string
  outDir?: string
  sourceDirs?: string[]
}): string[]
