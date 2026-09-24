// The Markdown export formatter (see docs/export-format.md): built from the
// shared `ExportModel` (`exportModel.ts`), feeding an AI or another tool a
// GitHub-flavoured-table report. The golden fixture describes the exact same
// analysis/options as exportText.test.ts's own golden test, so the two can be
// compared line-for-line by hand; the Generated line is normalized first,
// like the text golden.
import { describe, expect, it } from 'vitest'
import golden from '../../tests/fixtures/export/basic-report.md?raw'
import { formatExportMarkdown } from './exportMarkdown'
import { buildExportModel } from './exportModel'
import { updateWorking } from './analysis'
import { defaultFilter } from './types'
import { baseExportAnalysis, mixedModelExportAnalysis, withExportOptions } from '../../tests/fakes/exportFixtures'

const NOW = new Date('2026-09-23T14:05:00')
const GENERATED_LINE_RE = /^- \*\*Generated:\*\* .*$/m

function normalizeGenerated(text: string): string {
  return text.replace(GENERATED_LINE_RE, '- **Generated:** <TIMESTAMP>')
}

describe('formatExportMarkdown — golden file (see docs/export-format.md)', () => {
  it('matches tests/fixtures/export/basic-report.md byte-for-byte, apart from the Generated line', () => {
    const analysis = withExportOptions(
      updateWorking(baseExportAnalysis(), { filter: { ...defaultFilter(), relevanceMin: 50 } }, '2026-09-01T00:00:00Z'),
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

    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    const actual = formatExportMarkdown(model)
    expect(normalizeGenerated(actual)).toBe(golden)
  })
})

describe('formatExportMarkdown — format rules', () => {
  it('starts with an H1 title and ends with exactly one trailing newline', () => {
    const analysis = baseExportAnalysis()
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    expect(text.startsWith('# local-issue-classifier report\n')).toBe(true)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })

  it('lists the metadata in order: repository, generated, classified by, order, scope, weights', () => {
    const analysis = baseExportAnalysis()
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    const labels = [...text.matchAll(/^- \*\*(.+?):\*\*/gm)].map((m) => m[1])
    expect(labels).toEqual(['Repository', 'Generated', 'Classified by', 'Order', 'Scope', 'Weights'])
  })

  it('omits the "Classified by" line entirely when nothing is classified', () => {
    const analysis = baseExportAnalysis()
    const rows = analysis.rows.map((r) => ({ ...r, classification: null, status: 'unclassified' as const }))
    const model = buildExportModel({ ...analysis, rows }, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    expect(text).not.toContain('Classified by')
  })

  it('shows "mixed: A, B" when the exported rows were classified by different models', () => {
    const analysis = withExportOptions(mixedModelExportAnalysis(), { includeDismissed: true, orderMode: 'custom' })
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    expect(text).toContain('- **Classified by:** mixed: jev-1.13.0, kev-latest')
  })

  it('every table has the same header row: #, Title, Kind, Priority, Criticality, Complexity, Effort, Relevance, Confidence, Status, Updated', () => {
    const analysis = withExportOptions(baseExportAnalysis(), { includeDismissed: true, orderMode: 'custom' })
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    const headerLines = text.split('\n').filter((line) => line.startsWith('| #'))
    expect(headerLines.length).toBeGreaterThan(0)
    for (const line of headerLines) {
      expect(line).toBe(
        '| # | Title | Kind | Priority | Criticality | Complexity | Effort | Relevance | Confidence | Status | Updated |',
      )
    }
  })

  it('omits the Confidence column entirely when includeConfidence is false', () => {
    const analysis = withExportOptions(baseExportAnalysis(), { includeConfidence: false })
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    expect(text).not.toContain('Confidence')
  })

  it('renders the title as a link when includeUrls is true, plain text otherwise', () => {
    const withUrls = withExportOptions(baseExportAnalysis(), { includeUrls: true })
    const withoutUrls = withExportOptions(baseExportAnalysis(), { includeUrls: false })
    const textWith = formatExportMarkdown(buildExportModel(withUrls, withUrls.working.exportOptions, NOW))
    const textWithout = formatExportMarkdown(buildExportModel(withoutUrls, withoutUrls.working.exportOptions, NOW))
    expect(textWith).toContain('[Crash when rendering empty list](https://github.com/acme/widgets/issues/812)')
    expect(textWithout).toContain('| Crash when rendering empty list |')
    expect(textWithout).not.toContain('https://')
  })

  it('omits the Unclassified/Dismissed sections entirely when they are empty', () => {
    const analysis = baseExportAnalysis() // includeDismissed defaults to false; every row unclassified/classified
    const rows = analysis.rows.map((r) =>
      r.issue.number === 815 ? { ...r, status: 'done' as const, classification: analysis.rows[0].classification, error: null } : r,
    )
    const model = buildExportModel({ ...analysis, rows }, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    expect(text).not.toContain('## Unclassified')
    expect(text).not.toContain('## Dismissed')
  })
})

describe('formatExportMarkdown — escaping (titles are third-party text)', () => {
  it('escapes a pipe character in the title so it cannot break the table', () => {
    const analysis = baseExportAnalysis()
    analysis.rows[0].issue.title = 'Crash | when | piped'
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    expect(text).toContain('Crash \\| when \\| piped')
  })

  it('forces a title with embedded newlines onto one line before escaping', () => {
    const analysis = baseExportAnalysis()
    analysis.rows[0].issue.title = 'Crash\r\nwhen\nempty'
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    const text = formatExportMarkdown(model)
    expect(text).toContain('Crash when empty')
    expect(text).not.toMatch(/Crash[\s\S]*\n[\s\S]*when/)
  })
})
