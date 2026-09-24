// Pure plain-text export formatter (see docs/export-format.md). No Vue, no fetch, no
// storage, no browser APIs: the clock is always injected as `now`. Only
// imports other domain modules (see docs/architecture.md).
//
// The §6.5 Priority/Weights lines use `domain/priority.ts`'s `priorityOf`
// (Task 14, §4.9) directly, so this formatter and the table's own `priority`
// sort key (`domain/sort.ts`) share the exact same computation.
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
  Level,
  PriorityWeights,
  SortDirection,
  SortKey,
  SortRule,
} from './types'

const LABEL_WIDTH = 11
const DIVIDER = '='.repeat(72)
const NOTE_TEXT =
  'Levels, relevance and priority are model-based estimates; relevance and priority are ordinal 0–100 signals.'

/** Forces a title onto one line (§6.5 "Titles are forced onto one line"). */
function oneLine(title: string): string {
  return title.replace(/\r\n|\r|\n|\t/g, ' ')
}

function labelLine(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)}: ${value}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** "Dates are YYYY-MM-DD" (§6.5); ISO 8601 strings already start with that shape. */
function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

/** "The header's generated time uses the local time zone" (§6.5). */
function formatGenerated(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())} (local time)`
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

function formatOrder(order: SortRule[]): string {
  if (order.length === 0) return '—'
  return order.map((rule) => `${KEY_LABELS[rule.key]} (${directionLabel(rule.key, rule.direction)})`).join(', ')
}

function formatWeights(w: PriorityWeights): string {
  return `Criticality ${w.criticality} · Relevance ${w.relevance} · Complexity ${w.complexity} (inverted) · Effort ${w.effort} (inverted)`
}

/** A short, readable summary of the active filter dimensions for the Scope line. */
function describeFilter(filter: IssueFilter): string[] {
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

function confidenceSuffix(confidence: number | undefined, options: ExportOptions, withLabel: boolean): string {
  if (!options.includeConfidence || confidence === undefined) return ''
  const value = confidence.toFixed(2)
  return withLabel ? ` (conf ${value})` : ` (${value})`
}

function levelLabel(level: Level): string {
  return level.toUpperCase()
}

function buildMainEntry(
  row: IssueRow,
  index: number,
  width: number,
  options: ExportOptions,
  weights: PriorityWeights,
): string {
  // Guaranteed non-null: `partitionForExport` puts only classified rows in `main`.
  const c = row.classification as Classification
  const idx = String(index + 1).padStart(width, ' ')
  const title = oneLine(row.issue.title)
  const priority = priorityOf(c, weights)

  const line1 = `${idx}. #${row.issue.number}  ${title}`
  const line2 = labelLine('Priority', priority === null ? '—' : `${priority}/100`)
  const line3 = labelLine(
    'Criticality',
    `${levelLabel(c.criticality.level)}${confidenceSuffix(c.criticality.confidence, options, true)} · ` +
      `Complexity: ${levelLabel(c.complexity.level)}${confidenceSuffix(c.complexity.confidence, options, true)} · ` +
      `Effort: ${levelLabel(c.effort.level)}${confidenceSuffix(c.effort.confidence, options, true)}`,
  )
  const labels = row.issue.labels.length > 0 ? row.issue.labels.join(', ') : '—'
  const line4 = labelLine(
    'Relevance',
    `${c.relevance.value}/100${confidenceSuffix(c.relevance.confidence, options, false)} · Kind: ${c.kind.choice} · Labels: ${labels}`,
  )
  const commentWord = row.issue.commentCount === 1 ? 'comment' : 'comments'
  const line5 =
    `    Opened ${formatDate(row.issue.createdAt)} by @${row.issue.author} · ` +
    `updated ${formatDate(row.issue.updatedAt)} · ${row.issue.commentCount} ${commentWord}`

  const lines = [line1, `    ${line2}`, `    ${line3}`, `    ${line4}`, line5]
  if (options.includeUrls) lines.push(`    ${row.issue.htmlUrl}`)
  return lines.join('\n')
}

/** The compact one-line form shared by the Unclassified and Dismissed sections (§6.5). */
function compactLine(row: IssueRow): string {
  const title = oneLine(row.issue.title)
  const reason = row.status === 'error' && row.error ? ` (not classified: ${row.error})` : ''
  return ` -  #${row.issue.number}  ${title}${reason}`
}

