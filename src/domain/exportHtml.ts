// Pure self-contained static HTML export formatter (see docs/export-format.md):
// built from the shared `ExportModel` plus a caller-supplied `css` string of
// CSS custom properties (light theme + a `prefers-color-scheme: dark` block).
// Domain code cannot import `src/ui/tokens.ts` (see docs/architecture.md), so
// the composable layer builds that stylesheet with `tokensToCss` and passes
// it in; this file only ever references it through `var(--…)`. The document
// has no external requests and no scripts, so it opens and renders fully on
// its own — titles and bodies are third-party text and are always escaped.
import { confidenceText, formatDate, levelLabel, oneLine, priorityText, statusText, tableHeaders } from './exportModel'
import type { ExportModel } from './exportModel'
import type { ExportOptions, IssueRow, PriorityWeights } from './types'

/** Structural + chip styling. References the injected `css`'s custom properties only. */
const STRUCTURAL_CSS = `* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 24px 16px 48px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.5;
}
h1 { font-size: 28px; margin: 0 0 16px; }
h2 { font-size: 18px; margin: 32px 0 8px; }
.report-meta { list-style: none; margin: 0 0 24px; padding: 0; display: grid; gap: 4px; font-size: 13px; }
.report-meta strong { font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--color-border); vertical-align: top; }
th { color: var(--color-text-muted); font-weight: 600; white-space: nowrap; }
a { color: var(--color-accent); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 4px; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; white-space: nowrap; }
.chip__dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
.chip--high { color: var(--color-level-high-fg); background: var(--color-level-high-bg); }
.chip--medium { color: var(--color-level-medium-fg); background: var(--color-level-medium-bg); }
.chip--low { color: var(--color-level-low-fg); background: var(--color-level-low-bg); }
details { margin-top: 4px; }
summary { cursor: pointer; color: var(--color-text-muted); }
details div { white-space: pre-wrap; color: var(--color-text-muted); margin-top: 4px; }
footer { margin-top: 40px; color: var(--color-text-muted); font-size: 13px; }`

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function chipHtml(level: string): string {
  return `<span class="chip chip--${level}"><span class="chip__dot" aria-hidden="true"></span>${escapeHtml(levelLabel(level))}</span>`
}

function td(content: string): string {
  return `<td>${content}</td>`
}

function titleCellHtml(row: IssueRow, options: ExportOptions): string {
  const title = escapeHtml(oneLine(row.issue.title))
  const link = options.includeUrls ? `<a href="${escapeHtml(row.issue.htmlUrl)}">${title}</a>` : title
  const body = options.includeBodies ? row.issue.body.trim() : ''
  const details = body ? `<details><summary>Body</summary><div>${escapeHtml(body)}</div></details>` : ''
  return td(`${link}${details}`)
}

function rowCellsHtml(row: IssueRow, options: ExportOptions, weights: PriorityWeights): string[] {
  const c = row.classification
  const cells = [
    td(String(row.issue.number)),
    titleCellHtml(row, options),
    td(c ? escapeHtml(c.kind.choice) : '—'),
    td(priorityText(c, weights)),
    td(c ? chipHtml(c.criticality.level) : '—'),
    td(c ? chipHtml(c.complexity.level) : '—'),
    td(c ? chipHtml(c.effort.level) : '—'),
    td(c ? `${c.relevance.value}/100` : '—'),
  ]
  if (options.includeConfidence) cells.push(td(confidenceText(c)))
  cells.push(td(escapeHtml(statusText(row))), td(formatDate(row.issue.updatedAt)))
  return cells
}

function buildHtmlTable(rows: IssueRow[], options: ExportOptions, weights: PriorityWeights): string {
  const headers = tableHeaders(options.includeConfidence)
  const headRow = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
  const bodyRows = rows.map((row) => `<tr>${rowCellsHtml(row, options, weights).join('')}</tr>`)
  return ['<table>', '<thead>', headRow, '</thead>', '<tbody>', ...bodyRows, '</tbody>', '</table>'].join('\n')
}

function renderSection(heading: string, rows: IssueRow[], options: ExportOptions, weights: PriorityWeights): string {
  return ['<section>', `<h2>${escapeHtml(heading)} (${rows.length})</h2>`, buildHtmlTable(rows, options, weights), '</section>'].join(
    '\n',
  )
}

function metaItems(model: ExportModel): string[] {
  const items = [
    `<li><strong>Repository:</strong> ${escapeHtml(model.repository)}</li>`,
    `<li><strong>Generated:</strong> ${escapeHtml(model.generated)}</li>`,
  ]
  if (model.classifiedBy) items.push(`<li><strong>Classified by:</strong> ${escapeHtml(model.classifiedBy)}</li>`)
  items.push(
    `<li><strong>Order:</strong> ${escapeHtml(model.order)}</li>`,
    `<li><strong>Scope:</strong> ${escapeHtml(model.scope)}</li>`,
    `<li><strong>Weights:</strong> ${escapeHtml(model.weights)}</li>`,
  )
  return items
}

/**
 * Builds the full self-contained HTML report (see docs/export-format.md): one
 * `<style>` block (the injected token `css` plus this module's structural/chip
 * CSS), a header with the same metadata as the Markdown export, one `<table>`
 * per non-empty section, and a footer. No scripts, no external requests: `css`
 * is the only thing the caller supplies, and it is CSS custom-property
 * declarations only. Pure and deterministic apart from the injected `now`
 * behind `model.generated`.
 */
export function formatExportHtml(model: ExportModel, css: string): string {
  const sections = [renderSection('Issues', model.main, model.options, model.priorityWeights)]
  if (model.unclassified.length > 0) {
    sections.push(renderSection('Unclassified', model.unclassified, model.options, model.priorityWeights))
  }
  if (model.dismissed.length > 0) {
    sections.push(renderSection('Dismissed', model.dismissed, model.options, model.priorityWeights))
  }

  const titleText = `${model.title} — ${model.repository}`

  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8" />',
    `<title>${escapeHtml(titleText)}</title>`,
    '<style>',
    css,
    '',
    STRUCTURAL_CSS,
    '</style>',
    '</head>',
    '<body>',
    '<header>',
    `<h1>${escapeHtml(model.title)}</h1>`,
    '<ul class="report-meta">',
    ...metaItems(model),
    '</ul>',
    '</header>',
    '<main>',
    ...sections,
    '</main>',
    '<footer>',
    '<p>Generated by local-issue-classifier</p>',
    '</footer>',
    '</body>',
    '</html>',
  ]

  return `${lines.join('\n')}\n`
}
