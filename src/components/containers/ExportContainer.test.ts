// Task 13 — the Export dialog. Wires useExport() to a UiDialog:
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
      'Issue Classifier report',
    )
  })

  it('describes the dialog format-neutrally: no "plain-text" wording and no repo-internal doc path', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    const description = document.querySelector('.ui-dialog__description')?.textContent ?? ''
    expect(description).not.toMatch(/plain-text/i)
    expect(description).not.toMatch(/docs\//)
  })

  it('lays the dialog out as labelled rows: scope, include, format, order and preview', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    const keys = [...document.querySelectorAll('.export-container__row > .export-container__key')].map((el) =>
      el.textContent?.trim(),
    )
    expect(keys).toEqual(['Scope', 'Include', 'Format', 'Order', 'Preview'])
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

    // "Use current table sort" only applies to a custom order (orderMode: 'table' is the default).
    ;(document.querySelector('[data-test="segment-custom"]') as HTMLButtonElement).click()
    await flush()
    ;(document.querySelector('[data-test="export-use-table-sort"]') as HTMLButtonElement).click()
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.exportOptions.order).toEqual([
      { key: 'number', direction: 'asc' },
    ])
  })

  it('the Order control defaults to "Same as table" and only reveals the rule list in Custom', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    expect(document.querySelector('[data-test="segment-table"]')?.getAttribute('aria-checked')).toBe('true')
    expect(document.querySelector('.sort-rule-list')).toBeNull()
    expect(document.querySelector('[data-test="export-use-table-sort"]')).toBeNull()

    ;(document.querySelector('[data-test="segment-custom"]') as HTMLButtonElement).click()
    await flush()

    expect(document.querySelector('.sort-rule-list')).not.toBeNull()
    expect(document.querySelector('[data-test="export-use-table-sort"]')).not.toBeNull()
    expect(analysisMod.useAnalysis().current.value?.working.exportOptions.orderMode).toBe('custom')
  })

  it('disables Download and shows "Nothing to export" when the scope is empty (Custom, includeUnclassified off)', async () => {
    const analysis = seedAnalysis()
    analysis.rows[0].classification = null
    analysis.rows[0].status = 'unclassified'
    analysis.rows[1].status = 'unclassified'
    analysisMod.useAnalysis().setCurrent(analysis)
    // orderMode: 'table' (the default) always shows unclassified rows that
    // pass the working filter, so this needs Custom mode to exercise
    // includeUnclassified: false.
    analysisMod.useAnalysis().updateWorking({
      exportOptions: { ...analysis.working.exportOptions, orderMode: 'custom', includeUnclassified: false },
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
      expect.stringContaining('Issue Classifier report'),
      'acme-widgets-issues-20260923-1405.txt',
    )
  })

  it('the Format control defaults to Text, and switching to Markdown persists and updates the preview', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    expect(document.querySelector('[data-test="segment-text"]')?.getAttribute('aria-checked')).toBe('true')

    ;(document.querySelector('[data-test="segment-markdown"]') as HTMLButtonElement).click()
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.exportOptions.format).toBe('markdown')
    expect(document.querySelector('[data-test="export-preview-text"]')?.textContent).toContain(
      '# Issue Classifier report',
    )
    expect(document.querySelector('[data-test="export-preview-note"]')?.textContent).toContain('Markdown')
  })

  it('switching Format to HTML persists, updates the preview, and downloads as .html', async () => {
    analysisMod.useAnalysis().setCurrent(seedAnalysis())
    mount(ExportContainer, { props: { open: true }, attachTo: document.body })
    await flush()

    ;(document.querySelector('[data-test="segment-html"]') as HTMLButtonElement).click()
    await flush()

    expect(analysisMod.useAnalysis().current.value?.working.exportOptions.format).toBe('html')
    expect(document.querySelector('[data-test="export-preview-text"]')?.textContent).toContain('<!doctype html>')

    ;(document.querySelector('[data-test="export-download"]') as HTMLButtonElement).click()
    expect(downloadMod.downloadText).toHaveBeenCalledWith(
      expect.stringContaining('<!doctype html>'),
      'acme-widgets-issues-20260923-1405.html',
      'text/html;charset=utf-8',
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
