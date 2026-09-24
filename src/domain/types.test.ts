// Task 3 — domain model: defaultX() factories and STORAGE_KEYS.
import { describe, expect, it } from 'vitest'
import {
  STORAGE_KEYS,
  STORAGE_PREFIX,
  defaultAnalysis,
  defaultExportOptions,
  defaultFilter,
  defaultPreferences,
  defaultPriorityWeights,
  defaultProjectContext,
  defaultSecrets,
  defaultTableSort,
  defaultWorkingState,
  resolveExportOptions,
} from './types'
import type { ExportOptions, Repo } from './types'
import { DEFAULT_VISIBLE_COLUMNS } from './columns'

function fakeRepo(): Repo {
  return {
    ref: { owner: 'acme', repo: 'widgets' },
    fullName: 'acme/widgets',
    description: null,
    topics: [],
    defaultBranch: 'main',
    isPrivate: false,
    hasIssues: true,
    openIssuesCount: 0,
    htmlUrl: 'https://github.com/acme/widgets',
  }
}

describe('defaultSecrets', () => {
  it('returns empty strings', () => {
    expect(defaultSecrets()).toEqual({ jevApiKey: '', githubToken: '' })
  })

  it('returns a fresh object each call', () => {
    const a = defaultSecrets()
    const b = defaultSecrets()
    a.jevApiKey = 'leaked'
    expect(b.jevApiKey).toBe('')
  })
})

describe('defaultPreferences', () => {
  it('has the documented defaults', () => {
    const prefs = defaultPreferences()
    expect(prefs.lastRepo).toBe('')
    expect(prefs.lastAnalysisId).toBeNull()
    expect(prefs.includeClosedByDefault).toBe(false)
    expect(prefs.fetchComments).toBe('auto')
    expect(prefs.maxCommentsPerIssue).toBe(8)
    expect(prefs.maxIssuesToLoad).toBe(1000)
    expect(prefs.concurrency).toBe(4)
    expect(prefs.jevModel).toBe('jev-latest')
    expect(prefs.lowConfidenceThreshold).toBe(0.5)
    expect(prefs.classifyMode).toBe('batched')
    expect(prefs.trimmingFloor).toBe('minimal')
    expect(prefs.theme).toBe('system')
    expect(prefs.onboarding).toEqual({ keys: false, repo: false, classify: false })
    expect(prefs.keysBannerDismissed).toBe(false)
    expect(prefs.hardwareOverride).toBeNull()
    expect(prefs.defaultExportOptions).toEqual(defaultExportOptions())
  })

  it('returns fresh, unshared nested objects each call', () => {
    const a = defaultPreferences()
    const b = defaultPreferences()
    a.onboarding.keys = true
    a.defaultExportOptions.order.push({ key: 'number', direction: 'asc' })
    expect(b.onboarding.keys).toBe(false)
    expect(b.defaultExportOptions.order).toHaveLength(3)
  })
})

describe('defaultFilter', () => {
  it('has empty filters and full relevance range', () => {
    const filter = defaultFilter()
    expect(filter.complexity).toEqual([])
    expect(filter.criticality).toEqual([])
    expect(filter.effort).toEqual([])
    expect(filter.kind).toEqual([])
    expect(filter.relevanceMin).toBe(0)
    expect(filter.relevanceMax).toBe(100)
    expect(filter.minConfidence).toBe(0)
    expect(filter.statuses).toEqual([])
    expect(filter.labels).toEqual([])
    expect(filter.text).toBe('')
  })

  it('returns fresh arrays each call', () => {
    const a = defaultFilter()
    const b = defaultFilter()
    a.labels.push('bug')
    a.complexity.push('high')
    a.kind.push('bug')
    expect(b.labels).toEqual([])
    expect(b.complexity).toEqual([])
    expect(b.kind).toEqual([])
  })
})

