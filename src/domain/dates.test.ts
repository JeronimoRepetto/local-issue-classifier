// Task 3 — date buckets, computed with an injected clock.
import { describe, expect, it } from 'vitest'
import { dateBucket } from './dates'

const NOW_MS = Date.parse('2026-09-23T00:00:00.000Z')
const clock = () => new Date(NOW_MS)

function daysAgo(days: number): string {
  return new Date(NOW_MS - days * 86_400_000).toISOString()
}

describe('dateBucket', () => {
  it('buckets less than a week', () => {
    expect(dateBucket(daysAgo(2), clock)).toBe('less than a week')
  })

  it('buckets 1 to 4 weeks', () => {
    expect(dateBucket(daysAgo(14), clock)).toBe('1 to 4 weeks')
  })

  it('buckets 1 to 3 months', () => {
    expect(dateBucket(daysAgo(60), clock)).toBe('1 to 3 months')
  })

  it('buckets 3 to 12 months', () => {
    expect(dateBucket(daysAgo(200), clock)).toBe('3 to 12 months')
  })

  it('buckets 1 to 3 years', () => {
    expect(dateBucket(daysAgo(500), clock)).toBe('1 to 3 years')
  })

  it('buckets more than 3 years', () => {
    expect(dateBucket(daysAgo(1500), clock)).toBe('more than 3 years')
  })

  it('clamps a future date (clock skew) into "less than a week"', () => {
    expect(dateBucket(daysAgo(-5), clock)).toBe('less than a week')
  })

  it('uses the injected clock rather than the real current time', () => {
    const fixedClock = () => new Date('2020-01-01T00:00:00.000Z')
    // 2019-12-31 is one day before the fixed clock, regardless of when the test runs.
    expect(dateBucket('2019-12-31T00:00:00.000Z', fixedClock)).toBe('less than a week')
  })
})
