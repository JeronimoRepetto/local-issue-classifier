// Task 3 — SPEC.md §3/§4.3 text helpers: trimMiddle, stripMarkdownNoise, estimateTokens.
import { describe, expect, it } from 'vitest'
import { estimateTokens, stripMarkdownNoise, trimMiddle } from './text'

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
