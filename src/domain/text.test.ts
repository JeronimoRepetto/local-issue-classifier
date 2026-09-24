// Task 3 — text helpers: trimMiddle, stripMarkdownNoise, estimateTokens.
import { describe, expect, it } from 'vitest'
import {
  estimateTokens,
  headText,
  sanitizeJsonStrings,
  sanitizeText,
  stripMarkdownNoise,
  tailText,
  toWellFormedFallback,
  trimMiddle,
} from './text'

describe('trimMiddle', () => {
  it('returns text unchanged when it already fits the budget', () => {
    expect(trimMiddle('short text', 6000, 1500)).toBe('short text')
  })

  it('returns text unchanged at the exact head+tail boundary', () => {
    const text = 'a'.repeat(10)
    expect(trimMiddle(text, 6, 4)).toBe(text)
  })

  it('keeps the head and tail and reports the omitted character count', () => {
    const text = 'H'.repeat(10) + 'M'.repeat(20) + 'T'.repeat(5)
    const result = trimMiddle(text, 10, 5)
    expect(result).toBe(`${'H'.repeat(10)}\n[… 20 characters omitted …]\n${'T'.repeat(5)}`)
  })

  it('supports a head-only trim when tail is 0', () => {
    const text = 'X'.repeat(20)
    const result = trimMiddle(text, 8, 0)
    expect(result).toBe(`${'X'.repeat(8)}\n[… 12 characters omitted …]\n`)
  })
})

describe('stripMarkdownNoise', () => {
  it('removes HTML comments', () => {
    const input = 'Intro\n<!-- hidden note\nspanning lines -->\nOutro'
    expect(stripMarkdownNoise(input)).toBe('Intro\n\nOutro')
  })

  it('drops a pure badge/image line', () => {
    const input = ['# Title', '![Build](https://img.shields.io/badge/build-passing-green)', 'Body'].join(
      '\n',
    )
    expect(stripMarkdownNoise(input)).toBe('# Title\nBody')
  })

  it('drops a pure [![...](...)](...) badge-link line', () => {
    const input = [
      '# Title',
      '[![Build](https://img.shields.io/badge/build-passing-green)](https://ci.example.com)',
      'Body',
    ].join('\n')
    expect(stripMarkdownNoise(input)).toBe('# Title\nBody')
  })

  it('drops a pure <img> line', () => {
    const input = ['# Title', '<img src="https://example.com/logo.png" alt="logo">', 'Body'].join(
      '\n',
    )
    expect(stripMarkdownNoise(input)).toBe('# Title\nBody')
  })

  it('keeps an inline image embedded in prose', () => {
    const input = 'See the diagram: ![diagram](fig.png) for details.'
    expect(stripMarkdownNoise(input)).toBe(input)
  })

  it('keeps a short fenced code block intact', () => {
    const block = ['```js', 'const x = 1', 'console.log(x)', '```'].join('\n')
    const input = `Before\n${block}\nAfter`
    expect(stripMarkdownNoise(input)).toBe(input)
  })

  it('replaces a fenced code block over 15 lines with an omission marker', () => {
    const longBody = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
    const block = ['```js', longBody, '```'].join('\n')
    const input = `Before\n${block}\nAfter`
    expect(stripMarkdownNoise(input)).toBe('Before\n[code block omitted]\nAfter')
  })

  it('collapses runs of blank lines to a single blank line', () => {
    const input = 'Para one\n\n\n\n\nPara two'
    expect(stripMarkdownNoise(input)).toBe('Para one\n\nPara two')
  })
})

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('estimates ceil(chars / 3.5)', () => {
    expect(estimateTokens('a'.repeat(7))).toBe(2)
    expect(estimateTokens('a'.repeat(10))).toBe(3)
    expect(estimateTokens('a'.repeat(100))).toBe(29)
  })
})

// Code points built numerically so no editor or tool ever rewrites the escapes.
const EMOJI = String.fromCodePoint(0x1f600) // two UTF-16 code units
const HIGH = String.fromCharCode(0xd83d) // lone high surrogate
const LOW = String.fromCharCode(0xde00) // lone low surrogate
const REPLACEMENT = String.fromCharCode(0xfffd)

describe('code-point-safe cuts (never split a surrogate pair)', () => {
  it('headText drops a pair the cut would split instead of keeping half of it', () => {
    const text = `ab${EMOJI}cd`
    expect(headText(text, 3)).toBe('ab')
    expect(headText(text, 4)).toBe(`ab${EMOJI}`)
    expect(headText(text, 3).isWellFormed()).toBe(true)
  })

  it('tailText starts after a pair the cut would split', () => {
    const text = `ab${EMOJI}cd`
    expect(tailText(text, 3)).toBe('cd')
    expect(tailText(text, 4)).toBe(`${EMOJI}cd`)
    expect(tailText(text, 0)).toBe('')
  })

  it('trimMiddle stays well-formed with an emoji at either cut, whatever the parity', () => {
    for (const prefix of ['', 'x']) {
      const text = prefix + EMOJI.repeat(40)
      for (const [head, tail] of [
        [7, 5],
        [8, 6],
        [9, 0],
      ]) {
        const result = trimMiddle(text, head, tail)
        expect(result.isWellFormed()).toBe(true)
        expect(result).toContain('characters omitted')
      }
    }
  })
})

describe('sanitizeText', () => {
  it('replaces lone surrogates with U+FFFD and keeps valid pairs', () => {
    expect(sanitizeText(`a${HIGH}b${LOW}c${EMOJI}`)).toBe(`a${REPLACEMENT}b${REPLACEMENT}c${EMOJI}`)
  })

  it('strips C0 control characters except newline and tab', () => {
    const controls = [0x00, 0x01, 0x07, 0x08, 0x0b, 0x0c, 0x0d, 0x1b, 0x1f].map((c) => String.fromCharCode(c)).join('')
    const kept = `${String.fromCharCode(0x09)}b${String.fromCharCode(0x0a)}c`
    expect(sanitizeText(`a${controls}${kept}`)).toBe(`a${kept}`)
  })

  it('in strict mode also strips C1 controls, DEL, the BOM and noncharacters', () => {
    const noise = [0x7f, 0x85, 0x9f, 0xfeff, 0xfdd0, 0xfffe, 0xffff].map((c) => String.fromCharCode(c)).join('')
    const astralNonchar = String.fromCodePoint(0x1fffe)
    expect(sanitizeText(`a${noise}${astralNonchar}b${EMOJI}`, { strict: true })).toBe(`ab${EMOJI}`)
    expect(sanitizeText(`a${String.fromCharCode(0x85)}b`)).toBe(`a${String.fromCharCode(0x85)}b`)
  })

  it('the fallback used without String.prototype.toWellFormed matches the native one', () => {
    const text = `${LOW}a${EMOJI}${HIGH}${HIGH}${LOW}b${HIGH}`
    expect(toWellFormedFallback(text)).toBe(text.toWellFormed())
  })
})

describe('sanitizeJsonStrings', () => {
  it('sanitizes every string of a JSON-like value, keys and other values untouched', () => {
    const value = { a: `x${HIGH}`, list: [`y${String.fromCharCode(0x01)}`, 3, null, true], nested: { b: EMOJI } }
    expect(sanitizeJsonStrings(value)).toEqual({ a: `x${REPLACEMENT}`, list: ['y', 3, null, true], nested: { b: EMOJI } })
  })
})
