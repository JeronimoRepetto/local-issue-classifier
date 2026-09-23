// Issues-table column visibility (design v2). The table shows a default subset;
// the rest are re-enabled from the "Columns" menu. The choice is stored per
// analysis in its working state under `visibleColumns` (see useColumns), and is
// normalized here so a stale or hand-edited value can never hide the number or
// the title, or reorder the table.

export const TABLE_COLUMN_IDS = [
  'number',
  'title',
  'kind',
  'priority',
  'criticality',
  'complexity',
  'effort',
  'relevance',
  'confidence',
  'status',
  'updated',
  'comments',
] as const
export type TableColumnId = (typeof TABLE_COLUMN_IDS)[number]

export const COLUMN_LABELS: Record<TableColumnId, string> = {
  number: '#',
  title: 'Title',
  kind: 'Kind',
  priority: 'Priority',
  criticality: 'Criticality',
  complexity: 'Complexity',
  effort: 'Effort',
  relevance: 'Relevance',
  confidence: 'Confidence',
  status: 'Status',
  updated: 'Updated',
  comments: 'Comments',
}

/** Columns that cannot be hidden: without them a row cannot be identified. */
export const REQUIRED_COLUMNS: readonly TableColumnId[] = ['number', 'title']

const HIDDEN_BY_DEFAULT: readonly TableColumnId[] = ['complexity', 'confidence', 'comments']

export const DEFAULT_VISIBLE_COLUMNS: readonly TableColumnId[] = TABLE_COLUMN_IDS.filter(
  (id) => !HIDDEN_BY_DEFAULT.includes(id),
)

function isColumnId(value: unknown): value is TableColumnId {
  return typeof value === 'string' && (TABLE_COLUMN_IDS as readonly string[]).includes(value)
}

/** Canonical-order visible set from any stored value; defaults when nothing valid is stored. */
export function resolveVisibleColumns(stored: unknown): TableColumnId[] {
  const chosen = Array.isArray(stored) ? stored.filter(isColumnId) : []
  if (chosen.length === 0) return [...DEFAULT_VISIBLE_COLUMNS]
  const set = new Set<TableColumnId>([...REQUIRED_COLUMNS, ...chosen])
  return TABLE_COLUMN_IDS.filter((id) => set.has(id))
}

/** Shows or hides one column; required columns are left as they are. */
export function toggleColumn(visible: readonly TableColumnId[], id: TableColumnId): TableColumnId[] {
  if (REQUIRED_COLUMNS.includes(id)) return resolveVisibleColumns(visible)
  const set = new Set(resolveVisibleColumns(visible))
  if (set.has(id)) set.delete(id)
  else set.add(id)
  return TABLE_COLUMN_IDS.filter((column) => set.has(column))
}
