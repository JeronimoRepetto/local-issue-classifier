// Shared export model (see docs/export-format.md): row partitioning (main /
// unclassified / dismissed) plus header metadata, built once by
// `buildExportModel(analysis, options, now)` and consumed by all three export
// renderers — `exportText.ts`'s `formatExport` (plain text), `exportMarkdown.ts`'s
// `formatExportMarkdown` and `exportHtml.ts`'s `formatExportHtml` — so they can
// never show a different row set, order or header than one another. Pure: no
// Vue, no fetch, no storage, no browser APIs; only imports other domain modules.
import { filterRows } from './filter'
import { sortRowsBy } from './sort'
import { defaultAnalysisName, visibleRows } from './analysis'
import { priorityOf } from './priority'
import type {
  Analysis,
  Classification,
  ExportOptions,
  IssueFilter,
  IssueRow,
  PriorityWeights,
  SortDirection,
  SortKey,
  SortRule,
} from './types'

export const NOTE_TEXT =
  'Levels, relevance and priority are model-based estimates; relevance and priority are ordinal 0–100 signals.'

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Forces a title onto one line (§6.5 "Titles are forced onto one line"). */
export function oneLine(title: string): string {
  return title.replace(/\r\n|\r|\n|\t/g, ' ')
}

/** "Dates are YYYY-MM-DD" (§6.5); ISO 8601 strings already start with that shape. */
export function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

