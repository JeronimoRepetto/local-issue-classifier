// Types for scripts/build-favicon-png.mjs, so tests can import it under strict TypeScript.
export type PixelGrid = number[][]

export declare function bitmapFromLogoSvg(source: string): PixelGrid
export declare function rasterize(
  grid: PixelGrid,
  options: { scale: number; canvas: number },
): Uint8Array
export declare function encodePng(width: number, height: number, rgba: Uint8Array): Buffer
export declare function readPngSize(buffer: Buffer): { width: number; height: number }
export declare function buildFaviconSvg(source: string): string
export declare function buildFavicons(options?: { rootDir?: string }): {
  faviconSvg: string
  favicon32: Buffer
  appleTouch: Buffer
}
