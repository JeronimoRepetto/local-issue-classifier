// Task 7 — SPEC.md §3.1 / §2.3 / §2.5: pure analysis functions.
import { describe, expect, it } from 'vitest'
import {
  applyClassification,
  createAnalysis,
  dismiss,
  markStale,
  mergeRefetch,
  removeMissing,
  rename,
  restore,
  summarize,
  updateWorking,
  visibleRows,
} from './analysis'
import type { Analysis, IssueRow } from './types'
import { defaultPreferences, defaultProjectContext } from './types'
import { deepFreeze, fakeClassification, fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'

const T0 = '2026-03-01T10:00:00Z'
const T1 = '2026-03-02T10:00:00Z'
const CTX = defaultProjectContext('acme/widgets')

function base(issues = [fakeIssue(1), fakeIssue(2), fakeIssue(3)]): Analysis {
  return createAnalysis({
    id: 'a-1',
    repo: fakeRepo(),
    stateFilter: 'open',
    now: T0,
    prefs: defaultPreferences(),
    projectContext: CTX,
    issues,
    commentsFetched: true,
  })
}

function classified(a: Analysis, n: number): Analysis {
  return applyClassification(a, n, { ok: true, classification: fakeClassification() }, T0)
}

function row(a: Analysis, n: number): IssueRow {
  const found = a.rows.find((r) => r.issue.number === n)
  if (!found) throw new Error(`row ${n} not found`)
  return found
}

function numbers(rows: IssueRow[]): number[] {
  return rows.map((r) => r.issue.number)
}

describe('createAnalysis', () => {
  it('builds an analysis with one unclassified present row per issue', () => {
    const a = base()
    expect(a.schemaVersion).toBe(1)
    expect(a.id).toBe('a-1')
    expect(a.name).toBe('acme/widgets (open)')
    expect(a.createdAt).toBe(T0)
    expect(a.updatedAt).toBe(T0)
    expect(a.fetchedAt).toBe(T0)
    expect(a.commentsFetched).toBe(true)
    expect(a.projectContext).toEqual(CTX)
    expect(numbers(a.rows)).toEqual([1, 2, 3])
    for (const r of a.rows) {
      expect(r).toMatchObject({ status: 'unclassified', classification: null, error: null, sourceStatus: 'present' })
    }
    expect(a.working.dismissed).toEqual([])
  })

  it('keeps issue numbers unique (last occurrence wins)', () => {
    const a = base([fakeIssue(1, { title: 'old' }), fakeIssue(1, { title: 'new' })])
    expect(a.rows).toHaveLength(1)
    expect(a.rows[0].issue.title).toBe('new')
  })
})

describe('mergeRefetch', () => {
  const cases: {
    name: string
    fetched: number[]
    changed?: number[]
    expected: Record<number, Partial<IssueRow> & { title?: string }>
  }[] = [
    {
      name: 'new issue → added as unclassified',
      fetched: [1, 2, 3, 4],
      expected: { 4: { status: 'unclassified', classification: null, sourceStatus: 'present' } },
    },
    {
      name: 'changed issue with a classification → data replaced, classification kept, stale',
      fetched: [1, 2, 3],
      changed: [1],
      expected: { 1: { status: 'stale', sourceStatus: 'present', title: 'changed 1' } },
    },
    {
      name: 'changed issue without a classification → stays unclassified',
      fetched: [1, 2, 3],
      changed: [2],
      expected: { 2: { status: 'unclassified', classification: null, title: 'changed 2' } },
    },
    {
      name: 'unchanged issue → keeps everything',
      fetched: [1, 2, 3],
      expected: { 1: { status: 'done', sourceStatus: 'present', title: 'Issue 1' } },
    },
    {
      name: 'missing issue → kept and flagged missing',
      fetched: [1, 2],
      expected: { 3: { status: 'unclassified', sourceStatus: 'missing' } },
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const before = deepFreeze(classified(base(), 1))
      const issues = c.fetched.map((n) =>
        c.changed?.includes(n)
          ? fakeIssue(n, { title: `changed ${n}`, updatedAt: '2026-03-01T00:00:00Z' })
          : fakeIssue(n),
      )
      const after = mergeRefetch(before, { repo: fakeRepo(), issues, projectContext: CTX, commentsFetched: false }, T1)
      for (const [n, exp] of Object.entries(c.expected)) {
        const { title, ...rest } = exp
        const r = row(after, Number(n))
        expect(r).toMatchObject(rest)
        if (title) expect(r.issue.title).toBe(title)
      }
      expect(after.fetchedAt).toBe(T1)
      expect(after.updatedAt).toBe(T1)
      expect(after.createdAt).toBe(T0)
      expect(after.commentsFetched).toBe(false)
    })
  }

  it('keeps the classification of a changed issue', () => {
    const before = classified(base(), 1)
    const after = mergeRefetch(
      before,
      { repo: fakeRepo(), issues: [fakeIssue(1, { updatedAt: '2026-03-01T00:00:00Z' })], projectContext: CTX, commentsFetched: true },
      T1,
    )
    expect(row(after, 1).classification).toEqual(fakeClassification())
  })

  it('orders fetched issues first, then missing ones in their previous order', () => {
    const after = mergeRefetch(
      base(),
      { repo: fakeRepo(), issues: [fakeIssue(4), fakeIssue(2)], projectContext: CTX, commentsFetched: true },
      T1,
    )
    expect(numbers(after.rows)).toEqual([4, 2, 1, 3])
  })

  it('marks a previously missing issue present again when it reappears', () => {
    const once = mergeRefetch(base(), { repo: fakeRepo(), issues: [fakeIssue(1)], projectContext: CTX, commentsFetched: true }, T1)
    expect(row(once, 2).sourceStatus).toBe('missing')
    const twice = mergeRefetch(
      once,
      { repo: fakeRepo(), issues: [fakeIssue(1), fakeIssue(2)], projectContext: CTX, commentsFetched: true },
      T1,
    )
    expect(row(twice, 2).sourceStatus).toBe('present')
  })

  it('preserves working state: dismissals, filter, sort, export options and weights', () => {
    let a = dismiss(base(), [2], T0)
    a = updateWorking(
      a,
      {
        filter: { ...a.working.filter, text: 'crash' },
        tableSort: [{ key: 'number', direction: 'asc' }],
        exportOptions: { ...a.working.exportOptions, includeUrls: false },
        priorityWeights: { criticality: 10, relevance: 20, complexity: 30, effort: 40 },
      },
      T0,
    )
    const working = structuredClone(a.working)
    const after = mergeRefetch(
      deepFreeze(a),
      { repo: fakeRepo(), issues: [fakeIssue(1), fakeIssue(9)], projectContext: CTX, commentsFetched: true },
      T1,
    )
    expect(after.working).toEqual(working)
  })

  it('updates the repo metadata and project context', () => {
    const ctx = { ...CTX, readmeExcerpt: 'Widgets!' }
    const after = mergeRefetch(
      base(),
      { repo: fakeRepo({ description: 'new' }), issues: [], projectContext: ctx, commentsFetched: true },
      T1,
    )
    expect(after.repo.description).toBe('new')
    expect(after.projectContext.readmeExcerpt).toBe('Widgets!')
  })
})

