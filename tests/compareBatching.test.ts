// T16 — the batching harness can measure a local Jev-compatible server:
// JEV_BASE_URL picks the server, JEV_MODEL the model, and a key is optional
// (may be empty) whenever the target is not the TypeSafe cloud.
import { describe, expect, it } from 'vitest'
import { resolveTarget } from '../scripts/compare-batching.mjs'

describe('compare-batching resolveTarget', () => {
  it('defaults to the TypeSafe cloud, which requires a key, and jev-latest', () => {
    expect(resolveTarget({})).toEqual({ baseUrl: 'https://api.typesafe.ai', keyRequired: true, model: 'jev-latest' })
  })

  it('honours JEV_BASE_URL and JEV_MODEL and makes the key optional for a local server', () => {
    expect(resolveTarget({ JEV_BASE_URL: ' http://localhost:8009 ', JEV_MODEL: 'kev-latest', JEV_API_KEY: '' })).toEqual({
      baseUrl: 'http://localhost:8009',
      keyRequired: false,
      model: 'kev-latest',
    })
  })

  it('treats blank values as unset', () => {
    expect(resolveTarget({ JEV_BASE_URL: '  ', JEV_MODEL: ' ' })).toEqual({
      baseUrl: 'https://api.typesafe.ai',
      keyRequired: true,
      model: 'jev-latest',
    })
  })
})