/** "The header's generated time uses the local time zone" (§6.5). */
export function formatGenerated(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())} (local time)`
}

export function levelLabel(level: string): string {
  return level.toUpperCase()
}

// ── Row-table shape shared by the Markdown and HTML renderers ─────────────
// Both build one GFM/HTML table per section with the same columns, computed
// from the same raw values, so a mismatch between the two formats can only
// come from how each one *wraps* a value (a link, a chip, an escape rule),
// never from a different number or level.

const TABLE_HEADERS_BASE = ['#', 'Title', 'Kind', 'Priority', 'Criticality', 'Complexity', 'Effort', 'Relevance']
const TABLE_HEADERS_TAIL = ['Status', 'Updated']

/** The column headers for one row table, with Confidence inserted only when requested. */
export function tableHeaders(includeConfidence: boolean): string[] {
  return includeConfidence
    ? [...TABLE_HEADERS_BASE, 'Confidence', ...TABLE_HEADERS_TAIL]
    : [...TABLE_HEADERS_BASE, ...TABLE_HEADERS_TAIL]
}

/** `{priority}/100`, or `—` when unclassified or every weight is 0. */
export function priorityText(c: Classification | null, weights: PriorityWeights): string {
  if (!c) return '—'
  const priority = priorityOf(c, weights)
  return priority === null ? '—' : `${priority}/100`
}

/** The classification's overall `minConfidence`, to 2 decimals, or `—`. */
export function confidenceText(c: Classification | null): string {
  if (!c || c.minConfidence === undefined) return '—'
  return c.minConfidence.toFixed(2)
}

/** The row's classification status, plus the stored error message when it errored. */
export function statusText(row: IssueRow): string {
  if (row.status === 'error' && row.error) return `${row.status} (${row.error})`
  return row.status
}

const KEY_LABELS: Record<SortKey, string> = {
  priority: 'Priority',
  criticality: 'Criticality',
  complexity: 'Complexity',
  effort: 'Effort',
  relevance: 'Relevance',
  minConfidence: 'Confidence',
  createdAt: 'Created',
  updatedAt: 'Updated',
  commentCount: 'Comments',
  number: 'Issue #',
}
const DATE_KEYS = new Set<SortKey>(['createdAt', 'updatedAt'])

function directionLabel(key: SortKey, direction: SortDirection): string {
  if (DATE_KEYS.has(key)) return direction === 'desc' ? 'newest→oldest' : 'oldest→newest'
  return direction === 'desc' ? 'high→low' : 'low→high'
}

export function formatOrder(order: SortRule[]): string {
  if (order.length === 0) return '—'
  return order.map((rule) => `${KEY_LABELS[rule.key]} (${directionLabel(rule.key, rule.direction)})`).join(', ')
}

export function formatWeights(w: PriorityWeights): string {
  return `Criticality ${w.criticality} · Relevance ${w.relevance} · Complexity ${w.complexity} (inverted) · Effort ${w.effort} (inverted)`
}

/** A short, readable summary of the active filter dimensions for the Scope line. */
export function describeFilter(filter: IssueFilter): string[] {
  const parts: string[] = []
  if (filter.criticality.length) parts.push(`Criticality: ${filter.criticality.join(', ')}`)
  if (filter.complexity.length) parts.push(`Complexity: ${filter.complexity.join(', ')}`)
  if (filter.effort.length) parts.push(`Effort: ${filter.effort.join(', ')}`)
  if (filter.kind.length) parts.push(`Kind: ${filter.kind.join(', ')}`)
  if (filter.relevanceMin > 0 && filter.relevanceMax < 100) {
    parts.push(`Relevance ${filter.relevanceMin}–${filter.relevanceMax}`)
  } else if (filter.relevanceMin > 0) {
    parts.push(`Relevance ≥ ${filter.relevanceMin}`)
  } else if (filter.relevanceMax < 100) {
    parts.push(`Relevance ≤ ${filter.relevanceMax}`)
  }
  if (filter.minConfidence > 0) parts.push(`Min confidence ≥ ${filter.minConfidence.toFixed(2)}`)
  if (filter.statuses.length) parts.push(`Status: ${filter.statuses.join(', ')}`)
  if (filter.labels.length) parts.push(`Labels: ${filter.labels.join(', ')}`)
  if (filter.text.trim()) parts.push(`Text: "${filter.text.trim()}"`)
  return parts
}

interface ExportPartition {
  /** Classified, not dismissed, in scope (all vs. filtered). Not yet sorted. */
  main: IssueRow[]
  /** Rows with no classification; always bypasses the filter (§2.6 item 3). */
  unclassified: IssueRow[]
  /** Dismissed rows, only when `includeDismissed` (§2.6 item 3). */
  dismissed: IssueRow[]
  /** `analysis.rows.length`, for the Scope line's "N of TOTAL issues". */
  total: number
}

/**
 * `orderMode: 'table'` (§2.6, FB export bug fix): runs the *exact* table
 * pipeline via `visibleRows` — `working.showDismissed` gates dismissal (not
 * `includeDismissed`), `filterRows(working.filter)` applies to every row with
 * no unclassified bypass, and `sortRowsBy(working.tableSort)` orders the
 * result — then buckets that single ordered list into the same three
 * sections, preserving the table's own order within each bucket. `scope`,
 * `includeDismissed` and `includeUnclassified` are not consulted: reusing
 * `visibleRows` directly means the export and the table can never drift
 * apart again.
 */
function partitionForTableExport(analysis: Analysis): ExportPartition {
  const tableRows = visibleRows(analysis, { filter: filterRows, sort: sortRowsBy })
  const dismissedSet = new Set(analysis.working.dismissed)
  const main: IssueRow[] = []
  const unclassified: IssueRow[] = []
  const dismissed: IssueRow[] = []
  for (const row of tableRows) {
    if (dismissedSet.has(row.issue.number)) dismissed.push(row)
    else if (row.classification === null) unclassified.push(row)
    else main.push(row)
  }
  return { main, unclassified, dismissed, total: analysis.rows.length }
}

/**
 * `orderMode: 'custom'`: splits `analysis.rows` into the export's three
 * sections (§2.6), independently of the table's own filter/sort/dismissal:
 *   1. Dismissed rows go to their own section, gated by `includeDismissed`,
 *      and never appear anywhere else.
 *   2. Of the rest, rows without a classification go to the Unclassified
 *      section, gated by `includeUnclassified`. They bypass the filter
 *      entirely: "Include unclassified issues" is a blanket toggle, not
 *      another filter dimension, so a narrowed filter (e.g. a relevance
 *      floor no unclassified row can satisfy) never has to empty that
 *      section for it to appear.
 *   3. Classified rows are the `main` section: `all` scope keeps every one,
 *      `filtered` scope applies `filterRows`.
 */
function partitionForCustomExport(analysis: Analysis, options: ExportOptions): ExportPartition {
  const dismissedSet = new Set(analysis.working.dismissed)
  const dismissed: IssueRow[] = []
  const remaining: IssueRow[] = []
  for (const row of analysis.rows) {
    if (dismissedSet.has(row.issue.number)) {
      if (options.includeDismissed) dismissed.push(row)
    } else {
      remaining.push(row)
    }
  }

  const classified = remaining.filter((row) => row.classification !== null)
  const unclassified = remaining.filter((row) => row.classification === null)
  const main = options.scope === 'filtered' ? filterRows(classified, analysis.working.filter) : classified

  return {
    main,
    unclassified: options.includeUnclassified ? unclassified : [],
    dismissed,
    total: analysis.rows.length,
  }
}

function partitionForExport(analysis: Analysis, options: ExportOptions): ExportPartition {
  return options.orderMode === 'table' ? partitionForTableExport(analysis) : partitionForCustomExport(analysis, options)
}

/** Every row that would appear in some section, for the "Nothing to export" gate (§2.6 edge cases). */
export function exportScopeCount(analysis: Analysis, options: ExportOptions): number {
  const partition = partitionForExport(analysis, options)
  return partition.main.length + partition.unclassified.length + partition.dismissed.length
}

/**
 * Distinct classification models behind the rows that would appear in the
 * export, in first-seen order (main rows, then unclassified — always
 * classification-less — then dismissed). `null` when nothing is classified;
 * a single label when every classified row shares one model; otherwise
 * `"mixed: A, B"` so two exports made with different models (e.g. Jev vs.
 * Kev) can be told apart at a glance.
 */
function describeClassifiedBy(rows: IssueRow[]): string | null {
  const seen: string[] = []
  for (const row of rows) {
    const model = row.classification?.model
    if (model && !seen.includes(model)) seen.push(model)
  }
  if (seen.length === 0) return null
  if (seen.length === 1) return seen[0]
  return `mixed: ${seen.join(', ')}`
}

/** Header + row data shared by every export renderer (see module doc above). */
export interface ExportModel {
  title: string
  /** `{owner}/{repo} ({stateFilter} issues)`, plus the analysis name suffix when renamed. */
  repository: string
  /** `YYYY-MM-DD HH:mm (local time)`, from the injected clock. */
  generated: string
  /** `{model} · questions v{n}` from the first classified row found; null when nothing is classified. */
  modelLine: string | null
  /** The model(s) behind every row in scope: a single label, `"mixed: A, B"`, or null. */
  classifiedBy: string | null
  /** The export order description, e.g. `Priority (high→low), Effort (low→high)` or `Same as table: …`. */
  order: string
  weights: string
  /** `{filtered view|all issues} — {main count} of {total} issues`, plus a filter suffix. */
  scope: string
  note: string
  /** Classified, not-dismissed rows, in the export's final order. */
  main: IssueRow[]
  /** Rows with no classification, in scope. */
  unclassified: IssueRow[]
  /** Dismissed rows, in scope. */
  dismissed: IssueRow[]
  priorityWeights: PriorityWeights
  options: ExportOptions
}

/**
 * Builds the full export model (§6.5 header lines + the three row sections)
 * for one analysis/options/clock combination. Pure and deterministic.
 */
export function buildExportModel(analysis: Analysis, options: ExportOptions, now: Date): ExportModel {
  const partition = partitionForExport(analysis, options)
  // In 'table' mode, `partition.main` is already in `visibleRows`' order
  // (`sortRowsBy(working.tableSort, ...)`); re-sorting by `options.order`
  // would ignore the live table sort the header/preview promise.
  const main =
    options.orderMode === 'table' ? partition.main : sortRowsBy(partition.main, options.order, analysis.working.priorityWeights)

  const repoLine = `${analysis.repo.fullName} (${analysis.stateFilter} issues)`
  const nameSuffix = analysis.name !== defaultAnalysisName(analysis) ? ` — "${analysis.name}"` : ''

  const modelRow = analysis.rows.find((row) => row.classification)
  const modelLine = modelRow?.classification
    ? `${modelRow.classification.model} · questions v${modelRow.classification.questionsVersion}`
    : null
  const classifiedBy = describeClassifiedBy([...main, ...partition.unclassified, ...partition.dismissed])

  const orderLine =
    options.orderMode === 'table' ? `Same as table: ${formatOrder(analysis.working.tableSort)}` : formatOrder(options.order)

  // `orderMode: 'table'` always applies `working.filter` (mirroring the
  // table), regardless of `options.scope`; only `'custom'` mode lets `scope`
  // pick between the filtered view and every issue.
  const scopeIsFiltered = options.orderMode === 'table' || options.scope === 'filtered'
  const filterParts = scopeIsFiltered ? describeFilter(analysis.working.filter) : []
  const scopeLabel = scopeIsFiltered ? 'filtered view' : 'all issues'
  const filterSuffix = filterParts.length > 0 ? ` (filters: ${filterParts.join(', ')})` : ''

  return {
    title: 'Issue Classifier report',
    repository: `${repoLine}${nameSuffix}`,
    generated: formatGenerated(now),
    modelLine,
    classifiedBy,
    order: orderLine,
    weights: formatWeights(analysis.working.priorityWeights),
    scope: `${scopeLabel} — ${main.length} of ${partition.total} issues${filterSuffix}`,
    note: NOTE_TEXT,
    main,
    unclassified: partition.unclassified,
    dismissed: partition.dismissed,
    priorityWeights: analysis.working.priorityWeights,
    options,
  }
}