function buildHeader(analysis: Analysis, options: ExportOptions, mainCount: number, total: number, now: Date): string {
  const lines = ['local-issue-classifier report']

  const repoLine = `${analysis.repo.fullName} (${analysis.stateFilter} issues)`
  const nameSuffix = analysis.name !== defaultAnalysisName(analysis) ? ` — "${analysis.name}"` : ''
  lines.push(labelLine('Repository', `${repoLine}${nameSuffix}`))
  lines.push(labelLine('Generated', formatGenerated(now)))

  const modelRow = analysis.rows.find((row) => row.classification)
  if (modelRow?.classification) {
    lines.push(labelLine('Model', `${modelRow.classification.model} · questions v${modelRow.classification.questionsVersion}`))
  }

  const orderLine =
    options.orderMode === 'table' ? `Same as table: ${formatOrder(analysis.working.tableSort)}` : formatOrder(options.order)
  lines.push(labelLine('Order', orderLine))
  lines.push(labelLine('Weights', formatWeights(analysis.working.priorityWeights)))

  // `orderMode: 'table'` always applies `working.filter` (mirroring the
  // table), regardless of `options.scope`; only `'custom'` mode lets `scope`
  // pick between the filtered view and every issue.
  const scopeIsFiltered = options.orderMode === 'table' || options.scope === 'filtered'
  const filterParts = scopeIsFiltered ? describeFilter(analysis.working.filter) : []
  const scopeLabel = scopeIsFiltered ? 'filtered view' : 'all issues'
  const filterSuffix = filterParts.length > 0 ? ` (filters: ${filterParts.join(', ')})` : ''
  lines.push(labelLine('Scope', `${scopeLabel} — ${mainCount} of ${total} issues${filterSuffix}`))

  lines.push(labelLine('Note', NOTE_TEXT))
  return lines.join('\n')
}

function buildMainBlock(rows: IssueRow[], options: ExportOptions, weights: PriorityWeights): string {
  const width = Math.max(2, String(rows.length).length)
  const entries = rows.map((row, index) => buildMainEntry(row, index, width, options, weights))
  return [DIVIDER, entries.join('\n\n')].join('\n')
}

function buildCompactBlock(title: string, rows: IssueRow[]): string {
  return [DIVIDER, title, ...rows.map(compactLine)].join('\n')
}

/**
 * Builds the full plain-text report (§6.5). Pure: `now` is always injected.
 * Byte-for-byte deterministic apart from the Generated line.
 */
export function formatExport(analysis: Analysis, options: ExportOptions, now: Date): string {
  const partition = partitionForExport(analysis, options)
  // In 'table' mode, `partition.main` is already in `visibleRows`' order
  // (`sortRowsBy(working.tableSort, ...)`); re-sorting by `options.order`
  // would ignore the live table sort the header/preview promise.
  const sortedMain =
    options.orderMode === 'table' ? partition.main : sortRowsBy(partition.main, options.order, analysis.working.priorityWeights)

  const blocks = [
    buildHeader(analysis, options, sortedMain.length, partition.total, now),
    buildMainBlock(sortedMain, options, analysis.working.priorityWeights),
  ]
  if (partition.unclassified.length > 0) {
    blocks.push(buildCompactBlock(`Unclassified (${partition.unclassified.length})`, partition.unclassified))
  }
  if (partition.dismissed.length > 0) {
    blocks.push(buildCompactBlock(`Dismissed (${partition.dismissed.length})`, partition.dismissed))
  }

  return `${blocks.join('\n\n')}\n`
}

function slug(part: string): string {
  return part.trim().replace(/[^\w-]+/g, '-').toLowerCase() || 'x'
}

/** `{owner}-{repo}-issues-{YYYYMMDD-HHmm}` (§2.6 item 4), without the `.txt` extension. */
export function exportFilenameStem(analysis: Analysis, now: Date): string {
  const owner = slug(analysis.repo.ref.owner)
  const repo = slug(analysis.repo.ref.repo)
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`
  return `${owner}-${repo}-issues-${stamp}`
}
