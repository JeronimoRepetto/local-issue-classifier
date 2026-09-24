// `pnpm build:check` (scripts/build-check.mjs): after `pnpm build`, asserts
// dist/ has everything the Cloudflare Pages deployment needs (index.html,
// _headers, the ort/ and launchers/ asset trees) and nothing it must never
// ship (functions/ — Pages picks that up from the repo root, never from
// dist/ — and any .onnx model weight). The pure tree-check function below is
// exercised against tiny fake trees; `main()` itself (which runs the real
// `pnpm build` and walks the real dist/) is exercised by `pnpm build:check`
// as part of this repo's own CI (.github/workflows/ci.yml), not by a unit test.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkDistEntries,
  listDistEntries,
  REQUIRED_DIST_DIRS,
  REQUIRED_DIST_FILES,
} from '../scripts/build-check.mjs'

describe('REQUIRED_DIST_FILES / REQUIRED_DIST_DIRS', () => {
  it('names what a Cloudflare Pages deployment of this app needs', () => {
    expect(REQUIRED_DIST_FILES).toEqual(['index.html', '_headers', 'og-image.png'])
    expect(REQUIRED_DIST_DIRS).toEqual(['ort', 'launchers'])
  })
})

describe('checkDistEntries', () => {
  const CLEAN_TREE = [
    'index.html',
    '_headers',
    'og-image.png',
    'assets/index-abc123.js',
    'ort/ort-wasm-simd-threaded.jsep.mjs',
    'ort/ort-wasm-simd-threaded.jsep.wasm',
    'launchers/start-kev.ps1',
    'launchers/start-kev.sh',
  ]

  it('passes a clean tree', () => {
    expect(checkDistEntries(CLEAN_TREE)).toEqual([])
  })

  it('fails when index.html is missing', () => {
    const findings = checkDistEntries(CLEAN_TREE.filter((e) => e !== 'index.html'))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'missing-required-file', path: 'index.html' })
  })

  it('fails when _headers is missing', () => {
    const findings = checkDistEntries(CLEAN_TREE.filter((e) => e !== '_headers'))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'missing-required-file', path: '_headers' })
  })

  it('fails when og-image.png is missing (the social link-preview image)', () => {
    const findings = checkDistEntries(CLEAN_TREE.filter((e) => e !== 'og-image.png'))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'missing-required-file', path: 'og-image.png' })
  })

  it('fails when the ort/ tree is empty', () => {
    const findings = checkDistEntries(CLEAN_TREE.filter((e) => !e.startsWith('ort/')))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'missing-required-dir', path: 'ort' })
  })

  it('fails when the launchers/ tree is empty', () => {
    const findings = checkDistEntries(CLEAN_TREE.filter((e) => !e.startsWith('launchers/')))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'missing-required-dir', path: 'launchers' })
  })

  it('fails when functions/ leaked into the build output', () => {
    const findings = checkDistEntries([...CLEAN_TREE, 'functions/jev/[[path]].js'])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'forbidden-entry', path: 'functions/jev/[[path]].js' })
  })

  it('fails when a .onnx model weight leaked into the build output', () => {
    const findings = checkDistEntries([...CLEAN_TREE, 'ort/model_q4f16.onnx'])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: 'forbidden-entry', path: 'ort/model_q4f16.onnx' })
  })

  it('reports every violation at once on a doubly-broken tree', () => {
    const findings = checkDistEntries(['functions/jev/[[path]].js', 'weights.onnx'])
    const rules = findings.map((f) => f.rule).sort()
    expect(rules).toEqual(
      [
        'missing-required-file', // index.html
        'missing-required-file', // _headers
        'missing-required-file', // og-image.png
        'missing-required-dir', // ort
        'missing-required-dir', // launchers
        'forbidden-entry', // functions/
        'forbidden-entry', // .onnx
      ].sort(),
    )
  })
})

describe('listDistEntries', () => {
  it('walks a real directory tree and returns posix-style relative paths, sorted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'build-check-'))
    try {
      mkdirSync(join(dir, 'ort'), { recursive: true })
      writeFileSync(join(dir, 'index.html'), '<!doctype html>')
      writeFileSync(join(dir, '_headers'), '/*\n')
      writeFileSync(join(dir, 'ort', 'ort-wasm-simd-threaded.jsep.wasm'), 'x')
      expect(listDistEntries(dir)).toEqual(['_headers', 'index.html', 'ort/ort-wasm-simd-threaded.jsep.wasm'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
