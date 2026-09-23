// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseLinkHeader } from './link'

const API = 'https://api.github.com/repositories/1/issues'

describe('parseLinkHeader', () => {
  it('extracts next and last', () => {
    const header = `<${API}?page=2>; rel="next", <${API}?page=5>; rel="last"`
    expect(parseLinkHeader(header)).toEqual({
      next: `${API}?page=2`,
      last: `${API}?page=5`,
    })
  })

  it('extracts prev and first alongside next and last', () => {
    const header = [
      `<${API}?page=1>; rel="prev"`,
      `<${API}?page=3>; rel="next"`,
      `<${API}?page=5>; rel="last"`,
      `<${API}?page=1>; rel="first"`,
    ].join(', ')
    expect(parseLinkHeader(header)).toEqual({
      prev: `${API}?page=1`,
      next: `${API}?page=3`,
      last: `${API}?page=5`,
      first: `${API}?page=1`,
    })
  })

  it('handles several rel values in one entry and odd whitespace', () => {
    const header = `  <${API}?page=4> ;  rel="next last"  `
    expect(parseLinkHeader(header)).toEqual({ next: `${API}?page=4`, last: `${API}?page=4` })
  })

  it('returns an empty object for a missing or empty header', () => {
    expect(parseLinkHeader(null)).toEqual({})
    expect(parseLinkHeader(undefined)).toEqual({})
    expect(parseLinkHeader('')).toEqual({})
  })

  it('ignores malformed entries without throwing', () => {
    const header = `garbage, <${API}?page=2>; rel="next", <no-rel>, <${API}?page=9>; rel=`
    expect(parseLinkHeader(header)).toEqual({ next: `${API}?page=2` })
    expect(parseLinkHeader('<unterminated; rel="next"')).toEqual({})
  })

  it('ignores relations it does not know', () => {
    expect(parseLinkHeader(`<${API}?page=2>; rel="alternate"`)).toEqual({})
  })
})
