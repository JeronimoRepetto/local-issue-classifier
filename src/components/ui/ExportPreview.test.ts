// Task 13 — a read-only preview of the export text. Presentational.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ExportPreview from './ExportPreview.vue'

describe('ExportPreview', () => {
  it('renders the given text verbatim in a monospace, read-only block', () => {
    const wrapper = mount(ExportPreview, { props: { text: 'local-issue-classifier report\nline two' } })
    const pre = wrapper.get('[data-test="export-preview-text"]')
    expect(pre.text()).toContain('local-issue-classifier report')
    expect(pre.text()).toContain('line two')
  })

  it('shows an empty-state message instead of a blank block when there is nothing to preview', () => {
    const wrapper = mount(ExportPreview, { props: { text: '' } })
    expect(wrapper.find('[data-test="export-preview-text"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Nothing to preview yet')
  })

  it('shows no format note for the default "text" format', () => {
    const wrapper = mount(ExportPreview, { props: { text: 'local-issue-classifier report' } })
    expect(wrapper.find('[data-test="export-preview-note"]').exists()).toBe(false)
  })

  it('notes that the preview is raw Markdown source when format is "markdown"', () => {
    const wrapper = mount(ExportPreview, { props: { text: '# report', format: 'markdown' } })
    expect(wrapper.get('[data-test="export-preview-note"]').text()).toContain('Markdown')
  })

  it('notes that the preview is raw HTML source when format is "html"', () => {
    const wrapper = mount(ExportPreview, { props: { text: '<!doctype html>', format: 'html' } })
    expect(wrapper.get('[data-test="export-preview-note"]').text()).toContain('HTML')
  })

  it('shows no format note when there is nothing to preview, even for a non-text format', () => {
    const wrapper = mount(ExportPreview, { props: { text: '', format: 'markdown' } })
    expect(wrapper.find('[data-test="export-preview-note"]').exists()).toBe(false)
  })
})
