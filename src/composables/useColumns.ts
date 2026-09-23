// Column visibility for the current analysis (design v2). It is stored in the
// analysis working state under `visibleColumns`, so it goes through
// `useAnalysis().updateWorking` and is saved and restored with the analysis,
// like the filters. The storage loader keeps working-state fields it does not
// know, and `resolveVisibleColumns` normalizes whatever comes back.
//
// `visibleColumns` is not declared on `AnalysisWorkingState` yet because
// src/domain/types.ts is being changed by a parallel lane; fold it into that
// interface (as `visibleColumns?: TableColumnId[]`) once both have merged.
import { computed } from 'vue'
import { useAnalysis } from './useAnalysis'
import { DEFAULT_VISIBLE_COLUMNS, resolveVisibleColumns, toggleColumn } from '../domain/columns'
import type { TableColumnId } from '../domain/columns'
import type { AnalysisWorkingState } from '../domain/types'

type ColumnsWorkingState = { visibleColumns?: TableColumnId[] }

export function useColumns() {
  const analysis = useAnalysis()

  const visible = computed<TableColumnId[]>(() => {
    const working = analysis.current.value?.working as (AnalysisWorkingState & ColumnsWorkingState) | undefined
    return resolveVisibleColumns(working?.visibleColumns)
  })

  function write(visibleColumns: TableColumnId[]): void {
    const patch: ColumnsWorkingState = { visibleColumns }
    analysis.updateWorking(patch as Partial<AnalysisWorkingState>)
  }

  return {
    visible,
    isVisible: (id: TableColumnId) => visible.value.includes(id),
    toggle: (id: TableColumnId) => write(toggleColumn(visible.value, id)),
    reset: () => write([...DEFAULT_VISIBLE_COLUMNS]),
  }
}
