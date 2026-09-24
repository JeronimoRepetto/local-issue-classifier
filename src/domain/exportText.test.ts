// Task 13 — SPEC.md §2.6, §6.5: the pure plain-text export formatter. The
// golden fixture is generated and audited by hand against the format rules
// (§6.5 "Format rules"), then locked; the Generated line is normalized to a
// placeholder before comparison since it carries the injected clock.
// Read via Vite's `?raw` import (a relative specifier), not `node:fs`: a
// domain co-located test may only import `vitest` besides relative modules
// (tests/architecture.test.ts).
import { describe, expect, it } from 'vitest'
import golden from '../../tests/fixtures/export/basic-report.txt?raw'
import { exportFilenameStem, exportScopeCount, formatExport } from './exportText'
import { createAnalysis, updateWorking, visibleRows } from './analysis'
import { filterRows } from './filter'
import { sortRowsBy } from './sort'
import { defaultExportOptions, defaultFilter, defaultPreferences, defaultProjectContext } from './types'
import type { Analysis, ExportOptions, IssueRow } from './types'
import { fakeClassification, fakeIssue, fakeRepo } from '../../tests/fakes/domainFixtures'

const GENERATED_LINE_RE = /^Generated {2}: .*$/m

function normalizeGenerated(text: string): string {
  return text.replace(GENERATED_LINE_RE, 'Generated  : <TIMESTAMP>')
}

/** Issue numbers of every main-section entry (` 1. #NNN  ...`), in order. */
function mainNumbers(text: string): number[] {
  return [...text.matchAll(/^ *\d+\.\s+#(\d+)/gm)].map((m) => Number(m[1]))
}

/** Issue numbers inside one compact section ("Unclassified (N)" / "Dismissed (N)"), in order. */
function sectionNumbers(text: string, marker: 'Unclassified' | 'Dismissed'): number[] {
  const start = text.indexOf(`${marker} (`)
  if (start === -1) return []
  const rest = text.slice(start)
  const end = rest.indexOf('\n\n')
  const block = end === -1 ? rest : rest.slice(0, end)
  return [...block.matchAll(/#(\d+)/g)].map((m) => Number(m[1]))
}

function baseAnalysis(): Analysis {
  const analysis = createAnalysis({
    id: 'a1',
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-09-01T00:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [
      fakeIssue(812, {
        title: 'Crash when rendering empty list',
        labels: ['bug', 'regression'],
        author: 'jdoe',
        createdAt: '2026-09-02T00:00:00Z',
        updatedAt: '2026-09-20T00:00:00Z',
        commentCount: 3,
        htmlUrl: 'https://github.com/acme/widgets/issues/812',
      }),
      fakeIssue(815, {
        title: 'Add Svelte adapter',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
      }),
      fakeIssue(999, { title: 'Old debug helper' }),
    ],
    commentsFetched: true,
  })

  const rows: IssueRow[] = analysis.rows.map((row) => {
    if (row.issue.number === 812) {
      return {
        ...row,
        status: 'done',
        classification: fakeClassification({
          criticality: { level: 'high', score: 1.8, confidence: 0.91, probabilities: [0, 0, 1] },
          complexity: { level: 'medium', score: 0.9, confidence: 0.74, probabilities: [0, 1, 0] },
          effort: { level: 'low', score: 0.4, confidence: 0.82, probabilities: [1, 0, 0] },
          relevance: { value: 88, score: 3.5, confidence: 0.77, probabilities: [0, 0, 0, 1, 0] },
          kind: { choice: 'bug', confidence: 0.9 },
          minConfidence: 0.74,
          model: 'jev-1.13.0',
          questionsVersion: 1,
        }),
      }
    }
    if (row.issue.number === 815) {
      return { ...row, status: 'error', error: 'Rate limited — retried 3×' }
    }
    return row
  })

  return { ...analysis, rows, working: { ...analysis.working, dismissed: [999] } }
}

function withOptions(analysis: Analysis, patch: Partial<ExportOptions>): Analysis {
  return updateWorking(analysis, { exportOptions: { ...analysis.working.exportOptions, ...patch } }, analysis.updatedAt)
}

describe('formatExport — golden file (SPEC.md §6.5)', () => {
  it('matches tests/fixtures/export/basic-report.txt byte-for-byte, apart from the Generated line', () => {
    const analysis = withOptions(
      updateWorking(baseAnalysis(), { filter: { ...defaultFilter(), relevanceMin: 50 } }, '2026-09-01T00:00:00Z'),
      {
        orderMode: 'custom',
        scope: 'filtered',
        order: [
          { key: 'priority', direction: 'desc' },
          { key: 'effort', direction: 'asc' },
        ],
        includeDismissed: true,
        includeUnclassified: true,
        includeConfidence: true,
        includeUrls: true,
      },
    )

    const actual = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(normalizeGenerated(actual)).toBe(golden)
  })
})

describe('formatExport — format rules', () => {
  it('uses LF line endings only, and ends with exactly one trailing newline', () => {
    const analysis = baseAnalysis()
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).not.toMatch(/\r/)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })

  it('forces a title with CRLF and tabs onto one line', () => {
    const analysis = baseAnalysis()
    analysis.rows[0].issue.title = 'Crash\r\nwhen\tempty'
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).toContain('#812  Crash when empty')
  })

  it('omits confidence parentheticals entirely when includeConfidence is false', () => {
    const analysis = withOptions(baseAnalysis(), { includeConfidence: false })
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).toContain('Criticality: HIGH · Complexity: MEDIUM · Effort: LOW')
    expect(text).toContain('Relevance  : 88/100 · Kind: bug')
    expect(text).not.toMatch(/conf/)
  })

  it('omits the URL line entirely when includeUrls is false, with no empty placeholder', () => {
    const analysis = withOptions(baseAnalysis(), { includeUrls: false })
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).not.toContain('https://')
  })

  it('shows "—" for Priority when every weight is 0', () => {
    const analysis = { ...baseAnalysis(), working: { ...baseAnalysis().working, priorityWeights: { criticality: 0, relevance: 0, complexity: 0, effort: 0 } } }
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).toContain('Priority   : —')
  })

  it('uses singular "comment" for exactly one comment', () => {
    const analysis = baseAnalysis()
    analysis.rows[0].issue.commentCount = 1
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).toMatch(/· 1 comment(?!s)/)
  })

  it('carries the analysis name in the Repository line when it differs from the default', () => {
    const analysis = { ...baseAnalysis(), name: 'My private triage' }
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).toContain('Repository : acme/widgets (open issues) — "My private triage"')
  })

  it('scope "all" ignores the working filter and includes every non-dismissed classified row', () => {
    const analysis = withOptions(
      updateWorking(baseAnalysis(), { filter: { ...defaultFilter(), relevanceMin: 95 } }, '2026-09-01T00:00:00Z'),
      { orderMode: 'custom', scope: 'all' },
    )
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).toContain('#812')
    expect(text).toContain('all issues — 1 of 3 issues')
  })
})

