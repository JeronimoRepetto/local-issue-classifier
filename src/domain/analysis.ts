// Pure Analysis functions. Every function returns a
// new object and never mutates its input; the clock is always injected as `now`.
import { defaultAnalysis } from './types'
import type {
  Analysis,
  AnalysisSummary,
  AnalysisWorkingState,
  Classification,
  ExportOrder,
  Issue,
  IssueFilter,
  IssueRow,
  Preferences,
  PriorityWeights,
  ProjectContext,
  Repo,
} from './types'

export interface CreateAnalysisParams {
  id: string
  repo: Repo
  stateFilter: Analysis['stateFilter']
  now: string
  prefs: Preferences
  projectContext: ProjectContext
  issues: Issue[] // stored form (§4.8)
  commentsFetched: boolean
}

/** What one GitHub fetch produced; the input of createAnalysis and mergeRefetch. */
export interface FetchedData {
  repo: Repo
  issues: Issue[]
  projectContext: ProjectContext
  commentsFetched: boolean
}

export type ClassificationOutcome =
  | { ok: true; classification: Classification }
  | { ok: false; error: string }

/** Injected by Tasks 12/13/14; the defaults below are identity functions. */
export type RowFilter = (rows: IssueRow[], filter: IssueFilter) => IssueRow[]
export type RowSort = (rows: IssueRow[], order: ExportOrder, weights: PriorityWeights) => IssueRow[]

export interface VisibleRowsOptions {
  filter?: RowFilter
  sort?: RowSort
}

function newRow(issue: Issue): IssueRow {
  return { issue, status: 'unclassified', classification: null, error: null, sourceStatus: 'present' }
}

/** Unique by issue number; the last occurrence wins, first-seen order is kept. */
function uniqueIssues(issues: Issue[]): Issue[] {
  const byNumber = new Map<number, Issue>()
  for (const issue of issues) byNumber.set(issue.number, issue)
  return [...byNumber.values()]
}

export function defaultAnalysisName(analysis: Pick<Analysis, 'repo' | 'stateFilter'>): string {
  return `${analysis.repo.fullName} (${analysis.stateFilter})`
}

export function createAnalysis(params: CreateAnalysisParams): Analysis {
  const { issues, projectContext, commentsFetched, ...rest } = params
  return {
    ...defaultAnalysis(rest),
    projectContext,
    commentsFetched,
    rows: uniqueIssues(issues).map(newRow),
  }
}

/**
 * Merge a re-fetch into an existing analysis (§2.3 step 7): new issues are
 * added, changed ones replaced (a kept classification becomes stale), unchanged
 * ones kept, and missing ones kept but flagged. Working state is untouched.
 */
export function mergeRefetch(analysis: Analysis, fetched: FetchedData, now: string): Analysis {
  const previous = new Map(analysis.rows.map((r) => [r.issue.number, r]))
  const fetchedIssues = uniqueIssues(fetched.issues)
  const seen = new Set<number>()

  const rows: IssueRow[] = fetchedIssues.map((issue) => {
    seen.add(issue.number)
    const old = previous.get(issue.number)
    if (!old) return newRow(issue)
    if (old.issue.updatedAt === issue.updatedAt) {
      return old.sourceStatus === 'present' ? old : { ...old, sourceStatus: 'present' }
    }
    return {
      ...old,
      issue,
      status: old.classification ? 'stale' : old.status === 'pending' ? 'unclassified' : old.status,
      sourceStatus: 'present',
    }
  })

  for (const old of analysis.rows) {
    if (seen.has(old.issue.number)) continue
    rows.push(old.sourceStatus === 'missing' ? old : { ...old, sourceStatus: 'missing' })
  }

  return {
    ...analysis,
    repo: fetched.repo,
    projectContext: fetched.projectContext,
    commentsFetched: fetched.commentsFetched,
    rows,
    fetchedAt: now,
    updatedAt: now,
  }
}

function mapRow(analysis: Analysis, issueNumber: number, fn: (row: IssueRow) => IssueRow, now: string): Analysis {
  const index = analysis.rows.findIndex((r) => r.issue.number === issueNumber)
  if (index < 0) return analysis
  const rows = analysis.rows.slice()
  rows[index] = fn(rows[index])
  return { ...analysis, rows, updatedAt: now }
}

