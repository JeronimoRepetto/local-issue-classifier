import { describe, expect, it } from 'vitest'
import { mixOklab } from './colorMix'

describe('mixOklab', () => {
  it('returns the first color at 100% and the second at 0%', () => {
    expect(mixOklab('#FF0000', '#0000FF', 100)).toBe('#FF0000')
    expect(mixOklab('#FF0000', '#0000FF', 0)).toBe('#0000FF')
  })

  it('mixing white and black at 50% lands close to a mid grey', () => {
    const mid = mixOklab('#FFFFFF', '#000000', 50)
    // OKLab's midpoint is not exactly #808080 (sRGB gamma is non-linear),
    // but it must be a genuine grey (R=G=B) roughly in the middle.
    const [r, g, b] = [mid.slice(1, 3), mid.slice(3, 5), mid.slice(5, 7)].map((h) => parseInt(h, 16))
    expect(r).toBe(g)
    expect(g).toBe(b)
    expect(r).toBeGreaterThan(80)
    expect(r).toBeLessThan(180)
  })

  it('is symmetric: mixOklab(a, b, p) === mixOklab(b, a, 100 - p)', () => {
    expect(mixOklab('#A15C07', '#FAFAFA', 5)).toBe(mixOklab('#FAFAFA', '#A15C07', 95))
  })

  it('matches the known tint values baked into tokens.ts (5% tone into surface)', () => {
    // Regression anchors: if these ever change, tokens.ts's `*-soft` roles and
    // its AA contrast must be recomputed and re-verified together (see
    // tokens.test.ts's `mixOklab` consistency check).
    expect(mixOklab('#A15C07', '#FAFAFA', 5)).toBe('#F6F2EF') // light warning-soft
    expect(mixOklab('#B91C1C', '#FAFAFA', 5)).toBe('#F9F0EF') // light danger-soft
    expect(mixOklab('#1D4ED8', '#FAFAFA', 5)).toBe('#EEF2F9') // light info-soft
    expect(mixOklab('#FBBF24', '#111113', 5)).toBe('#1A1816') // dark warning-soft
    expect(mixOklab('#F87171', '#111113', 5)).toBe('#1B1617') // dark danger-soft
    expect(mixOklab('#60A5FA', '#111113', 5)).toBe('#15171C') // dark info-soft
  })
})
