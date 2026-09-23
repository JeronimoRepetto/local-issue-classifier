// Pure priority score (SPEC.md §4.9). No Vue, no fetch, no storage: only
// imports other domain modules, per SPEC.md §7.2. It is a composite score in
// the sense of `patterns/composite-scoring.md`: each dimension is normalized
// to 0..1, weighted, and combined. It is computed on the fly from the stored
// classification and the analysis's weights — never stored per row, so
// changing a weight never touches a classification.
import type { Classification, PriorityWeights } from './types'

/**
 * A row's 0..100 priority score, or `null` when there is nothing to rank:
 * no classification, or every weight is 0 (SPEC.md §4.9).
 *
 * Uses the continuous `score` values, not the rounded levels, so ranking
 * stays fine-grained. Complexity and effort are inverted: a simpler,
 * lower-effort issue ranks higher. Priority is a ranking aid, not a
 * measurement — it inherits the ordinal nature of the Jev scores (§4.4).
 */
export function priorityOf(c: Classification | null | undefined, w: PriorityWeights): number | null {
  if (!c) return null
  const total = w.criticality + w.relevance + w.complexity + w.effort
  if (total <= 0) return null
  const crit = c.criticality.score / 2 // 0..1, higher = more critical
  const rel = c.relevance.score / 4 // 0..1, higher = more relevant
  const simp = 1 - c.complexity.score / 2 // inverted: simpler → higher
  const ease = 1 - c.effort.score / 2 // inverted: less effort → higher
  const raw = (w.criticality * crit + w.relevance * rel + w.complexity * simp + w.effort * ease) / total
  return Math.round(100 * raw) // integer 0..100
}

/**
 * Rounds each weight to the nearest multiple of 5, clamped to 0..100
 * (SPEC.md §4.9). Applied on load and on every edit from the Weights popover.
 */
export function clampWeights(w: PriorityWeights): PriorityWeights {
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n / 5) * 5))
  return {
    criticality: clamp(w.criticality),
    relevance: clamp(w.relevance),
    complexity: clamp(w.complexity),
    effort: clamp(w.effort),
  }
}
