// Pure single-key row sort (SPEC.md §2.5 item 3, §6.4). Task 13 turns this into
// the full multi-key sort ("reorder") by chaining `compareBy` once per rule,
// in order, before falling back to the same final number tie-break.
import type { IssueRow, SortDirection, SortKey } from './types'

/** Keys whose value comes from the classification; unclassified rows have none. */
const CLASSIFICATION_KEYS = new Set<SortKey>([
  'priority',
  'criticality',
  'complexity',
  'effort',
  'relevance',
  'minConfidence',
])

/** 0 = has a value for this key, 1 = no value — always sorts after, any direction. */
function classificationRank(row: IssueRow, key: SortKey): 0 | 1 {
  if (!CLASSIFICATION_KEYS.has(key)) return 0
  if (!row.classification) return 1
  // minConfidence is optional; undefined should sort after defined values
  if (key === 'minConfidence' && row.classification.minConfidence === undefined) return 1
  return 0
}

function dateValue(row: IssueRow, key: SortKey): string | null {
  if (key === 'createdAt') return row.issue.createdAt
  if (key === 'updatedAt') return row.issue.updatedAt
  return null
}

/** The primary numeric value for `key`; NaN-safe callers only reach this after the rank check. */
function rawValue(row: IssueRow, key: SortKey): number {
  const c = row.classification
  switch (key) {
    case 'criticality':
      return c ? c.criticality.score : 0
    case 'complexity':
      return c ? c.complexity.score : 0
    case 'effort':
      return c ? c.effort.score : 0
    case 'relevance':
      return c ? c.relevance.value : 0
    case 'minConfidence':
      return c && c.minConfidence !== undefined ? c.minConfidence : 0
    case 'commentCount':
      return row.issue.commentCount
    case 'number':
      return row.issue.number
    case 'priority':
      // domain/priority.ts (priorityOf) lands in Task 14. Until then every row
      // ties on this key, and the number tie-break decides the order.
      return 0
    default:
      return 0
  }
}

/** A tie-break within the same key, applied before the final row-number tie-break. */
function secondaryValue(row: IssueRow, key: SortKey): number {
  if (key === 'relevance' && row.classification) return row.classification.relevance.score
  return 0
}

/**
 * An ascending comparator for one `SortKey` (SPEC.md §3.1 `Pure functions in
 * domain/analysis.ts` list `sortRows`; this is its single-rule building
 * block). Task 13 composes several of these, one per `SortRule`, in order.
 */
export function compareBy(key: SortKey): (a: IssueRow, b: IssueRow) => number {
  return (a, b) => {
    const rankDiff = classificationRank(a, key) - classificationRank(b, key)
    if (rankDiff !== 0) return rankDiff

    const aDate = dateValue(a, key)
    if (aDate !== null) {
      const bDate = dateValue(b, key) as string
      return aDate < bDate ? -1 : aDate > bDate ? 1 : 0
    }

    const diff = rawValue(a, key) - rawValue(b, key)
    if (diff !== 0) return diff
    return secondaryValue(a, key) - secondaryValue(b, key)
  }
}

/**
 * Stable single-key sort: unclassified rows always sort last regardless of
 * direction, and the final tie-break is always issue number ascending.
 * Never mutates `rows`.
 */
export function sortRows(rows: IssueRow[], key: SortKey, direction: SortDirection): IssueRow[] {
  const cmp = compareBy(key)
  const sign = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const rankDiff = classificationRank(a.row, key) - classificationRank(b.row, key)
      if (rankDiff !== 0) return rankDiff
      const primary = cmp(a.row, b.row) * sign
      if (primary !== 0) return primary
      const numberDiff = a.row.issue.number - b.row.issue.number
      if (numberDiff !== 0) return numberDiff
      return a.index - b.index
    })
    .map(({ row }) => row)
}
