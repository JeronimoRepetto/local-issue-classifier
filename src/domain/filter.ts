// Pure row filtering. Every dimension combines
// with AND; each individual dimension is empty/full-range = "no filter".
// A row without a classification fails a non-empty classification-derived
// filter (level, kind, relevance, minimum confidence): it has no value to
// compare against, so it only shows up when that filter is not narrowed.
import type { Issue, IssueFilter, IssueRow, Level } from './types'

type LevelDimension = 'complexity' | 'criticality' | 'effort'

function matchesLevel(row: IssueRow, dimension: LevelDimension, allowed: Level[]): boolean {
  if (allowed.length === 0) return true
  if (!row.classification) return false
  return allowed.includes(row.classification[dimension].level)
}

function matchesKind(row: IssueRow, allowed: IssueFilter['kind']): boolean {
  if (allowed.length === 0) return true
  if (!row.classification) return false
  return allowed.includes(row.classification.kind.choice)
}

function matchesRelevance(row: IssueRow, min: number, max: number): boolean {
  // 0-100 is the full range: "no filter", so unclassified rows also pass.
  if (min <= 0 && max >= 100) return true
  if (!row.classification) return false
  const { value } = row.classification.relevance
  return value >= min && value <= max
}

function matchesMinConfidence(row: IssueRow, threshold: number): boolean {
  if (threshold <= 0) return true
  if (!row.classification) return false
  const { minConfidence } = row.classification
  if (minConfidence === undefined) return false
  return minConfidence >= threshold
}

function matchesStatus(row: IssueRow, allowed: IssueFilter['statuses']): boolean {
  if (allowed.length === 0) return true
  return allowed.includes(row.status)
}

function matchesLabels(row: IssueRow, allowed: string[]): boolean {
  if (allowed.length === 0) return true
  return row.issue.labels.some((label) => allowed.includes(label))
}

/** A memoized-shape, lower-cased haystack for the free-text search (§6.4). */
export function searchText(issue: Issue): string {
  return [String(issue.number), issue.title, issue.body, issue.labels.join(' '), issue.author]
    .join(' ')
    .toLowerCase()
}

function matchesText(row: IssueRow, text: string): boolean {
  const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = searchText(row.issue)
  return terms.every((term) => haystack.includes(term))
}

/** Applies every dimension of `filter`, combined with AND. Never mutates `rows`. */
export function filterRows(rows: IssueRow[], filter: IssueFilter): IssueRow[] {
  return rows.filter(
    (row) =>
      matchesLevel(row, 'complexity', filter.complexity) &&
      matchesLevel(row, 'criticality', filter.criticality) &&
      matchesLevel(row, 'effort', filter.effort) &&
      matchesKind(row, filter.kind) &&
      matchesRelevance(row, filter.relevanceMin, filter.relevanceMax) &&
      matchesMinConfidence(row, filter.minConfidence) &&
      matchesStatus(row, filter.statuses) &&
      matchesLabels(row, filter.labels) &&
      matchesText(row, filter.text),
  )
}