export function applyClassification(
  analysis: Analysis,
  issueNumber: number,
  result: ClassificationOutcome,
  now: string,
): Analysis {
  return mapRow(
    analysis,
    issueNumber,
    (row) =>
      result.ok
        ? { ...row, status: 'done', classification: result.classification, error: null }
        : { ...row, status: 'error', error: result.error },
    now,
  )
}

/**
 * A classification is current only when it was made for this issue revision
 * and this questions version (§4.8 "Validity"). Runs on open and after refresh.
 * Does not touch `updatedAt`: it is a derived view, not a user change.
 */
export function markStale(analysis: Analysis, questionsVersion: number): Analysis {
  return {
    ...analysis,
    rows: analysis.rows.map((row) => {
      const c = row.classification
      if (!c || row.status !== 'done') return row
      const current = c.issueUpdatedAt === row.issue.updatedAt && c.questionsVersion === questionsVersion
      return current ? row : { ...row, status: 'stale' }
    }),
  }
}

export function updateWorking(analysis: Analysis, patch: Partial<AnalysisWorkingState>, now: string): Analysis {
  return { ...analysis, working: { ...analysis.working, ...patch }, updatedAt: now }
}

export function dismiss(analysis: Analysis, issueNumbers: number[], now: string): Analysis {
  const dismissed = [...analysis.working.dismissed]
  for (const n of issueNumbers) if (!dismissed.includes(n)) dismissed.push(n)
  return updateWorking(analysis, { dismissed }, now)
}

export function restore(analysis: Analysis, issueNumbers: number[], now: string): Analysis {
  const dismissed = analysis.working.dismissed.filter((n) => !issueNumbers.includes(n))
  return updateWorking(analysis, { dismissed }, now)
}

/** Permanently deletes rows flagged missing, and their dismissal entries (§2.5 item 5). */
export function removeMissing(analysis: Analysis, now: string): Analysis {
  const rows = analysis.rows.filter((r) => r.sourceStatus !== 'missing')
  const kept = new Set(rows.map((r) => r.issue.number))
  return {
    ...analysis,
    rows,
    working: { ...analysis.working, dismissed: analysis.working.dismissed.filter((n) => kept.has(n)) },
    updatedAt: now,
  }
}

/** An empty (or whitespace) name falls back to the default "owner/repo (state)". */
export function rename(analysis: Analysis, name: string, now: string): Analysis {
  const trimmed = name.trim()
  return { ...analysis, name: trimmed || defaultAnalysisName(analysis), updatedAt: now }
}

/** `approxBytes` comes from the store, which knows the serialized size. */
export function summarize(analysis: Analysis, approxBytes = 0): AnalysisSummary {
  const numbersPresent = new Set(analysis.rows.map((r) => r.issue.number))
  const count = (pred: (r: IssueRow) => boolean) => analysis.rows.filter(pred).length
  return {
    id: analysis.id,
    name: analysis.name,
    repoFullName: analysis.repo.fullName,
    stateFilter: analysis.stateFilter,
    fetchedAt: analysis.fetchedAt,
    updatedAt: analysis.updatedAt,
    counts: {
      total: analysis.rows.length,
      classified: count((r) => r.status === 'done'),
      stale: count((r) => r.status === 'stale'),
      dismissed: new Set(analysis.working.dismissed.filter((n) => numbersPresent.has(n))).size,
      missing: count((r) => r.sourceStatus === 'missing'),
    },
    approxBytes,
  }
}

const identityFilter: RowFilter = (rows) => rows
const identitySort: RowSort = (rows) => rows

/** Dismissal first, then the filter, then the sort (§3.1). */
export function visibleRows(analysis: Analysis, options: VisibleRowsOptions = {}): IssueRow[] {
  const { filter = identityFilter, sort = identitySort } = options
  const { working } = analysis
  const dismissed = new Set(working.dismissed)
  const afterDismissal = working.showDismissed
    ? analysis.rows.slice()
    : analysis.rows.filter((r) => !dismissed.has(r.issue.number))
  return sort(filter(afterDismissal, working.filter), working.tableSort, working.priorityWeights)
}