describe('defaultTableSort / defaultExportOptions', () => {
  const expectedOrder = [
    { key: 'criticality', direction: 'desc' },
    { key: 'relevance', direction: 'desc' },
    { key: 'effort', direction: 'asc' },
  ]

  it('defaultTableSort matches the export default order', () => {
    expect(defaultTableSort()).toEqual(expectedOrder)
  })

  it('defaultExportOptions seeds scope=filtered, orderMode=table and the same order', () => {
    const options = defaultExportOptions()
    expect(options.order).toEqual(expectedOrder)
    expect(options.orderMode).toBe('table')
    expect(options.scope).toBe('filtered')
    expect(options.includeDismissed).toBe(false)
  })

  it('returns fresh order arrays each call', () => {
    const a = defaultTableSort()
    const b = defaultTableSort()
    a.push({ key: 'number', direction: 'asc' })
    expect(b).toHaveLength(3)

    const x = defaultExportOptions()
    const y = defaultExportOptions()
    x.order.push({ key: 'number', direction: 'asc' })
    expect(y.order).toHaveLength(3)
  })
})

describe('resolveExportOptions (FB export: tolerant loading of older working state)', () => {
  it('returns defaultExportOptions() when nothing is stored', () => {
    expect(resolveExportOptions(undefined)).toEqual(defaultExportOptions())
  })

  it('fills in orderMode: "table" for an older stored value that predates the field', () => {
    const stored = defaultExportOptions()
    delete (stored as Partial<ExportOptions>).orderMode
    expect(resolveExportOptions(stored).orderMode).toBe('table')
    // every other field is passed through unchanged
    expect(resolveExportOptions(stored)).toEqual({ ...defaultExportOptions(), orderMode: 'table' })
  })

  it('leaves an explicit orderMode untouched', () => {
    const stored: ExportOptions = { ...defaultExportOptions(), orderMode: 'custom' }
    expect(resolveExportOptions(stored).orderMode).toBe('custom')
  })
})

describe('defaultPriorityWeights', () => {
  it('is criticality 40, relevance 30, complexity 15, effort 15', () => {
    expect(defaultPriorityWeights()).toEqual({
      criticality: 40,
      relevance: 30,
      complexity: 15,
      effort: 15,
    })
  })

  it('returns a fresh object each call', () => {
    const a = defaultPriorityWeights()
    const b = defaultPriorityWeights()
    a.criticality = 0
    expect(b.criticality).toBe(40)
  })
})

describe('defaultProjectContext', () => {
  it('seeds the name and leaves the rest empty', () => {
    const ctx = defaultProjectContext('acme/widgets')
    expect(ctx.name).toBe('acme/widgets')
    expect(ctx.description).toBeNull()
    expect(ctx.topics).toEqual([])
    expect(ctx.manifest).toEqual({ source: null, name: null, description: null })
    expect(ctx.readmeExcerpt).toBeNull()
    expect(ctx.contributingExcerpt).toBeNull()
    expect(ctx.docsIndex).toEqual([])
  })

  it('returns fresh arrays each call', () => {
    const a = defaultProjectContext('acme/widgets')
    const b = defaultProjectContext('acme/widgets')
    a.topics.push('cli')
    a.docsIndex.push('intro.md')
    expect(b.topics).toEqual([])
    expect(b.docsIndex).toEqual([])
  })
})

