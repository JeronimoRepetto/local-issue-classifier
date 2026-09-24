// Export options for the current analysis (see docs/export-format.md). Like useFilters,
// everything lives in `AnalysisWorkingState.exportOptions`, so it goes
// through `useAnalysis().updateWorking` and is restored automatically
// whenever the analysis is reopened (Task 7's debounced, coalesced save).
import { computed } from 'vue'
import { useAnalysis } from './useAnalysis'
import { exportFilenameStem, exportScopeCount, formatExport } from '../domain/exportText'
import { downloadText } from '../adapters/download'
import { resolveExportOptions } from '../domain/types'
import type { ExportOptions, ExportOrder } from '../domain/types'

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
    return current ? formatExport(current, options.value, clock()) : ''
  })

  const scopeCount = computed(() => {
    const current = analysis.current.value
    return current ? exportScopeCount(current, options.value) : 0
  })

  function download(): void {
    const current = analysis.current.value
    if (!current) return
    const stem = exportFilenameStem(current, clock())
    downloadText(previewText.value, `${stem}.txt`)
  }

  return { options, setOptions, setOrder, useCurrentTableSort, previewText, scopeCount, download }
}
