// Column visibility for the current analysis (design v2). It is stored in the
// analysis working state under `visibleColumns` (typed on
// `AnalysisWorkingState`), so it goes through `useAnalysis().updateWorking`
// and is saved and restored with the analysis, like the filters.
// `resolveVisibleColumns` normalizes whatever comes back, so an older saved
// analysis (with no `visibleColumns` field) tolerantly falls back to the
// defaults.
import { computed } from 'vue'
import { useAnalysis } from './useAnalysis'
import { DEFAULT_VISIBLE_COLUMNS, resolveVisibleColumns, toggleColumn } from '../domain/columns'
import type { TableColumnId } from '../domain/columns'

export function useColumns() {
  const analysis = useAnalysis()

  const visible = computed<TableColumnId[]>(() =>
    resolveVisibleColumns(analysis.current.value?.working.visibleColumns),
  )

  function write(visibleColumns: TableColumnId[]): void {
    analysis.updateWorking({ visibleColumns })
  }

  return {
    visible,
    isVisible: (id: TableColumnId) => visible.value.includes(id),
    toggle: (id: TableColumnId) => write(toggleColumn(visible.value, id)),
    reset: () => write([...DEFAULT_VISIBLE_COLUMNS]),
  }
}
