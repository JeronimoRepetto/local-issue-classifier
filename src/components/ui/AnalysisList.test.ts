import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AnalysisList from './AnalysisList.vue'
import type { IndexEntry } from './AnalysisCard.vue'

function entry(id: string): IndexEntry {
  return {
    status: 'ok',
    summary: {
      id,
      name: `acme/${id} (open)`,
      repoFullName: `acme/${id}`,
      stateFilter: 'open',
      fetchedAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      counts: { total: 1, classified: 0, stale: 0, dismissed: 0, missing: 0 },
      approxBytes: 100,
    },
  }
}

describe('AnalysisList', () => {
  it('shows the empty state when there are no saved analyses', () => {
    const wrapper = mount(AnalysisList, { props: { entries: [] } })
    expect(wrapper.text()).toContain('No saved analyses yet')
    expect(wrapper.text()).toContain('Paste a GitHub repository URL to start.')
  })

  it('renders one card per entry and forwards its events', async () => {
    const wrapper = mount(AnalysisList, { props: { entries: [entry('a1'), entry('a2')] } })
    expect(wrapper.findAll('[data-test="analysis-card"]')).toHaveLength(2)

    await wrapper.findAll('[data-test="analysis-card"]')[0].trigger('click')
    expect(wrapper.emitted('open')).toEqual([['a1']])
  })
})