// Reported bug: the export used a separate default order (defaultExportOptions'
// order) instead of the table's own pipeline, so it could show different rows in
// a different order than what the user was looking at. `orderMode: 'table'`
// (the default) fixes this by running the *exact* table pipeline — dismissal
// gated by `working.showDismissed`, `filterRows(working.filter)` with no
// unclassified bypass, `sortRowsBy(working.tableSort)` — via `visibleRows`
// itself, so the two can never drift apart again.
describe('formatExport — orderMode "table" (bug fix: export must match the table)', () => {
  function tableOrderAnalysis(): Analysis {
    const analysis = createAnalysis({
      id: 'a2',
      repo: fakeRepo(),
      stateFilter: 'open',
      now: '2026-09-01T00:00:00Z',
      prefs: defaultPreferences(),
      projectContext: defaultProjectContext('acme/widgets'),
      issues: [301, 302, 303, 304, 305, 306].map((n) => fakeIssue(n)),
      commentsFetched: true,
    })

    function classify(n: number, overrides: Parameters<typeof fakeClassification>[0]): void {
      const row = analysis.rows.find((r) => r.issue.number === n)
      if (!row) throw new Error(`fixture bug: no row #${n}`)
      row.status = 'done'
      row.classification = fakeClassification(overrides)
    }

    const high = { level: 'high' as const, score: 2, confidence: 0.9, probabilities: [0, 0, 1] as [number, number, number] }
    classify(301, { criticality: high, relevance: { value: 80, score: 3.2, confidence: 0.8, probabilities: [0, 0, 0, 1, 0] } })
    classify(302, { criticality: high, relevance: { value: 20, score: 0.8, confidence: 0.8, probabilities: [1, 0, 0, 0, 0] } })
    classify(305, { criticality: high, relevance: { value: 50, score: 2, confidence: 0.8, probabilities: [0, 0, 1, 0, 0] } })
    classify(306, { criticality: { level: 'medium', score: 1, confidence: 0.9, probabilities: [0, 1, 0] } })
    // 303 and 304 stay unclassified.

    return updateWorking(
      analysis,
      {
        // Narrows to criticality=high: 303/304 (unclassified) and 306 (medium) all fail it.
        filter: { ...defaultFilter(), criticality: ['high'] },
        tableSort: [
          { key: 'criticality', direction: 'desc' },
          { key: 'relevance', direction: 'asc' },
        ],
        showDismissed: true,
        dismissed: [304, 305],
      },
      analysis.updatedAt,
    )
  }

  it('produces exactly visibleRows() row set and order: filter + multi-key sort + dismissed + unclassified', () => {
    const analysis = tableOrderAnalysis()
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))

    const tableRows = visibleRows(analysis, { filter: filterRows, sort: sortRowsBy })
    const dismissedSet = new Set(analysis.working.dismissed)
    const expectedMain = tableRows
      .filter((r) => !dismissedSet.has(r.issue.number) && r.classification !== null)
      .map((r) => r.issue.number)
    const expectedUnclassified = tableRows
      .filter((r) => !dismissedSet.has(r.issue.number) && r.classification === null)
      .map((r) => r.issue.number)
    const expectedDismissed = tableRows.filter((r) => dismissedSet.has(r.issue.number)).map((r) => r.issue.number)

    // Sanity on the fixture itself, so a future edit to it fails loudly here
    // instead of silently changing what the regression below actually covers.
    expect(expectedMain).toEqual([302, 301])
    expect(expectedUnclassified).toEqual([])
    expect(expectedDismissed).toEqual([305])

    expect(mainNumbers(text)).toEqual(expectedMain)
    expect(sectionNumbers(text, 'Unclassified')).toEqual(expectedUnclassified)
    expect(sectionNumbers(text, 'Dismissed')).toEqual(expectedDismissed)
  })

  it('does not let unclassified rows bypass the working filter (regression)', () => {
    const analysis = tableOrderAnalysis()
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    // 303 is unclassified and not dismissed; the old export always showed it
    // ("Include unclassified" bypassed the filter entirely). The table never
    // did, so in table mode neither should the export.
    expect(text).not.toContain('#303')
  })

  it('dismissed rows follow working.showDismissed, not options.includeDismissed', () => {
    const shown = withOptions(tableOrderAnalysis(), { includeDismissed: false })
    const textShown = formatExport(shown, shown.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(sectionNumbers(textShown, 'Dismissed')).toEqual([305]) // shown despite includeDismissed: false

    const hidden = withOptions(
      updateWorking(tableOrderAnalysis(), { showDismissed: false }, '2026-09-01T00:00:00Z'),
      { includeDismissed: true },
    )
    const textHidden = formatExport(hidden, hidden.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(sectionNumbers(textHidden, 'Dismissed')).toEqual([]) // hidden despite includeDismissed: true
    expect(textHidden).not.toContain('#305')
  })

  it('ignores options.scope: the table filter always applies, never "all issues"', () => {
    const analysis = withOptions(tableOrderAnalysis(), { scope: 'all' })
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).not.toContain('#303')
    expect(text).not.toContain('#304')
    expect(text).not.toContain('#306')
  })

  it('the Order header line describes the live table sort, not options.order', () => {
    const analysis = withOptions(tableOrderAnalysis(), { order: [{ key: 'number', direction: 'asc' }] })
    const text = formatExport(analysis, analysis.working.exportOptions, new Date('2026-09-23T14:05:00'))
    expect(text).toContain('Order      : Same as table: Criticality (high→low), Relevance (low→high)')
  })

  it('exportScopeCount matches visibleRows().length exactly', () => {
    const analysis = tableOrderAnalysis()
    const expected = visibleRows(analysis, { filter: filterRows, sort: sortRowsBy }).length
    expect(expected).toBe(3) // 301, 302 (main) + 305 (dismissed, shown); 303/304/306 filtered out
    expect(exportScopeCount(analysis, analysis.working.exportOptions)).toBe(expected)
  })
})

