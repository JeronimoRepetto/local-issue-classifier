// Task 13 — SPEC.md §2.6: a read-only preview of the export text. Presentational.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ExportPreview from './ExportPreview.vue'

describe('ExportPreview', () => {
  it('renders the given text verbatim in a monospace, read-only block', () => {
    const wrapper = mount(ExportPreview, { props: { text: 'issue-criticity report\nline two' } })
    const pre = wrapper.get('[data-test="export-preview-text"]')
    expect(pre.text()).toContain('issue-criticity report')
    expect(pre.text()).toContain('line two')
  })

  it('shows an empty-state message instead of a blank block when there is nothing to preview', () => {
    const wrapper = mount(ExportPreview, { props: { text: '' } })
    expect(wrapper.find('[data-test="export-preview-text"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Nothing to preview yet')
  })
})