describe('applyClassification', () => {
  it('stores a successful result as done', () => {
    const b = applyClassification(deepFreeze(base()), 2, { ok: true, classification: fakeClassification() }, T1)
    expect(row(b, 2)).toMatchObject({ status: 'done', error: null })
    expect(row(b, 2).classification).toEqual(fakeClassification())
    expect(b.updatedAt).toBe(T1)
  })

  it('stores a failure as error with its message', () => {
    const b = applyClassification(base(), 2, { ok: false, error: 'Timeout' }, T1)
    expect(row(b, 2)).toMatchObject({ status: 'error', error: 'Timeout' })
  })

  it('returns the same analysis for an unknown issue number', () => {
    const a = base()
    expect(applyClassification(a, 99, { ok: false, error: 'x' }, T1)).toBe(a)
  })
})

describe('markStale', () => {
  it('marks classifications from another questions version or issue revision as stale', () => {
    let a = classified(classified(base(), 1), 2)
    a = applyClassification(a, 3, { ok: true, classification: fakeClassification({ questionsVersion: 0 }) }, T0)
    a = { ...a, rows: a.rows.map((r) => (r.issue.number === 2 ? { ...r, issue: { ...r.issue, updatedAt: 'later' } } : r)) }
    const b = markStale(deepFreeze(a), 1)
    expect(row(b, 1).status).toBe('done')
    expect(row(b, 2).status).toBe('stale')
    expect(row(b, 3).status).toBe('stale')
  })
})

