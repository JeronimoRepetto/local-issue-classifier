// SPEC §12.3 "Tokens only": no hex colors, pixel or millisecond literals in the
// kit or global styles outside src/ui/tokens.ts. Generated icons are exempt
// (their viewBox/size are grid units, checked by tests/icons.test.ts).
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const SRC = join(__dirname, '..', 'src')
const SCANNED = [join(SRC, 'ui'), join(SRC, 'components'), join(SRC, 'style.css'), join(SRC, 'App.vue')]
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|ms)\b/g

function files(path: string): string[] {
  let stat
  try {
    stat = statSync(path)
  } catch {
    return []
  }
  if (!stat.isDirectory()) return [path]
  return readdirSync(path).flatMap((entry) => files(join(path, entry)))
}

describe('tokens only (SPEC §12.3)', () => {
  it('finds no raw colors, px or ms outside tokens.ts', () => {
    const offenders: string[] = []
    for (const file of SCANNED.flatMap(files)) {
      if (!['.vue', '.css', '.ts'].includes(extname(file))) continue
      if (file.endsWith('tokens.ts') || file.endsWith('.test.ts')) continue
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(LITERAL)) {
        offenders.push(`${relative(SRC, file)}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
