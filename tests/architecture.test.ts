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
    const files = listSourceFiles(join(SRC_ROOT, 'domain'))
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const spec of importSpecifiers(source)) {
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

  it('useSecrets.ts imports no storage adapter and no web-storage API', () => {
    const file = join(SRC_ROOT, 'composables', 'useSecrets.ts')
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      return // not created until Task 4
    }
    for (const spec of importSpecifiers(source)) {
      expect(spec).not.toMatch(/adapters\/storage/)
    }
    expect(source).not.toMatch(/sessionStorage|indexedDB|document\.cookie/)
  })

  it('no file under src/ references sessionStorage, indexedDB or document.cookie', () => {
    const offenders: string[] = []
    for (const file of listSourceFiles(SRC_ROOT)) {
      if (file.endsWith('architecture.test.ts')) continue
      const source = readFileSync(file, 'utf8')
      if (/sessionStorage|indexedDB|document\.cookie/.test(source)) {
        offenders.push(relative(SRC_ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })
})