describe('dismiss / restore / removeMissing / rename', () => {
  it('dismiss then restore round-trips without touching the rows', () => {
    const a = deepFreeze(base())
    const d = dismiss(a, [1, 3], T1)
    expect(d.working.dismissed).toEqual([1, 3])
    expect(d.updatedAt).toBe(T1)
    expect(dismiss(d, [1], T1).working.dismissed).toEqual([1, 3])
    const r = restore(d, [1, 3], T1)
    expect(r.working.dismissed).toEqual([])
    expect(r.rows).toEqual(a.rows)
  })

  it('removeMissing deletes only missing rows and their dismissals', () => {
    let a = mergeRefetch(base(), { repo: fakeRepo(), issues: [fakeIssue(1)], projectContext: CTX, commentsFetched: true }, T0)
    a = dismiss(a, [1, 2], T0)
    const b = removeMissing(deepFreeze(a), T1)
    expect(numbers(b.rows)).toEqual([1])
    expect(b.working.dismissed).toEqual([1])
    expect(b.updatedAt).toBe(T1)
  })

  it('rename trims and falls back to the default name when empty', () => {
    const a = deepFreeze(base())
    expect(rename(a, '  Triage  ', T1).name).toBe('Triage')
    expect(rename(a, '   ', T1).name).toBe('acme/widgets (open)')
    expect(rename(a, 'x', T1).updatedAt).toBe(T1)
  })
})

describe('summarize', () => {
  it('counts total, classified, stale, dismissed and missing', () => {
    let a = base([fakeIssue(1), fakeIssue(2), fakeIssue(3), fakeIssue(4)])
    a = classified(classified(a, 1), 2)
    a = mergeRefetch(
      a,
      {
        repo: fakeRepo(),
        issues: [fakeIssue(1), fakeIssue(2, { updatedAt: 'later' }), fakeIssue(3)],
        projectContext: CTX,
        commentsFetched: true,
      },
      T1,
    )
    a = dismiss(a, [3, 42], T1) // 42 is not a row and is not counted
    expect(summarize(a, 1234)).toEqual({
      id: 'a-1',
      name: 'acme/widgets (open)',
      repoFullName: 'acme/widgets',
      stateFilter: 'open',
      fetchedAt: T1,
      updatedAt: T1,
      counts: { total: 4, classified: 1, stale: 1, dismissed: 1, missing: 1 },
      approxBytes: 1234,
    })
  })
})

describe('visibleRows', () => {
  it('hides dismissed rows unless showDismissed is on', () => {
    const a = dismiss(base(), [2], T0)
    expect(numbers(visibleRows(a))).toEqual([1, 3])
    expect(numbers(visibleRows(updateWorking(a, { showDismissed: true }, T0)))).toEqual([1, 2, 3])
  })

  it('applies dismissal, then the filter, then the sort', () => {
    const calls: string[] = []
    const a = deepFreeze(dismiss(base(), [2], T0))
    const result = visibleRows(a, {
      filter: (rows, filter) => {
        calls.push(`filter:${numbers(rows).join(',')}:${filter.text}`)
        return rows.filter((r) => r.issue.number !== 1)
      },
      sort: (rows, order, weights) => {
        calls.push(`sort:${numbers(rows).join(',')}:${order[0].key}:${weights.criticality}`)
        return [...rows].reverse()
      },
    })
    expect(calls).toEqual(['filter:1,3:', 'sort:3:criticality:40'])
    expect(numbers(result)).toEqual([3])
  })
})

describe('immutability', () => {
  it('never mutates its input', () => {
    const a = deepFreeze(classified(base(), 1))
    const snapshot = structuredClone(a)
    mergeRefetch(a, { repo: fakeRepo(), issues: [fakeIssue(1, { updatedAt: 'x' })], projectContext: CTX, commentsFetched: true }, T1)
    applyClassification(a, 2, { ok: true, classification: fakeClassification() }, T1)
    markStale(a, 2)
    dismiss(a, [1], T1)
    restore(a, [1], T1)
    removeMissing(a, T1)
    rename(a, 'n', T1)
    updateWorking(a, { showDismissed: true }, T1)
    summarize(a)
    visibleRows(a)
    expect(a).toEqual(snapshot)
  })
})