describe('exportScopeCount — "Nothing to export" gating (SPEC.md §2.6 edge cases)', () => {
  it('counts every row that would appear in any section', () => {
    const analysis = withOptions(baseAnalysis(), {
      orderMode: 'custom',
      includeDismissed: true,
      includeUnclassified: true,
    })
    expect(exportScopeCount(analysis, analysis.working.exportOptions)).toBe(3) // main + unclassified + dismissed
  })

  it('excludes dismissed rows by default (includeDismissed defaults to false, §2.6)', () => {
    const analysis = baseAnalysis()
    expect(analysis.working.exportOptions.includeDismissed).toBe(false)
    expect(exportScopeCount(analysis, analysis.working.exportOptions)).toBe(2) // main + unclassified only
  })

  it('is 0 when scope excludes everything', () => {
    const analysis = withOptions(baseAnalysis(), {
      orderMode: 'custom',
      scope: 'filtered',
      includeUnclassified: false,
      includeDismissed: false,
    })
    const filtered = updateWorking(analysis, { filter: { ...defaultFilter(), relevanceMin: 95 } }, analysis.updatedAt)
    expect(exportScopeCount(filtered, filtered.working.exportOptions)).toBe(0)
  })
})

describe('exportFilenameStem (SPEC.md §2.6 item 4)', () => {
  it('builds {owner}-{repo}-issues-{YYYYMMDD-HHmm}', () => {
    const analysis = baseAnalysis()
    expect(exportFilenameStem(analysis, new Date('2026-09-23T14:05:00'))).toBe('acme-widgets-issues-20260923-1405')
  })
})

describe('defaultExportOptions (sanity: unchanged by Task 13, SPEC.md §2.6)', () => {
  it('matches the confirmed §2.6 defaults', () => {
    expect(defaultExportOptions()).toEqual({
      order: [
        { key: 'criticality', direction: 'desc' },
        { key: 'relevance', direction: 'desc' },
        { key: 'effort', direction: 'asc' },
      ],
      orderMode: 'table',
      scope: 'filtered',
      includeUnclassified: true,
      includeDismissed: false,
      includeConfidence: true,
      includeUrls: true,
    })
  })
})
