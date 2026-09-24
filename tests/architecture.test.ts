// Enforces the SPEC.md §7.2 dependency-direction rules by scanning source
// files directly, so a future task cannot introduce a forbidden import
// without this test turning red.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const SRC_ROOT = join(__dirname, '..', 'src')

function listSourceFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...listSourceFiles(full))
      continue
    }
    if (extname(full) === '.ts' || extname(full) === '.vue') {
      files.push(full)
    }
  }
  return files
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  // Matches `import ... from '...'`, `export ... from '...'` and dynamic `import('...')`.
  const re =
    /\b(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    specifiers.push(match[1] ?? match[2])
  }
  return specifiers
}

describe('architecture import rules (SPEC.md §7.2)', () => {
  it('src/components/ui does not import adapters', () => {
    const files = listSourceFiles(join(SRC_ROOT, 'components', 'ui'))
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const spec of importSpecifiers(source)) {
        expect(spec, `${relative(SRC_ROOT, file)} imports "${spec}"`).not.toMatch(/adapters/)
      }
    }
  })

  it('src/domain imports nothing outside itself (no Vue, no adapters, no browser APIs)', () => {
    // Co-located domain tests (src/domain/*.test.ts, allowed by SPEC.md §7.1)
    // are the verification harness, not the domain module itself, so they
    // alone may additionally import the test runner. Production domain
    // files, and any other import in a test file, still must be relative.
    const TEST_FILE_ALLOWED_SPECIFIERS = new Set(['vitest'])
    const files = listSourceFiles(join(SRC_ROOT, 'domain'))
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const isTestFile = file.endsWith('.test.ts')
      for (const spec of importSpecifiers(source)) {
        if (isTestFile && TEST_FILE_ALLOWED_SPECIFIERS.has(spec)) continue
        expect(spec, `${relative(SRC_ROOT, file)} imports "${spec}"`).toMatch(/^\.\.?\//)
      }
    }
  })

  it('src/ui (design system) does not import composables, adapters or domain', () => {
    const files = listSourceFiles(join(SRC_ROOT, 'ui'))
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const spec of importSpecifiers(source)) {
        expect(spec, `${relative(SRC_ROOT, file)} imports "${spec}"`).not.toMatch(
          /(adapters|composables|domain)/,
        )
      }
    }
  })

  // FB-2 (opt-in persistence, 2026-09-24): useSecrets may reach storage ONLY
  // through the dedicated secrets adapter, and never touches a web-storage API
  // itself. Every other storage adapter stays forbidden here.
  it('useSecrets.ts imports only the dedicated secrets store and no web-storage API', () => {
    const file = join(SRC_ROOT, 'composables', 'useSecrets.ts')
    const source = readFileSync(file, 'utf8')
    for (const spec of importSpecifiers(source)) {
      if (!/adapters/.test(spec)) continue
      expect(spec, `useSecrets.ts imports "${spec}"`).toBe('../adapters/storage/secretsStore')
    }
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
  })

  it('only useSecrets.ts and the store test import the secrets store', () => {
    const ALLOWED = new Set([
      join('composables', 'useSecrets.ts'),
      join('adapters', 'storage', 'secretsStore.test.ts'),
    ])
    const offenders: string[] = []
    for (const file of listSourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file)
      if (ALLOWED.has(rel)) continue
      if (importSpecifiers(readFileSync(file, 'utf8')).some((spec) => /secretsStore/.test(spec))) {
        offenders.push(rel)
      }
    }
    expect(offenders).toEqual([])
  })

  // Exact allowlist: sessionStorage exists only for the opt-in "this tab"
  // secrets level, in the one adapter that owns it. indexedDB and cookies
  // stay forbidden everywhere, with no exception.
  const SESSION_STORAGE_ALLOWLIST = new Set([join('adapters', 'storage', 'secretsStore.ts')])

  it('no file under src/ references indexedDB or document.cookie', () => {
    const offenders: string[] = []
    for (const file of listSourceFiles(SRC_ROOT)) {
      if (/indexedDB|document\.cookie/.test(readFileSync(file, 'utf8'))) {
        offenders.push(relative(SRC_ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('sessionStorage is referenced only by the allowlisted secrets store', () => {
    const offenders: string[] = []
    const users: string[] = []
    for (const file of listSourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file)
      if (!/sessionStorage/.test(readFileSync(file, 'utf8'))) continue
      if (SESSION_STORAGE_ALLOWLIST.has(rel)) users.push(rel)
      else offenders.push(rel)
    }
    expect(offenders).toEqual([])
    // The allowlist is exact: the store really is the (only) user.
    expect(users).toEqual([...SESSION_STORAGE_ALLOWLIST])
  })
})
