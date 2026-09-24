// buildExportModel: the shared row partition + header metadata behind all
// three export renderers (see docs/export-format.md). formatExport's own
// golden test (exportText.test.ts) already proves the partition/order/header
// numbers are correct for 'table' and 'custom' mode; this file covers what's
// new here — the model's shape, and the "classified by" aggregation that only
// the Markdown/HTML renderers use.
import { describe, expect, it } from 'vitest'
import { buildExportModel } from './exportModel'
import { updateWorking } from './analysis'
import { defaultFilter } from './types'
import { baseExportAnalysis, mixedModelExportAnalysis, withExportOptions } from '../../tests/fakes/exportFixtures'

const NOW = new Date('2026-09-23T14:05:00')

describe('buildExportModel — sections', () => {
  it('partitions main / unclassified / dismissed like formatExport does', () => {
    const analysis = withExportOptions(
      updateWorking(baseExportAnalysis(), { filter: { ...defaultFilter(), relevanceMin: 50 } }, '2026-09-01T00:00:00Z'),
      { orderMode: 'custom', scope: 'filtered', includeDismissed: true, includeUnclassified: true },
    )
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)

    expect(model.main.map((r) => r.issue.number)).toEqual([812])
    expect(model.unclassified.map((r) => r.issue.number)).toEqual([815])
    expect(model.dismissed.map((r) => r.issue.number)).toEqual([999])
  })

  it('carries the priority weights and the resolved options alongside the rows', () => {
    const analysis = baseExportAnalysis()
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    expect(model.priorityWeights).toEqual(analysis.working.priorityWeights)
    expect(model.options).toBe(analysis.working.exportOptions)
  })
})

describe('buildExportModel — header metadata', () => {
  it('matches the same repository/generated/order/weights/scope text formatExport builds', () => {
    const analysis = withExportOptions(
      updateWorking(baseExportAnalysis(), { filter: { ...defaultFilter(), relevanceMin: 50 } }, '2026-09-01T00:00:00Z'),
      {
        orderMode: 'custom',
        scope: 'filtered',
        order: [
          { key: 'priority', direction: 'desc' },
          { key: 'effort', direction: 'asc' },
        ],
      },
    )
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)

    expect(model.title).toBe('Issue Classifier report')
    expect(model.repository).toBe('acme/widgets (open issues)')
    expect(model.generated).toBe('2026-09-23 14:05 (local time)')
    expect(model.order).toBe('Priority (high→low), Effort (low→high)')
    expect(model.weights).toBe('Criticality 40 · Relevance 30 · Complexity 15 (inverted) · Effort 15 (inverted)')
    expect(model.scope).toBe('filtered view — 1 of 3 issues (filters: Relevance ≥ 50)')
    expect(model.modelLine).toBe('jev-1.13.0 · questions v1')
  })

  it('carries the analysis name suffix when the analysis was renamed', () => {
    const analysis = { ...baseExportAnalysis(), name: 'My private triage' }
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    expect(model.repository).toBe('acme/widgets (open issues) — "My private triage"')
  })

  it('modelLine is null when nothing is classified yet', () => {
    const analysis = baseExportAnalysis()
    const rows = analysis.rows.map((r) => ({ ...r, classification: null, status: 'unclassified' as const }))
    const model = buildExportModel({ ...analysis, rows }, analysis.working.exportOptions, NOW)
    expect(model.modelLine).toBeNull()
  })
})

describe('buildExportModel — classifiedBy (new: compares two exports made by different models)', () => {
  it('is a single label when every classified row shares one model', () => {
    const analysis = withExportOptions(baseExportAnalysis(), { includeDismissed: true, orderMode: 'custom' })
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    expect(model.classifiedBy).toBe('jev-1.13.0')
  })

  it('is "mixed: A, B" (first-seen order) when classified rows use different models', () => {
    const analysis = withExportOptions(mixedModelExportAnalysis(), { includeDismissed: true, orderMode: 'custom' })
    const model = buildExportModel(analysis, analysis.working.exportOptions, NOW)
    expect(model.classifiedBy).toBe('mixed: jev-1.13.0, kev-latest')
  })

  it('is null when nothing in scope is classified', () => {
    const analysis = baseExportAnalysis()
    const rows = analysis.rows.map((r) => ({ ...r, classification: null, status: 'unclassified' as const }))
    const model = buildExportModel({ ...analysis, rows }, analysis.working.exportOptions, NOW)
    expect(model.classifiedBy).toBeNull()
  })

  it('never lists the same model twice', () => {
    const analysis = withExportOptions(baseExportAnalysis(), { includeDismissed: true, orderMode: 'custom' })
    // #999 is dismissed and unclassified in the base fixture; classify it with
    // the SAME model as #812 to prove dedupe, not just the mixed case above.
    const rows = analysis.rows.map((r) =>
      r.issue.number === 999 ? { ...r, status: 'done' as const, classification: analysis.rows[0].classification } : r,
    )
    const model = buildExportModel({ ...analysis, rows }, analysis.working.exportOptions, NOW)
    expect(model.classifiedBy).toBe('jev-1.13.0')
  })
})
