// Design v2 pixel guard (docs/redesign-brief.md §4, option B): pixel art is an
// identity accent only — the logo mark and wordmark, one page heading, and the
// empty-state illustration. Everything the user reads is Geist Sans or Mono.
// This test fails when the pixel font or pixel-art icons spread past that.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const SRC = join(__dirname, '..', 'src')
const ICONS_DIR = join(SRC, 'assets', 'icons')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return full === ICONS_DIR ? [] : files(full)
    return ['.vue', '.ts', '.css'].includes(extname(full)) && !full.endsWith('.test.ts') ? [full] : []
  })
}

const rel = (file: string) => relative(SRC, file).split('\\').join('/')

/** Files allowed to set text in the pixel face, and why. */
const PIXEL_FONT_ALLOWED: Record<string, string> = {
  'App.vue': 'wordmark',
  'components/containers/HomeContainer.vue': 'the one page heading',
  'ui/KitPage.vue': 'kit wordmark (dev only)',
  'ui/KitShowcase.vue': 'type specimen (dev only)',
}

/** Files allowed to render pixel-art icons (crisp-edged generated SVGs). */
const PIXEL_ART_ALLOWED = ['App.vue', 'ui/EmptyState.vue', 'ui/KitPage.vue', 'ui/KitShowcase.vue']

const pixelArtIcons = readdirSync(ICONS_DIR)
  .filter((f) => f.endsWith('.vue'))
  .filter((f) => readFileSync(join(ICONS_DIR, f), 'utf8').includes('crispEdges'))
  .map((f) => f.replace(/\.vue$/, ''))

describe('pixel accent usage (design v2)', () => {
  it('keeps pixel art to the logo and the empty-state illustration', () => {
    expect(pixelArtIcons.sort()).toEqual(['IconEmptyBox', 'IconLogo'])
  })

  it('uses the pixel font class only in the allowlisted places, once per app file', () => {
    const offenders: string[] = []
    for (const file of files(SRC)) {
      const name = rel(file)
      const count = (readFileSync(file, 'utf8').match(/\bu-pixel-font\b/g) ?? []).length
      if (!count || name === 'ui/base.css') continue
      if (!(name in PIXEL_FONT_ALLOWED)) offenders.push(`${name} (${count})`)
      else if (!name.startsWith('ui/Kit') && count > 1) offenders.push(`${name} uses it ${count} times`)
    }
    expect(offenders).toEqual([])
  })

  it('reads the pixel font variable only through the .u-pixel-font utility', () => {
    const offenders = files(SRC)
      .filter((file) => rel(file) !== 'ui/base.css' && !file.endsWith('tokens.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('--font-pixel'))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('renders pixel-art icons only in the allowlisted places', () => {
    const offenders: string[] = []
    for (const file of files(SRC)) {
      const name = rel(file)
      if (PIXEL_ART_ALLOWED.includes(name)) continue
      const source = readFileSync(file, 'utf8')
      for (const icon of pixelArtIcons) {
        if (new RegExp(`\\b${icon}\\b`).test(source)) offenders.push(`${name}: ${icon}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
