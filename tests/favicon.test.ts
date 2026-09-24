// Web icon task. Exercises the dependency-free PNG generator
// (scripts/build-favicon-png.mjs) against tiny fixtures, then asserts the
// committed public/ assets exist, stay pixel-faithful to
// design/icons/pixel/logo.svg (the wordmark's mark, per docs/design.md
// "Icon source decision"), and are wired into index.html and
// site.webmanifest. No image-processing dependency is added: PNGs are
// hand-encoded from the logo's own monochrome pixel grid.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bitmapFromLogoSvg,
  buildFaviconSvg,
  encodePng,
  rasterize,
  readPngSize,
} from '../scripts/build-favicon-png.mjs'
import { tokens } from '../src/ui/tokens'

const ROOT = join(__dirname, '..')
const PUBLIC_DIR = join(ROOT, 'public')
const LOGO_SVG = readFileSync(join(ROOT, 'design/icons/pixel/logo.svg'), 'utf8')

describe('bitmapFromLogoSvg', () => {
  it('parses a tiny row-run path into a 0/1 grid', () => {
    const svg = '<svg viewBox="0 0 4 4"><path d="M0 0h4v1h-4zM1 2h2v1h-2z"/></svg>'
    expect(bitmapFromLogoSvg(svg)).toEqual([
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ])
  })

  it('matches the committed logo pixel-for-pixel (16x16 monogram, framed)', () => {
    const grid = bitmapFromLogoSvg(LOGO_SVG)
    expect(grid).toHaveLength(16)
    expect(grid.every((row) => row.length === 16)).toBe(true)
    expect(grid[0].join('')).toBe('0111111111111110')
    expect(grid[15].join('')).toBe('0111111111111110')
  })

  it('refuses a non-square viewBox', () => {
    expect(() => bitmapFromLogoSvg('<svg viewBox="0 0 4 8"><path d="M0 0h4v1h-4z"/></svg>')).toThrow(
      /square/,
    )
  })
})

describe('rasterize + encodePng', () => {
  it('upscales without antialiasing, centers with transparent padding, and round-trips through the PNG encoder', () => {
    const grid = [
      [1, 0],
      [0, 1],
    ]
    const rgba = rasterize(grid, { scale: 2, canvas: 6 })
    // pad = floor((6 - 4) / 2) = 1: corner (0,0) of the canvas stays transparent padding.
    expect(rgba[3]).toBe(0)
    const png = encodePng(6, 6, rgba)
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(readPngSize(png)).toEqual({ width: 6, height: 6 })
  })

  it('rejects a canvas smaller than the drawn (scaled) size', () => {
    expect(() => rasterize([[1]], { scale: 4, canvas: 2 })).toThrow()
  })
})

describe('buildFaviconSvg', () => {
  it('adds shape-rendering="crispEdges" to the logo svg root, keeping the artwork', () => {
    const out = buildFaviconSvg(LOGO_SVG)
    expect(out).toContain('shape-rendering="crispEdges"')
    expect(out).toContain('viewBox="0 0 16 16"')
    expect(bitmapFromLogoSvg(out)).toEqual(bitmapFromLogoSvg(LOGO_SVG))
  })
})

describe('public/ icon assets (committed output — run `pnpm favicons` if this fails)', () => {
  it('favicon.svg is the crisp pixel logo', () => {
    const svg = readFileSync(join(PUBLIC_DIR, 'favicon.svg'), 'utf8')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(bitmapFromLogoSvg(svg)).toEqual(bitmapFromLogoSvg(LOGO_SVG))
  })

  it('favicon-32.png and apple-touch-icon.png exist with the right pixel dimensions', () => {
    const favicon32 = readFileSync(join(PUBLIC_DIR, 'favicon-32.png'))
    const appleTouch = readFileSync(join(PUBLIC_DIR, 'apple-touch-icon.png'))
    expect(readPngSize(favicon32)).toEqual({ width: 32, height: 32 })
    expect(readPngSize(appleTouch)).toEqual({ width: 180, height: 180 })
  })

  it('site.webmanifest names the app and uses the light-theme accent/background', () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'site.webmanifest'), 'utf8'))
    expect(manifest.name).toBe('local-issue-classifier')
    expect(manifest.theme_color).toBe(tokens.color.light.accent)
    expect(manifest.background_color).toBe(tokens.color.light.bg)
    const srcs = manifest.icons.map((i: { src: string }) => i.src)
    expect(srcs).toContain('/favicon.svg')
    expect(srcs).toContain('/favicon-32.png')
  })
})

describe('index.html', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8')

  it('links the SVG favicon, a PNG fallback, the apple touch icon and the manifest', () => {
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" ?\/?>/)
    expect(html).toMatch(
      /<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32\.png" ?\/?>/,
    )
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" ?\/?>/)
    expect(html).toMatch(/<link rel="manifest" href="\/site\.webmanifest" ?\/?>/)
  })

  it('keeps the Content-Security-Policy meta tag intact', () => {
    expect(html).toContain("default-src 'self'")
    expect(html).toContain("img-src 'self' data: https://avatars.githubusercontent.com")
    expect(html).toContain("style-src 'self' 'unsafe-inline'")
  })
})
