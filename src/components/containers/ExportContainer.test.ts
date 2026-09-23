// Task 13 — SPEC.md §2.6: the Export dialog. Wires useExport() to a UiDialog:
// scope, include-dismissed/unclassified/confidence/urls, the shared
// SortRuleList order editor, "Use current table sort", a preview and Download.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createAnalysis } from '../../domain/analysis'
import type { Analysis } from '../../domain/types'
import { defaultPreferences, defaultProjectContext } from '../../domain/types'
import { fakeClassification, fakeIssue, fakeRepo } from '../../../tests/fakes/domainFixtures'
import { MemoryStorage } from '../../../tests/fakes/memoryStorage'

vi.mock('../../adapters/download', () => ({ downloadText: vi.fn() }))

type AnalysisModule = typeof import('../../composables/useAnalysis')
type ExportModule = typeof import('../../composables/useExport')
type DownloadModule = typeof import('../../adapters/download')
type ContainerModule = typeof import('./ExportContainer.vue')

let storage: MemoryStorage
let analysisMod: AnalysisModule
let exportMod: ExportModule
let downloadMod: DownloadModule
let ExportContainer: ContainerModule['default']

function seedAnalysis(id = 'a1'): Analysis {
  const analysis = createAnalysis({
    id,
    repo: fakeRepo(),
    stateFilter: 'open',
    now: '2026-03-01T10:00:00Z',
    prefs: defaultPreferences(),
    projectContext: defaultProjectContext('acme/widgets'),
    issues: [fakeIssue(1, { title: 'Crash on empty list' }), fakeIssue(2, { title: 'Improve docs' })],
    commentsFetched: false,
  })
  analysis.rows[0].status = 'done'
  analysis.rows[0].classification = fakeClassification()
  return analysis
}

async function freshEnv() {
  vi.resetModules()
  storage = new MemoryStorage()
  const storageModule = await import('../../adapters/storage/appStorage')
  storageModule.setAppStorage(storage)
  analysisMod = await import('../../composables/useAnalysis')
  analysisMod.configureAnalysis({ clock: () => '2026-03-05T00:00:00Z' })
  exportMod = await import('../../composables/useExport')
  exportMod.configureExport({ clock: () => new Date('2026-09-23T14:05:00') })
  downloadMod = await import('../../adapters/download')
  const mod: ContainerModule = await import('./ExportContainer.vue')
  ExportContainer = mod.default
}

const flush = async () => {
  await nextTick()
  await nextTick()
}

describe('ExportContainer', () => {
  beforeEach(async () => {
    await freshEnv()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  // UiDialog teleports its content to document.body, so it is queried there
  // rather than through the mounted wrapper (same pattern as IssuesContainer.test.ts).

  it('renders the dialog with scope, options and a preview when open', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector('[data-test="export-preview-text"]')?.textContent).toContain(
      'local-issue-classifier report',
    )
  })

  it('toggling "Include dismissed" persists into the analysis working state', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    const checkbox = document.querySelector('[data-test="export-include-dismissed"]') as HTMLInputElement
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await flush()
    expect(analysisMod.useAnalysis().current.value?.working.exportOptions.includeDismissed).toBe(true)
  })

  it('"Use current table sort" copies the table sort into the export order', async () => {
    const analysis = seedAnalysis()
    analysisMod.useAnalysis().setCurrent(analysis)
    analysisMod.useAnalysis().updateWorking({ tableSort: [{ key: 'number', direction: 'asc' }] })
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    ;(document.querySelector('[data-test="export-use-table-sort"]') as HTMLButtonElement).click()
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.exportOptions.order).toEqual([
      { key: 'number', direction: 'asc' },
    ])
  })

  it('disables Download and shows "Nothing to export" when the scope is empty', async () => {
    const analysis = seedAnalysis()
    analysis.rows[0].classification = null
    analysis.rows[0].status = 'unclassified'
    analysis.rows[1].status = 'unclassified'
    analysisMod.useAnalysis().setCurrent(analysis)
    analysisMod.useAnalysis().updateWorking({
      exportOptions: { ...analysis.working.exportOptions, includeUnclassified: false },
    })
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    expect(document.querySelector('[data-test="export-empty"]')?.textContent).toContain('Nothing to export')
    expect((document.querySelector('[data-test="export-download"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('Download calls downloadText with the current preview and filename', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    ;(document.querySelector('[data-test="export-download"]') as HTMLButtonElement).click()
    expect(downloadMod.downloadText).toHaveBeenCalledWith(
      expect.stringContaining('local-issue-classifier report'),
      'acme-widgets-issues-20260923-1405.txt',
    )
  })

  it('emits close when cancelled', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    const wrapper = mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    ;(document.querySelector('[data-test="dialog-close"]') as HTMLButtonElement).click()
    await flush()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
