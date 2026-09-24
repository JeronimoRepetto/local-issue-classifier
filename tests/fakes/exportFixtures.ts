// Shared fixtures for the export renderers' tests (exportModel.test.ts,
// exportMarkdown.test.ts, exportHtml.test.ts): the same three-issue analysis
// shape as exportText.test.ts's own `baseAnalysis()` (so all four renderer
// test suites describe the same underlying data), plus a mixed-model variant
// for "classified by" coverage (Jev vs. Kev-style comparison).
import { createAnalysis, updateWorking } from '../../src/domain/analysis'
import { defaultPreferences, defaultProjectContext } from '../../src/domain/types'
import type { Analysis, ExportOptions, IssueRow } from '../../src/domain/types'
import { fakeClassification, fakeIssue, fakeRepo } from './domainFixtures'

export function baseExportAnalysis(): Analysis {
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
        body: 'Steps to reproduce:\n1. Open an empty list\n2. Watch it crash',
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
        status: 'done' as const,
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
      return { ...row, status: 'error' as const, error: 'Rate limited — retried 3×' }
    }
    return row
  })

  return { ...analysis, rows, working: { ...analysis.working, dismissed: [999] } }
}

/** Same three issues, but #999 (dismissed) is also classified, with a different model. */
export function mixedModelExportAnalysis(): Analysis {
  const analysis = baseExportAnalysis()
  const rows = analysis.rows.map((row) => {
    if (row.issue.number === 999) {
      return {
        ...row,
        status: 'done' as const,
        classification: fakeClassification({ model: 'kev-latest' }),
      }
    }
    return row
  })
  return { ...analysis, rows }
}

export function withExportOptions(analysis: Analysis, patch: Partial<ExportOptions>): Analysis {
  return updateWorking(analysis, { exportOptions: { ...analysis.working.exportOptions, ...patch } }, analysis.updatedAt)
}
