import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'
import {
  CONTRAST_PAIRS,
  COLOR_ROLES,
  THEMES,
  buildStylesheet,
  reducedMotionBlock,
  reducedMotionCss,
  tokens,
  tokensToCss,
} from './tokens'

describe('color tokens', () => {
  it('define every semantic role in both themes', () => {
    for (const theme of THEMES) {
      expect(Object.keys(tokens.color[theme]).sort()).toEqual([...COLOR_ROLES].sort())
    }
  })

  it('have contrast pairs that only reference defined roles', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(COLOR_ROLES).toContain(pair.fg)
      expect(COLOR_ROLES).toContain(pair.bg)
    }
  })

  // SPEC §10.2 / §10.7: the test is the authority, not the hex values in the table.
  describe.each(THEMES)('WCAG 2.2 AA in the %s theme', (theme) => {
    it.each(CONTRAST_PAIRS.map((p) => [`${p.fg} on ${p.bg}`, p] as const))(
      '%s',
      (_label, pair) => {
        const ratio = contrastRatio(tokens.color[theme][pair.fg], tokens.color[theme][pair.bg])
        expect(ratio, `${pair.fg} on ${pair.bg} (${pair.kind})`).toBeGreaterThanOrEqual(
          pair.kind === 'text' ? 4.5 : 3,
        )
      },
    )
  })

  it('checks every text role against every surface it can sit on', () => {
    const textRoles = ['text', 'text-muted', 'accent', 'success', 'warning', 'danger', 'info']
    for (const fg of textRoles) {
      for (const bg of ['bg', 'surface', 'surface-2']) {
        expect(
          CONTRAST_PAIRS.some((p) => p.fg === fg && p.bg === bg && p.kind === 'text'),
          `${fg} on ${bg}`,
        ).toBe(true)
      }
    }
  })
})

describe('tokensToCss', () => {
  it('emits the light theme variables', () => {
    expect(tokensToCss(tokens, 'light')).toMatchSnapshot()
  })

  it('emits the dark theme variables', () => {
    expect(tokensToCss(tokens, 'dark')).toMatchSnapshot()
  })

  it('scopes each theme to its data-theme attribute', () => {
    expect(tokensToCss(tokens, 'light').startsWith(':root[data-theme="light"] {')).toBe(true)
    expect(tokensToCss(tokens, 'dark').startsWith(':root[data-theme="dark"] {')).toBe(true)
  })

  it('can scope a theme to any selector, for side-by-side previews', () => {
    const css = tokensToCss(tokens, 'dark', '[data-kit-theme="dark"]')
    expect(css.startsWith('[data-kit-theme="dark"] {')).toBe(true)
    expect(css).toContain('--color-bg: #111318;')
  })

  it('emits spacing in px and durations in ms', () => {
    const css = tokensToCss(tokens, 'light')
    expect(css).toContain('--space-2: 8px;')
    expect(css).toContain('--dur-fast: 120ms;')
    expect(css).toContain('--ease-pixel: steps(4, end);')
  })
})

describe('reducedMotionCss', () => {
  it('zeroes every duration, caps fades at 80 ms and removes transforms', () => {
    const css = reducedMotionCss(tokens)
    expect(css.startsWith('@media (prefers-reduced-motion: reduce) {')).toBe(true)
    expect(css).toContain('--dur-fast: 0ms;')
    expect(css).toContain('--dur-base: 0ms;')
    expect(css).toContain('--dur-slow: 0ms;')
    expect(css).toContain('--dur-sprite: 0ms;')
    expect(css).toContain('--dur-fade-base: 80ms;')
    expect(css).toContain('--dur-fade-slow: 80ms;')
    expect(css).toContain('--motion-shift: 0px;')
    expect(css).toContain('--motion-scale: 1;')
  })
})

describe('reducedMotionBlock', () => {
  it('emits the reduced-motion variables under an arbitrary selector, without a media query', () => {
    const css = reducedMotionBlock(tokens, '[data-kit-motion="reduced"]')
    expect(css.startsWith('[data-kit-motion="reduced"] {')).toBe(true)
    expect(css).toContain('--dur-base: 0ms;')
    expect(css).not.toContain('@media')
  })
})

describe('buildStylesheet', () => {
  it('contains both themes and the reduced-motion override', () => {
    const css = buildStylesheet(tokens)
    expect(css).toContain(tokensToCss(tokens, 'light'))
    expect(css).toContain(tokensToCss(tokens, 'dark'))
    expect(css).toContain(reducedMotionCss(tokens))
  })
})
