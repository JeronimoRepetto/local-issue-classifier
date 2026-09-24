// Filter, sort and search state for the current analysis.
// Everything lives in `AnalysisWorkingState`, so it goes through
// `useAnalysis().updateWorking` and is restored automatically whenever the
// analysis is reopened (Task 7's debounced, coalesced save/load).
import { computed } from 'vue'
import { useAnalysis } from './useAnalysis'
import { defaultFilter } from '../domain/types'
import type { IssueFilter, SortDirection, SortKey, SortRule } from '../domain/types'

/** The sole sort key/direction Task 12 persists (single-key, §2.5 item 3). */
function defaultDirectionFor(_key: SortKey): SortDirection {
  // Every column defaults to its "most interesting first" reading on a first
  // click: highest score, most recent date, biggest count. A second click on
  // the same column (see setSort) reverses it.
  return 'desc'
}

export function useFilters() {
  const analysis = useAnalysis()

  const filter = computed<IssueFilter>(() => analysis.current.value?.working.filter ?? defaultFilter())
  /** The full multi-key order (Task 13); `[]` when no analysis is current. */
  const tableSort = computed<SortRule[]>(() => analysis.current.value?.working.tableSort ?? [])
  const sort = computed<SortRule | null>(() => tableSort.value[0] ?? null)

  function setFilter(patch: Partial<IssueFilter>): void {
    analysis.updateWorking({ filter: { ...filter.value, ...patch } })
  }

  function resetFilters(): void {
    analysis.updateWorking({ filter: defaultFilter() })
  }

  function setSearch(text: string): void {
    setFilter({ text })
  }

  /** A click sets `key` as the sole sort rule; a second click on it reverses direction. */
  function setSort(key: SortKey, direction?: SortDirection): void {
    const current = sort.value
    const next: SortDirection =
      direction ?? (current?.key === key ? (current.direction === 'asc' ? 'desc' : 'asc') : defaultDirectionFor(key))
    analysis.updateWorking({ tableSort: [{ key, direction: next }] })
  }

  /**
   * Replaces the full multi-key order (Task 13): the "Sort" popover's
   * `SortRuleList` edits the whole list, so it writes it back wholesale.
   */
  function setTableSort(order: SortRule[]): void {
    analysis.updateWorking({ tableSort: order })
  }

  /**
   * Shift-click on a column header ("Shift-clicking adds
   * the column as the next key"). A no-op when `key` is already part of the
   * order — shift-clicking an existing key does not move or reverse it; the
   * Sort popover's reorder/direction controls own that.
   */
  function addSortKey(key: SortKey): void {
    if (tableSort.value.some((rule) => rule.key === key)) return
    setTableSort([...tableSort.value, { key, direction: defaultDirectionFor(key) }])
  }

  return { filter, sort, tableSort, setFilter, resetFilters, setSearch, setSort, setTableSort, addSortKey }
}
