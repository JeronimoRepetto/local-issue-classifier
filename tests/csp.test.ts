// The Content-Security-Policy in index.html, for the in-browser provider
// (docs/browser-inference.md): model files may come from the Hugging Face Hub
// and its download CDN; code only from this app, with WebAssembly compilation
// allowed and nothing else loosened.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
const directive = (name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
    ?.split(/\s+/)
    .slice(1) ?? []

describe('Content-Security-Policy', () => {
  it('lets the model download reach the Hub and its CDN hosts', () => {
    const connect = directive('connect-src')
    expect(connect).toEqual(expect.arrayContaining(['https://huggingface.co', 'https://*.hf.co', 'https://cdn-lfs.huggingface.co']))
  })

  it("allows WebAssembly compilation, but scripts only from 'self'", () => {
    expect(directive('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"])
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).not.toMatch(/jsdelivr|unpkg|cdnjs/)
  })

  it('keeps the existing sources', () => {
    expect(directive('connect-src')).toEqual(
      expect.arrayContaining(["'self'", 'https://api.github.com', 'http://localhost:*', 'http://127.0.0.1:*', 'http://[::1]:*']),
    )
    expect(directive('default-src')).toEqual(["'self'"])
  })

  it('is the same policy on the one-off smoke page', () => {
    const smoke = readFileSync(join(__dirname, '..', 'scripts', 'browser-smoke', 'index.html'), 'utf8')
    expect(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(smoke)?.[1]).toBe(csp)
  })
})
