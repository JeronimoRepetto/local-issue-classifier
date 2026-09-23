// issue-criticity — date bucketing for the Jev state (SPEC.md §4.3).
// The model compares raw dates unreliably, so dates are pre-bucketed here.
// Pure: the current time is always an injected Clock, never read directly.

export type DateBucket =
  | 'less than a week'
  | '1 to 4 weeks'
  | '1 to 3 months'
  | '3 to 12 months'
  | '1 to 3 years'
  | 'more than 3 years'

/** An injected source of "now", so bucketing is deterministic and testable. */
export type Clock = () => Date

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_DAYS = 7
const FOUR_WEEKS_DAYS = 28
const THREE_MONTHS_DAYS = 90
const TWELVE_MONTHS_DAYS = 365
const THREE_YEARS_DAYS = 3 * 365

/** Buckets an ISO 8601 date against the injected clock's current time. */
export function dateBucket(iso: string, now: Clock): DateBucket {
  const then = new Date(iso).getTime()
  const nowMs = now().getTime()
  // Clamp clock-skew / future dates to the closest (most recent) bucket.
  const days = Math.max(0, (nowMs - then) / DAY_MS)

  if (days < WEEK_DAYS) return 'less than a week'
  if (days < FOUR_WEEKS_DAYS) return '1 to 4 weeks'
  if (days < THREE_MONTHS_DAYS) return '1 to 3 months'
  if (days < TWELVE_MONTHS_DAYS) return '3 to 12 months'
  if (days < THREE_YEARS_DAYS) return '1 to 3 years'
  return 'more than 3 years'
}
