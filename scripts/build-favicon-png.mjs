#!/usr/bin/env node
// Web icon task. Dependency-free PNG generator for the site icons: parses
// design/icons/pixel/logo.svg's monochrome row-run path into a pixel grid and
// rasterizes it (nearest-neighbour, no antialiasing) to PNG using only Node
// built-ins — node:zlib for the IDAT deflate stream and a hand-rolled CRC32
// for chunk checksums — so no image-processing package is added to the
// project. Also derives public/favicon.svg (same artwork, `crispEdges`
// added) from the same source. Run with `pnpm favicons`; the output is
// committed, same convention as `pnpm icons` (scripts/build-icons.mjs).
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOGO_SVG_PATH = join(ROOT, 'design/icons/pixel/logo.svg')

/**
 * Parses a logo SVG's single `<path d="M{x} {y}h{w}v1h-{w}z..." />` (one
 * `Mx yh<w>v1h-<w>z` run per filled row-segment, as emitted by pixel-art
 * export tools) into an `n`×`n` grid of 0/1 cells.
 */
export function bitmapFromLogoSvg(source) {
  const dMatch = source.match(/<path[^>]*\bd="([^"]+)"/)
  const viewBoxMatch = source.match(/viewBox="0 0 (\d+) (\d+)"/)
  if (!dMatch) throw new Error('logo.svg: missing a <path d="..."> to parse')
  if (!viewBoxMatch) throw new Error('logo.svg: missing a "0 0 W H" viewBox')
  const width = Number(viewBoxMatch[1])
  const height = Number(viewBoxMatch[2])
  if (width !== height) throw new Error('logo.svg: expected a square viewBox')

  const grid = Array.from({ length: height }, () => new Array(width).fill(0))
  const re = /M(\d+) (\d+)h(\d+)v1h-\3z/g
  let match
  while ((match = re.exec(dMatch[1]))) {
    const x = Number(match[1])
    const y = Number(match[2])
    const run = Number(match[3])
    for (let i = 0; i < run; i++) grid[y][x + i] = 1
  }
  return grid
}

/**
 * Nearest-neighbour upscale of a 0/1 grid into a black-on-transparent RGBA
 * buffer, centered inside a `canvas`×`canvas` px square (extra space, when
 * `canvas` isn't an exact multiple of the grid, becomes transparent padding
 * so every filled pixel still renders as one crisp, un-antialiased square).
 */
export function rasterize(grid, { scale, canvas }) {
  const size = grid.length
  const drawn = size * scale
  const pad = Math.floor((canvas - drawn) / 2)
  if (pad < 0) throw new Error(`canvas ${canvas}px is smaller than the drawn size ${drawn}px`)
  const rgba = new Uint8Array(canvas * canvas * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!grid[y][x]) continue
      for (let dy = 0; dy < scale; dy++) {
        const py = pad + y * scale + dy
        for (let dx = 0; dx < scale; dx++) {
          const px = pad + x * scale + dx
          const i = (py * canvas + px) * 4
          rgba[i] = 0
          rgba[i + 1] = 0
          rgba[i + 2] = 0
          rgba[i + 3] = 255
        }
      }
    }
  }
  return rgba
}

let crcTable
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/** Encodes an 8-bit RGBA buffer (row-major, no filtering) as a PNG. */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: truecolor with alpha (RGBA)
  ihdr[10] = 0 // compression method
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // interlace method

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  const rgbaBuf = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type: none
    rgbaBuf.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw)

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** Reads back a PNG's pixel dimensions from its IHDR chunk (used by tests, no decoder needed). */
export function readPngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/** Adds `shape-rendering="crispEdges"` to the logo SVG's root element, keeping everything else. */
export function buildFaviconSvg(source) {
  if (!/<svg\b/.test(source)) throw new Error('logo.svg: missing an <svg> root')
  if (/shape-rendering=/.test(source)) return source
  return source.replace(/<svg\b/, '<svg shape-rendering="crispEdges"')
}

/** Builds the favicon SVG and both raster sizes from the committed logo source. */
export function buildFavicons({ rootDir = ROOT } = {}) {
  const svg = readFileSync(join(rootDir, 'design/icons/pixel/logo.svg'), 'utf8')
  const grid = bitmapFromLogoSvg(svg)
  return {
    faviconSvg: buildFaviconSvg(svg),
    // Exact 2x integer scale: no padding needed at 32px.
    favicon32: encodePng(32, 32, rasterize(grid, { scale: 2, canvas: 32 })),
    // 11x integer scale (176px) centered in Apple's 180px canvas: a 2px
    // transparent margin on every side, rather than a non-integer scale that
    // would antialias the pixel art.
    appleTouch: encodePng(180, 180, rasterize(grid, { scale: 11, canvas: 180 })),
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { faviconSvg, favicon32, appleTouch } = buildFavicons({ rootDir: ROOT })
  writeFileSync(join(ROOT, 'public/favicon.svg'), faviconSvg)
  writeFileSync(join(ROOT, 'public/favicon-32.png'), favicon32)
  writeFileSync(join(ROOT, 'public/apple-touch-icon.png'), appleTouch)
  console.log('wrote public/favicon.svg, public/favicon-32.png, public/apple-touch-icon.png')
  console.log(`(source: ${LOGO_SVG_PATH})`)
}