describe('defaultWorkingState', () => {
  it('seeds exportOptions from prefs, and fresh filter/sort/weights/dismissed', () => {
    const prefs = defaultPreferences()
    const working = defaultWorkingState(prefs)
    expect(working.exportOptions).toEqual(prefs.defaultExportOptions)
    expect(working.exportOptions).not.toBe(prefs.defaultExportOptions)
    expect(working.filter).toEqual(defaultFilter())
    expect(working.tableSort).toEqual(defaultTableSort())
    expect(working.priorityWeights).toEqual(defaultPriorityWeights())
    expect(working.dismissed).toEqual([])
    expect(working.showDismissed).toBe(false)
    expect(working.expandedIssue).toBeNull()
    expect(working.visibleColumns).toEqual(DEFAULT_VISIBLE_COLUMNS)
  })

  it('returns fresh, unshared objects each call', () => {
    const prefs = defaultPreferences()
    const a = defaultWorkingState(prefs)
    const b = defaultWorkingState(prefs)
    a.dismissed.push(1)
    a.filter.labels.push('bug')
    a.exportOptions.order.push({ key: 'number', direction: 'asc' })
    expect(b.dismissed).toEqual([])
    expect(b.filter.labels).toEqual([])
    expect(b.exportOptions.order).toHaveLength(3)
  })
})

describe('defaultAnalysis', () => {
  it('builds a fresh Analysis from repo, id, stateFilter, now and prefs', () => {
    const prefs = defaultPreferences()
    const repo = fakeRepo()
    const analysis = defaultAnalysis({
      id: 'analysis-1',
      repo,
      stateFilter: 'open',
      now: '2026-09-23T00:00:00.000Z',
      prefs,
    })

    expect(analysis.schemaVersion).toBe(1)
    expect(analysis.id).toBe('analysis-1')
    expect(analysis.name).toBe('acme/widgets (open)')
    expect(analysis.repo).toBe(repo)
    expect(analysis.stateFilter).toBe('open')
    expect(analysis.createdAt).toBe('2026-09-23T00:00:00.000Z')
    expect(analysis.updatedAt).toBe('2026-09-23T00:00:00.000Z')
    expect(analysis.fetchedAt).toBe('2026-09-23T00:00:00.000Z')
    expect(analysis.commentsFetched).toBe(false)
    expect(analysis.rows).toEqual([])
    expect(analysis.projectContext).toEqual(defaultProjectContext('acme/widgets'))
    expect(analysis.working).toEqual(defaultWorkingState(prefs))
  })

  it('returns fresh rows/working state that do not leak across calls', () => {
    const prefs = defaultPreferences()
    const repo = fakeRepo()
    const a = defaultAnalysis({ id: 'a', repo, stateFilter: 'open', now: 'x', prefs })
    const b = defaultAnalysis({ id: 'b', repo, stateFilter: 'open', now: 'x', prefs })
    a.rows.push({
      issue: {} as never,
      status: 'unclassified',
      classification: null,
      error: null,
      sourceStatus: 'present',
    })
    a.working.dismissed.push(1)
    expect(b.rows).toEqual([])
    expect(b.working.dismissed).toEqual([])
  })
})

describe('STORAGE_KEYS', () => {
  it('has no secret key', () => {
    const keys = Object.keys(STORAGE_KEYS)
    for (const key of keys) {
      expect(key.toLowerCase()).not.toMatch(/secret|jevapikey|githubtoken/)
    }
    const values = keys
      .map((key) => (STORAGE_KEYS as Record<string, unknown>)[key])
      .filter((value): value is string => typeof value === 'string')
    for (const value of values) {
      expect(value.toLowerCase()).not.toMatch(/secret|jevapikey|githubtoken/)
    }
  })

  it('every non-secret key is prefixed with STORAGE_PREFIX', () => {
    expect(STORAGE_KEYS.preferences.startsWith(STORAGE_PREFIX)).toBe(true)
    expect(STORAGE_KEYS.analysesIndex.startsWith(STORAGE_PREFIX)).toBe(true)
    expect(STORAGE_KEYS.analysis('abc').startsWith(STORAGE_PREFIX)).toBe(true)
  })

  it('analysis(id) builds a prefixed, id-specific key', () => {
    expect(STORAGE_KEYS.analysis('abc123')).toBe('local-issue-classifier:analysis:v1:abc123')
    expect(STORAGE_KEYS.analysis('abc123')).not.toBe(STORAGE_KEYS.analysis('other-id'))
  })
})
