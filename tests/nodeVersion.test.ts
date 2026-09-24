// Node version pins (regression, 2026-09-25). The first Cloudflare Pages build
// failed because `.node-version` pinned Node 20 while pnpm 11 requires Node
// >= 22.13 (it imports `node:sqlite`, absent from Node 20). Every place that
// chooses a Node version must agree and satisfy pnpm's minimum.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const PINNED_MAJOR = 24
const PNPM_11_MIN_NODE = '22.13'

describe('Node version pins', () => {
  it('pins .node-version (read by Cloudflare Pages) to the supported major', () => {
    expect(read('.node-version').trim()).toBe(String(PINNED_MAJOR))
  })

  it('declares an engines.node floor that pnpm 11 can actually run on', () => {
    const pkg = JSON.parse(read('package.json')) as {
      engines: { node: string }
      packageManager: string
    }
    expect(pkg.packageManager).toMatch(/^pnpm@11\./)
    expect(pkg.engines.node).toBe(`>=${PNPM_11_MIN_NODE}`)
  })

  it('documents the same minimum in the README badge and requirements', () => {
    const readme = read('README.md')
    expect(readme).toContain('node-%3E%3D22.13')
    expect(readme).toContain('Node.js 22.13 or newer')
    expect(readme).not.toMatch(/Node\.js 20 or newer/)
  })
})
