import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHex, relativeLuminance } from './contrast'

describe('parseHex', () => {
  it('parses 6-digit and 3-digit hex colors, case-insensitively', () => {
    expect(parseHex('#4B4BC8')).toEqual([75, 75, 200])
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('000000')).toEqual([0, 0, 0])
  })

  it('rejects anything that is not a hex color', () => {
    expect(() => parseHex('red')).toThrow(/hex color/)
    expect(() => parseHex('#12345')).toThrow(/hex color/)
  })
})

describe('relativeLuminance (WCAG 2.x)', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#FFFFFF')).toBe(1)
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#16181D', '#F7F7FA')).toBe(contrastRatio('#F7F7FA', '#16181D'))
  })

  it('matches known reference values', () => {
    // #767676 on white is the classic "just passes AA" grey (4.54:1).
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2)
    expect(contrastRatio('#949494', '#FFFFFF')).toBeCloseTo(3.03, 2)
  })
})
