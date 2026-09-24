// Pure plain-text export formatter (see docs/export-format.md). No Vue, no fetch, no
// storage, no browser APIs: the clock is always injected as `now`. Only
// imports other domain modules (see docs/architecture.md).
//
// The row partitioning and header metadata are shared with the Markdown and
// HTML renderers via `buildExportModel` (`exportModel.ts`) — this file adds
// only the plain-text-specific layout (fixed-width labels, the divider, the
// per-row block shape).
//
// The §6.5 Priority/Weights lines use `domain/priority.ts`'s `priorityOf`
// (Task 14, §4.9) directly, so this formatter and the table's own `priority`
// sort key (`domain/sort.ts`) share the exact same computation.
import { priorityOf } from './priority'
import { buildExportModel, formatDate, levelLabel, oneLine, pad2 } from './exportModel'
import type { ExportModel } from './exportModel'
import type { Analysis, Classification, ExportOptions, IssueRow, PriorityWeights } from './types'

export { exportScopeCount } from './exportModel'

const LABEL_WIDTH = 11
const DIVIDER = '='.repeat(72)

function labelLine(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)}: ${value}`
}

function confidenceSuffix(confidence: number | undefined, options: ExportOptions, withLabel: boolean): string {
  if (!options.includeConfidence || confidence === undefined) return ''
  const value = confidence.toFixed(2)
  return withLabel ? ` (conf ${value})` : ` (${value})`
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

function buildHeader(model: ExportModel): string {
  const lines = [model.title]
  lines.push(labelLine('Repository', model.repository))
  lines.push(labelLine('Generated', model.generated))
  if (model.modelLine) lines.push(labelLine('Model', model.modelLine))
  lines.push(labelLine('Order', model.order))
  lines.push(labelLine('Weights', model.weights))
  lines.push(labelLine('Scope', model.scope))
  lines.push(labelLine('Note', model.note))
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
  const model = buildExportModel(analysis, options, now)

  const blocks = [buildHeader(model), buildMainBlock(model.main, options, model.priorityWeights)]
  if (model.unclassified.length > 0) {
    blocks.push(buildCompactBlock(`Unclassified (${model.unclassified.length})`, model.unclassified))
  }
  if (model.dismissed.length > 0) {
    blocks.push(buildCompactBlock(`Dismissed (${model.dismissed.length})`, model.dismissed))
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
