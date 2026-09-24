// Types for scripts/build-og-image.mjs, so tests can import it under strict TypeScript.
export declare const SVG_PATH: string
export declare const OUT_PATH: string
export declare const WIDTH: number
export declare const HEIGHT: number

export declare function woff2DataUri(buffer: Buffer): string
export declare function embedFonts(
  svgSource: string,
  fonts: { sansDataUri: string; monoDataUri: string },
): string
export declare function wrapHtml(
  svgMarkup: string,
  options?: { width?: number; height?: number },
): string
export declare function toFileUrl(absPath: string): string
export declare function findBrowserPath(
  candidates?: (string | undefined)[],
  existsFn?: (path: string) => boolean,
): string | undefined
export declare function buildPage(options?: { rootDir?: string }): string
