#!/usr/bin/env node
// Social link-preview image task (GitHub issue #3, docs/architecture.md "Link preview").
// Rasterizes design/og/og-image.svg into public/og-image.png at exactly 1200x630.
//
// No image-processing dependency is added for this: the source has real text (a title,
// a tagline, three fake issue rows), not a simple monochrome pixel grid, so it cannot reuse
// scripts/build-favicon-png.mjs's hand-rolled row-run rasterizer (that parser only
// understands one-color pixel-art paths). Instead this reuses the OTHER rasterization
// approach already in this repo: scripts/browser-smoke.mjs's pattern of driving a locally
// installed, already-required Chromium (Edge or Chrome) headlessly over raw DevTools
// Protocol WebSocket messages, with no npm dependency at all. A real browser lays out real
// text with real font metrics, so this is also the only realistic way to get correct glyph
// shapes and kerning without a font-rasterization library. The two @fontsource-variable
// packages already in package.json are read directly (as woff2 bytes, base64-embedded into
// the page as `data:` URIs) so the render never depends on a font being installed on the
// machine that runs this script, and never fetches anything over the network.
//
// If a headless Chromium is ever not an acceptable requirement here, the alternatives are:
// a WASM SVG rasterizer (e.g. `resvg-js`), or a native one (`sharp`/`@napi-rs/canvas`) — all
// of them new dependencies with prebuilt native/WASM binaries, unlike anything else this
// project depends on.
//
// Run with `pnpm og-image`; the PNG output is committed, same convention as `pnpm favicons`
// and `pnpm icons`.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SVG_PATH = join(ROOT, 'design/og/og-image.svg')
export const OUT_PATH = join(ROOT, 'public/og-image.png')
export const WIDTH = 1200
export const HEIGHT = 630

const FONT_FILES = {
  sans: join(ROOT, 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'),
  mono: join(ROOT, 'node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2'),
}

/** A `data:` URI for a woff2 buffer, embeddable directly in an @font-face `src`. */
export function woff2DataUri(buffer) {
  return `data:font/woff2;base64,${buffer.toString('base64')}`
}

const FONTS_MARKER = '<style id="fonts"></style>'

/**
 * Replaces the source SVG's empty `<style id="fonts">` placeholder with real @font-face
 * rules pointing at the given `data:` URIs, so the page never needs a network font or a
 * system-installed one. Throws if the marker is missing (source was edited unexpectedly).
 */
export function embedFonts(svgSource, { sansDataUri, monoDataUri }) {
  if (!svgSource.includes(FONTS_MARKER)) {
    throw new Error(`og-image.svg: missing the ${FONTS_MARKER} marker the build script fills in`)
  }
  const css = [
    "@font-face { font-family: 'Geist Variable'; font-weight: 100 900; font-display: block;",
    `  src: url("${sansDataUri}") format('woff2-variations'); }`,
    "@font-face { font-family: 'Geist Mono Variable'; font-weight: 100 900; font-display: block;",
    `  src: url("${monoDataUri}") format('woff2-variations'); }`,
  ].join('\n')
  return svgSource.replace(FONTS_MARKER, `<style id="fonts">${css}</style>`)
}

/** Wraps the (fonts-embedded) SVG markup in a minimal HTML page pinned to exactly WxH px. */
export function wrapHtml(svgMarkup, { width = WIDTH, height = HEIGHT } = {}) {
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><style>',
    `html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:#09090B;}`,
    'svg{display:block;}',
    '</style></head><body>',
    svgMarkup,
    '</body></html>',
  ].join('\n')
}

/** Converts an absolute filesystem path to a `file://` URL (POSIX and Windows-safe). */
export function toFileUrl(absPath) {
  return new URL(`file:///${absPath.split('\\').join('/').replace(/^\/+/, '')}`).href
}

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

/** First candidate path that exists, per `existsFn` (injected so this is unit-testable). */
export function findBrowserPath(candidates = CANDIDATES, existsFn = existsSync) {
  return candidates.find((path) => existsFn(path))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function killTree(pid) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

async function findPageTarget(port, urlPrefix) {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith(urlPrefix))
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Not listening yet.
    }
    await sleep(250)
  }
  throw new Error('The browser never exposed the page over DevTools')
}

/** A tiny DevTools Protocol client: `call(method, params)` resolves with `result`. */
function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    pending.get(message.id)?.(message)
    pending.delete(message.id)
  })
  const opened = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  return {
    async call(method, params = {}) {
      await opened
      const callId = ++id
      const answer = new Promise((res) => pending.set(callId, res))
      ws.send(JSON.stringify({ id: callId, method, params }))
      const message = await answer
      if (message.error) throw new Error(`${method}: ${message.error.message}`)
      return message.result
    },
    close: () => ws.close(),
  }
}

/** Builds the final, fonts-embedded HTML page from the committed SVG source. */
export function buildPage({ rootDir = ROOT } = {}) {
  const svg = readFileSync(join(rootDir, 'design/og/og-image.svg'), 'utf8')
  const sansDataUri = woff2DataUri(readFileSync(FONT_FILES.sans))
  const monoDataUri = woff2DataUri(readFileSync(FONT_FILES.mono))
  return wrapHtml(embedFonts(svg, { sansDataUri, monoDataUri }))
}

/** Launches headless Chromium, screenshots `html` at WIDTHxHEIGHT, and returns the PNG bytes. */
async function screenshotHtml(html, { browser = findBrowserPath() } = {}) {
  if (!browser) {
    throw new Error(
      'No local Chromium found (checked BROWSER_PATH, Edge, Chrome). Pass --browser <path>.',
    )
  }
  const workDir = mkdtempSync(join(tmpdir(), 'lic-og-image-'))
  const htmlPath = join(workDir, 'page.html')
  writeFileSync(htmlPath, html)
  const url = toFileUrl(htmlPath)
  const port = 9334
  const profile = join(workDir, 'profile')

  const child = spawn(
    browser,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`,
      url,
    ],
    { stdio: 'ignore', detached: process.platform !== 'win32' },
  )

  try {
    const wsUrl = await findPageTarget(port, url.split('#')[0])
    const cdp = connectCdp(wsUrl)
    // Data-URI @font-face still needs a tick to shape; wait for the real signal instead of a
    // fixed delay.
    await cdp.call('Runtime.evaluate', {
      expression: '(async () => { await document.fonts.ready; return true })()',
      awaitPromise: true,
      returnByValue: true,
    })
    const shot = await cdp.call('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
      captureBeyondViewport: true,
    })
    cdp.close()
    return Buffer.from(shot.data, 'base64')
  } finally {
    killTree(child.pid)
    // Best-effort: on Windows, a just-killed Chrome can hold its profile directory's files
    // locked for a moment after taskkill returns, which would otherwise mask the real result
    // (a screenshot Buffer) behind a spurious cleanup error. The OS temp directory is reaped
    // independently, so a leftover folder here is not a correctness problem.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        rmSync(workDir, { recursive: true, force: true })
        break
      } catch {
        await sleep(200)
      }
    }
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const html = buildPage({ rootDir: ROOT })
  const png = await screenshotHtml(html)
  writeFileSync(OUT_PATH, png)
  console.log(`wrote public/og-image.png (${(png.length / 1024).toFixed(1)} KB)`)
}
