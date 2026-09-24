// Export options for the current analysis (see docs/export-format.md). Like useFilters,
// everything lives in `AnalysisWorkingState.exportOptions`, so it goes
// through `useAnalysis().updateWorking` and is restored automatically
// whenever the analysis is reopened (Task 7's debounced, coalesced save).
//
// Three renderers share one `ExportModel` (`domain/exportModel.ts`):
// `options.format` picks plain text (`formatExport`), Markdown
// (`formatExportMarkdown`) or self-contained HTML (`formatExportHtml`). The
// HTML renderer needs a CSS string of token custom properties; domain code
// cannot import `src/ui/tokens.ts` (see docs/architecture.md), so this
// composable builds it here and passes it in.
import { computed } from 'vue'
import { useAnalysis } from './useAnalysis'
import { exportFilenameStem, exportScopeCount, formatExport } from '../domain/exportText'
import { buildExportModel } from '../domain/exportModel'
import { formatExportMarkdown } from '../domain/exportMarkdown'
import { formatExportHtml } from '../domain/exportHtml'
import { downloadText } from '../adapters/download'
import { resolveExportOptions } from '../domain/types'
import { tokens, tokensToCss } from '../ui/tokens'
import type { ExportFormat, ExportOptions, ExportOrder } from '../domain/types'

const EXTENSION: Record<ExportFormat, string> = { text: 'txt', markdown: 'md', html: 'html' }
const MIME: Record<ExportFormat, string> = {
  text: 'text/plain;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  html: 'text/html;charset=utf-8',
}

function indentBlock(css: string, spaces = 2): string {
  const pad = ' '.repeat(spaces)
  return css
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n')
}

/** Light theme vars at `:root`, plus a `prefers-color-scheme: dark` override (docs/export-format.md). */
function buildHtmlCss(): string {
  const light = tokensToCss(tokens, 'light', ':root')
  const dark = tokensToCss(tokens, 'dark', ':root')
  return `${light}\n\n@media (prefers-color-scheme: dark) {\n${indentBlock(dark)}\n}`
}

/** Dependency injection for the clock (Generated line, filename stamp), like `configureAnalysis`. */
export interface ExportConfig {
  clock?: () => Date
}

let clock: () => Date = () => new Date()

export function configureExport(config: ExportConfig): void {
  if (config.clock) clock = config.clock
}

export function useExport() {
  const analysis = useAnalysis()

  const options = computed<ExportOptions>(() => resolveExportOptions(analysis.current.value?.working.exportOptions))

  function setOptions(patch: Partial<ExportOptions>): void {
    analysis.updateWorking({ exportOptions: { ...options.value, ...patch } })
  }

  function setOrder(order: ExportOrder): void {
    setOptions({ order })
  }

  /** Imports the table's current multi-key sort as the export order (§2.5 item 3). */
  function useCurrentTableSort(): void {
    const current = analysis.current.value
    if (!current) return
    setOrder(current.working.tableSort.map((rule) => ({ ...rule })))
  }

  const previewText = computed(() => {
    const current = analysis.current.value
    if (!current) return ''
    switch (options.value.format) {
      case 'markdown':
        return formatExportMarkdown(buildExportModel(current, options.value, clock()))
      case 'html':
        return formatExportHtml(buildExportModel(current, options.value, clock()), buildHtmlCss())
      default:
        return formatExport(current, options.value, clock())
    }
  })

  const scopeCount = computed(() => {
    const current = analysis.current.value
    return current ? exportScopeCount(current, options.value) : 0
  })

  function download(): void {
    const current = analysis.current.value
    if (!current) return
    const stem = exportFilenameStem(current, clock())
    const format = options.value.format
    const filename = `${stem}.${EXTENSION[format]}`
    // Kept a 2-arg call for the 'text' format (downloadText's own default MIME),
    // unchanged from before 'format' existed.
    if (format === 'text') downloadText(previewText.value, filename)
    else downloadText(previewText.value, filename, MIME[format])
  }

  return { options, setOptions, setOrder, useCurrentTableSort, previewText, scopeCount, download }
}
