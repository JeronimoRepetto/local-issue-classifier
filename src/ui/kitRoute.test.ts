import { describe, expect, it } from 'vitest'
import { isKitRequested } from './kitRoute'

describe('isKitRequested', () => {
  it.each([
    ['?kit', true],
    ['?kit=1', true],
    ['?foo=bar&kit', true],
    ['', false],
    ['?kitten', false],
    ['?theme=dark', false],
  ])('%s → %s', (search, expected) => {
    expect(isKitRequested(search)).toBe(expected)
  })
})
