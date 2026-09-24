// Per-provider batching settings (docs/batching.md "Local providers"). Pure.
//
// The cloud's limits (models.md: a 32k state budget) are far above what a
// small local model handles: a 100-issue run against Kev came back with three
// `422 Unprocessable Content` on /v1/systemone, which the runner's
// split-and-retry then had to recover. For a local provider the fitter
// therefore also caps the estimated state of every batch
// (Preferences.localMaxStateTokens, about 8k tokens by default), stops
// trimming at `condensed` instead of squeezing a batch through `tight` or
// `minimal`, and sends an issue that still cannot fit a batch on its own, one
// request per issue. The split-and-retry stays as the safety net. The cloud
// (and the browser provider, which always runs per issue) is unchanged.
import { DEFAULT_REQUEST_LIMITS, TRIMMING_PROFILE_IDS } from './jevBatchState'
import type { RequestLimits } from './jevBatchState'
import type { ProviderConfig } from './provider'
import type { TrimmingProfileId } from './types'

/** Default state budget of a local batch, in estimated tokens. */
export const DEFAULT_LOCAL_MAX_STATE_TOKENS = 8_000
/** Accepted range for Preferences.localMaxStateTokens; never above the cloud's own state budget. */
export const LOCAL_MAX_STATE_TOKENS_RANGE = { min: 1_000, max: DEFAULT_REQUEST_LIMITS.stateTokens } as const
/** The tightest profile a local batch uses before falling back to per-issue requests. */
export const LOCAL_TRIMMING_FLOOR: TrimmingProfileId = 'condensed'

export interface BatchSettings {
  limits: RequestLimits
  /** The tightest trimming profile the fitter may use. */
  floor: TrimmingProfileId
  /** Send issues that fit no batch one at a time instead of failing them as too large. */
  perIssueFallback: boolean
}

export interface BatchPreferences {
  trimmingFloor: TrimmingProfileId
  localMaxStateTokens: number
}

/** The looser (earlier) of two trimming profiles. */
function looser(a: TrimmingProfileId, b: TrimmingProfileId): TrimmingProfileId {
  return TRIMMING_PROFILE_IDS.indexOf(a) <= TRIMMING_PROFILE_IDS.indexOf(b) ? a : b
}

export function batchSettingsFor(kind: ProviderConfig['kind'], prefs: BatchPreferences): BatchSettings {
  if (kind !== 'local') {
    return { limits: DEFAULT_REQUEST_LIMITS, floor: prefs.trimmingFloor, perIssueFallback: false }
  }
  return {
    limits: { ...DEFAULT_REQUEST_LIMITS, maxStateTokens: sanitizeLocalMaxStateTokens(prefs.localMaxStateTokens) },
    floor: looser(prefs.trimmingFloor, LOCAL_TRIMMING_FLOOR),
    perIssueFallback: true,
  }
}

/** A stored or typed budget: a whole number clamped to the range; anything else is the default. */
export function sanitizeLocalMaxStateTokens(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LOCAL_MAX_STATE_TOKENS
  const { min, max } = LOCAL_MAX_STATE_TOKENS_RANGE
  return Math.min(max, Math.max(min, Math.floor(value)))
}
