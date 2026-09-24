// Pure presentation helpers shared by the badges and bars. The kit does not
// import `domain/`, so the level union is restated here as a plain string union.

export type Level = 'high' | 'medium' | 'low'
export type ScaleStep = 1 | 2 | 3 | 4 | 5

const BARS: Record<Level, 1 | 2 | 3> = { high: 3, medium: 2, low: 1 }

/** Number of filled bars in the pixel signal glyph. */
export function levelBars(level: Level): 1 | 2 | 3 {
  return BARS[level]
}

export function levelLabel(level: Level): string {
  return level[0].toUpperCase() + level.slice(1)
}

/**
 * high ≥ 0.8, medium 0.5–0.8, low < 0.5. Used by the min-confidence
 * filter and by export (`includeConfidence`), which both band a numeric score
 * into these three levels. `ConfidenceBadge` no longer uses this: since the
 * user decision of 2026-09-24 it renders on a continuous 0–0.50 scale (a
 * gradient plus its own hide/show rule) instead of this three-way split.
 */
export function confidenceLevel(confidence: number): Level {
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

/** Maps a 0–100 score onto `scale-1..5` in bands of 20. */
export function scaleStep(value: number): ScaleStep {
  const clamped = Math.min(100, Math.max(0, value))
  return Math.min(5, Math.floor(clamped / 20) + 1) as ScaleStep
}
