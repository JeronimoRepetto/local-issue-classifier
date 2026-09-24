// wrangler.jsonc — Cloudflare Pages build configuration (docs/architecture.md
// "Deployment modes"). JSONC allows comments, so this is parsed by stripping
// them rather than with JSON.parse; a real JSONC parser would give more
// general coverage, but this file's own comments are simple line/block
// comments outside of any string, so a small hand-rolled strip is enough
// (the same tradeoff tests/ciWorkflow.test.ts makes for YAML).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const SOURCE = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')

function stripJsonc(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const config = JSON.parse(stripJsonc(SOURCE))

describe('wrangler.jsonc', () => {
  it('parses as valid JSON once comments are stripped', () => {
    expect(typeof config).toBe('object')
  })

  it('points the Pages build output at dist/, matching Vite (no custom outDir)', () => {
    expect(config.pages_build_output_dir).toBe('dist')
  })

  it('pins a compatibility_date in yyyy-mm-dd form', () => {
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('names the Pages project', () => {
    expect(typeof config.name).toBe('string')
    expect(config.name.length).toBeGreaterThan(0)
  })

  // Regression (2026-09-25): with a Wrangler file present, Cloudflare Pages
  // ignores variables set in the dashboard ("your Wrangler file is the source
  // of truth"), so the first deploy's /jev Function failed closed with
  // "ALLOWED_ORIGINS not configured". The allowlist must live here.
  describe('ALLOWED_ORIGINS for the /jev Function', () => {
    const origins = (vars: Record<string, string> | undefined) =>
      (vars?.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim())
    const expected = ['https://issueclassifier.com', `https://${config.name}.pages.dev`]

    it('allows the custom domain and the project pages.dev alias in production', () => {
      expect(origins(config.vars)).toEqual(expected)
    })

    it('redefines the same allowlist for preview, since vars are not inherited', () => {
      expect(origins(config.env?.preview?.vars)).toEqual(expected)
    })

    it('declares no secret-looking variables (the file is public)', () => {
      const allowed = ['ALLOWED_ORIGINS', 'JEV_UPSTREAM_URL']
      for (const vars of [config.vars, config.env?.preview?.vars]) {
        for (const key of Object.keys(vars ?? {})) expect(allowed).toContain(key)
      }
    })
  })

  it('does not enable nodejs_compat: the Pages Function uses only standard fetch APIs', () => {
    const fn = readFileSync(join(ROOT, 'functions', 'jev', '[[path]].ts'), 'utf8')
    expect(fn).not.toMatch(/from ['"]node:/)
    expect(config.compatibility_flags).toBeUndefined()
  })
})
