// Filter, sort and search state for the current analysis (SPEC.md §2.5).
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
  const sort = computed<SortRule | null>(() => analysis.current.value?.working.tableSort[0] ?? null)

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

  return { filter, sort, setFilter, resetFilters, setSearch, setSort }
}
