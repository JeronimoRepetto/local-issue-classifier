// Pure Markdown export formatter (see docs/export-format.md): built from the
// shared `ExportModel` (`exportModel.ts`), one GitHub-flavoured table per
// section. Meant to be pasted or dropped into an AI conversation, so titles
// and other third-party text are escaped rather than trusted. No Vue, no
// fetch, no storage, no browser APIs; only imports other domain modules (see
// docs/architecture.md).
import { confidenceText, formatDate, levelLabel, oneLine, priorityText, statusText, tableHeaders } from './exportModel'
import type { ExportModel } from './exportModel'
import type { ExportOptions, IssueRow, PriorityWeights } from './types'

/** Escapes text for a GFM table cell: one line only, `|` escaped so it can never split a column. */
function escapeCell(text: string): string {
  return oneLine(text).replace(/\|/g, '\\|')
}

function titleCell(row: IssueRow, includeUrls: boolean): string {
  const title = escapeCell(row.issue.title)
  return includeUrls ? `[${title}](${row.issue.htmlUrl})` : title
}

function rowCells(row: IssueRow, options: ExportOptions, weights: PriorityWeights): string[] {
  const c = row.classification
  const cells = [
    String(row.issue.number),
    titleCell(row, options.includeUrls),
    c ? c.kind.choice : '—',
    priorityText(c, weights),
    c ? levelLabel(c.criticality.level) : '—',
    c ? levelLabel(c.complexity.level) : '—',
    c ? levelLabel(c.effort.level) : '—',
    c ? `${c.relevance.value}/100` : '—',
  ]
  if (options.includeConfidence) cells.push(confidenceText(c))
  cells.push(escapeCell(statusText(row)), formatDate(row.issue.updatedAt))
  return cells
}

function buildTable(rows: IssueRow[], options: ExportOptions, weights: PriorityWeights): string {
  const headers = tableHeaders(options.includeConfidence)
  const headerLine = `| ${headers.join(' | ')} |`
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`
  const bodyLines = rows.map((row) => `| ${rowCells(row, options, weights).join(' | ')} |`)
  return [headerLine, dividerLine, ...bodyLines].join('\n')
}

function metadataLines(model: ExportModel): string[] {
  const lines = [`- **Repository:** ${model.repository}`, `- **Generated:** ${model.generated}`]
  if (model.classifiedBy) lines.push(`- **Classified by:** ${model.classifiedBy}`)
  lines.push(`- **Order:** ${model.order}`, `- **Scope:** ${model.scope}`, `- **Weights:** ${model.weights}`)
  return lines
}

/**
 * Builds the full Markdown report (see docs/export-format.md): an H1 title, a
 * metadata list, then one GFM table per non-empty section (Issues, then
 * Unclassified/Dismissed when they have rows). Pure and deterministic apart
 * from the injected `now` behind `model.generated`.
 */
export function formatExportMarkdown(model: ExportModel): string {
  const lines: string[] = [`# ${model.title}`, '', ...metadataLines(model), '']
  lines.push(`## Issues (${model.main.length})`, '', buildTable(model.main, model.options, model.priorityWeights))

  if (model.unclassified.length > 0) {
    lines.push('', `## Unclassified (${model.unclassified.length})`, '', buildTable(model.unclassified, model.options, model.priorityWeights))
  }
  if (model.dismissed.length > 0) {
    lines.push('', `## Dismissed (${model.dismissed.length})`, '', buildTable(model.dismissed, model.options, model.priorityWeights))
  }

  return `${lines.join('\n')}\n`
}
