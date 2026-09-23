// Types for scripts/build-icons.mjs, so tests can import it under strict TypeScript.
/** `stroke`: 24-grid line icon at 16 px; `pixel`: crisp-edged pixel art at its grid size. */
export type IconMode = 'stroke' | 'pixel'

export interface IconSourceDir {
  dir: string
  mode: IconMode
}

export declare const SOURCE_DIRS: IconSourceDir[]
export declare const OUT_DIR: string

export interface NormalizedSvg {
  viewBox: string
  inner: string
}

export declare function componentName(fileName: string): string
export declare function normalizeSvg(source: string): NormalizedSvg
export declare function renderIconComponent(
  icon: NormalizedSvg & { source: string; mode?: IconMode },
): string
export declare function buildIcons(options: {
  rootDir: string
  outDir?: string
  sourceDirs?: IconSourceDir[]
}): string[]
