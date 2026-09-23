// issue-criticity — Classify scopes and run shapes (SPEC.md §2.4). Pure.
// Presentational components import the RunProgress / RunSummary types from here.
import { isClassificationCurrent } from './classification'
import type { Analysis, Issue, IssueRow, TrimmingProfileId } from './types'

/** `unclassified` is the default; `all` re-sends every non-dismissed issue. */
export type ClassifyScope = 'unclassified' | 'all'

export interface ClassifySelection {
  scope: ClassifyScope
  questionsVersion: number
  /** Restricts the scope to these issue numbers (filtered view, retry failed). */
  only?: readonly number[]
}

export interface RunProgress {
  /** Finished issues, classified or failed. */
  done: number
  total: number
  failed: number
  /** 429 / 529 responses seen so far, retries included. */
  rateLimited: number
  /** The pool size right now (after adaptive halving / restore). */
  concurrency: number
  /** Requests planned so far (batched: batches, incl. validation splits; per-issue: issues). */
  requests?: number
  /** Trimming profile of a batched run; null in per-issue mode. */
  profile?: TrimmingProfileId | null
}

export type RunStatus = 'completed' | 'cancelled' | 'auth-failed'

export interface RunSummary {
  status: RunStatus
  total: number
  classified: number
  failed: number
  /** Never finished: cancelled, or stopped by an authentication error. */
  skipped: number
  lowConfidence: number
  inputTokens: number
  failedNumbers: number[]
  elapsedMs: number
  /** Requests sent, retries not counted (batched: batches incl. validation splits). */
  requests?: number
  /** Trimming profile of a batched run; null in per-issue mode. */
  profile?: TrimmingProfileId | null
}

/**
 * "Unclassified" (§2.4): no classification, a failed or pending attempt, or a
 * stale one (the issue changed, or QUESTIONS_VERSION did).
 */
export function needsClassification(row: IssueRow, questionsVersion: number): boolean {
  if (row.status !== 'done' || !row.classification) return true
  return !isClassificationCurrent(row.classification, row.issue.updatedAt, questionsVersion)
}

/** Issues a scope sends, in analysis order. Dismissed issues are always skipped. */
export function selectForClassification(analysis: Analysis, selection: ClassifySelection): Issue[] {
  const dismissed = new Set(analysis.working.dismissed)
  const only = selection.only ? new Set(selection.only) : null
  return analysis.rows
    .filter((row) => !dismissed.has(row.issue.number))
    .filter((row) => !only || only.has(row.issue.number))
    .filter((row) => selection.scope === 'all' || needsClassification(row, selection.questionsVersion))
    .map((row) => row.issue)
}

export interface ScopeCounts {
  unclassified: number
  all: number
  /** Unclassified issues within the filtered view; null when no view is given. */
  filtered: number | null
}

export function scopeCounts(
  analysis: Analysis,
  questionsVersion: number,
  filteredNumbers?: readonly number[],
): ScopeCounts {
  const count = (selection: Omit<ClassifySelection, 'questionsVersion'>) =>
    selectForClassification(analysis, { ...selection, questionsVersion }).length
  return {
    unclassified: count({ scope: 'unclassified' }),
    all: count({ scope: 'all' }),
    filtered: filteredNumbers ? count({ scope: 'unclassified', only: filteredNumbers }) : null,
  }
}

/**
 * §4.7 measured on 2026-09-23: 22 issues classified in 11 s at concurrency 4
 * (TypeSafe cloud API). ≈2 s per call, spread over the pool. Remains an approximation
 * across different issue complexities and network conditions.
 */
export const SECONDS_PER_CALL = 2

export function estimateSeconds(requests: number, concurrency: number): number {
  return Math.ceil((requests * SECONDS_PER_CALL) / Math.max(1, concurrency))
}

/**
 * Batched runs send few, large requests: they go out in waves of at most
 * `concurrency`, each wave taking about one call. An approximation: a large
 * request may take longer than the measured 2 s (docs/batching.md).
 */
export function estimateBatchedSeconds(requests: number, concurrency: number): number {
  return Math.ceil(requests / Math.max(1, concurrency)) * SECONDS_PER_CALL
}
