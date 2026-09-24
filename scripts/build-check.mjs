#!/usr/bin/env node
// local-issue-classifier — Cloudflare Pages build-output checker.
//
// Runs `pnpm build`, then walks the real dist/ tree and asserts it has
// everything the Pages deployment needs (index.html, _headers, the ort/ and
// launchers/ asset trees emitted by server/ortAssets.ts and
// server/launcherAssets.ts) and nothing it must never ship: functions/ (Pages
// reads that from the repo root, never from dist/; see docs/architecture.md)
// or any .onnx model weight (those are downloaded by the browser at run
// time, never bundled — docs/browser-inference.md). Exported functions
// operate on a plain in-memory file list, so tests can exercise them with
// tiny fake trees; `main()` wires them to a real build and `dist/` for
// CLI/CI use (`pnpm build:check`).
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const REQUIRED_DIST_FILES = ['index.html', '_headers']
export const REQUIRED_DIST_DIRS = ['ort', 'launchers']
// functions/ is not a build artifact: Cloudflare Pages picks it up from the
// repository root directly, alongside (not from) the build output directory.
const FORBIDDEN_DIST_PREFIXES = ['functions/']
const FORBIDDEN_DIST_EXTENSIONS = ['.onnx', '.onnx_data']

export function checkDistEntries(entries) {
  const findings = []

  for (const file of REQUIRED_DIST_FILES) {
    if (!entries.includes(file)) {
      findings.push({ rule: 'missing-required-file', path: file, message: `dist/ is missing required file "${file}".` })
    }
  }

  for (const dir of REQUIRED_DIST_DIRS) {
    const prefix = `${dir}/`
    if (!entries.some((e) => e.startsWith(prefix))) {
      findings.push({ rule: 'missing-required-dir', path: dir, message: `dist/${dir}/ has no files; it must ship with the build.` })
    }
  }

  for (const entry of entries) {
    const lower = entry.toLowerCase()
    if (FORBIDDEN_DIST_PREFIXES.some((p) => entry.startsWith(p))) {
      findings.push({
        rule: 'forbidden-entry',
        path: entry,
        message: `dist/${entry} must not ship: functions/ belongs at the repo root, not in the build output.`,
      })
      continue
    }
    if (FORBIDDEN_DIST_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      findings.push({
        rule: 'forbidden-entry',
        path: entry,
        message: `dist/${entry} is a model weight file; it must be downloaded by the browser at run time, never bundled.`,
      })
    }
  }

  return findings
}

/** Every file under `dir`, recursively, as posix-style paths relative to `dir`, sorted. */
export function listDistEntries(dir) {
  const out = []
  const walk = (abs, prefix) => {
    for (const name of readdirSync(abs).sort()) {
      const childAbs = join(abs, name)
      const rel = prefix ? `${prefix}/${name}` : name
      if (statSync(childAbs).isDirectory()) {
        walk(childAbs, rel)
      } else {
        out.push(rel.split('\\').join('/'))
      }
    }
  }
  walk(dir, '')
  return out.sort()
}

/** Runs `pnpm build` in `repoRoot`, streaming its own output. Returns whether it succeeded. */
export function runBuild(repoRoot) {
  const result = spawnSync('pnpm build', { cwd: repoRoot, encoding: 'utf8', shell: true, stdio: 'inherit' })
  return result.status === 0 && !result.error
}

export function main(repoRoot = process.cwd()) {
  if (!runBuild(repoRoot)) {
    console.error('build:check: `pnpm build` failed; see output above.')
    return 1
  }

  const distDir = join(repoRoot, 'dist')
  if (!existsSync(distDir)) {
    console.error('build:check: dist/ does not exist after `pnpm build`.')
    return 1
  }

  const entries = listDistEntries(distDir)
  const findings = checkDistEntries(entries)
  if (findings.length === 0) {
    console.log(`build:check: ok (${entries.length} files in dist/)`)
    return 0
  }

  console.error(`build:check: ${findings.length} failure(s):`)
  for (const f of findings) console.error(`  [${f.rule}] ${f.message}`)
  return 1
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..')
  process.exitCode = main(repoRoot)
}
