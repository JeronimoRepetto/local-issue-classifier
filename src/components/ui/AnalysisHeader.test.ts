// Task 12 — SPEC.md §2.5 item 2/4, §6.1 screen 3: name, repo, fetched-at,
// "K of N issues" / "K of N issues (D dismissed)", Refresh and back as
// props/emits only (no useRepo import — enforced structurally by not
// importing any composable here).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AnalysisHeader from './AnalysisHeader.vue'

function mountHeader(props: Record<string, unknown> = {}) {
  return mount(AnalysisHeader, {
    props: {
      name: 'acme/widgets (open)',
      repoFullName: 'acme/widgets',
      fetchedAt: '2026-03-01T00:00:00Z',
      visibleCount: 3,
      totalCount: 10,
      dismissedCount: 0,
      showDismissed: false,
      ...props,
    },
  })
}

describe('AnalysisHeader', () => {
  it('shows the analysis name and repo', () => {
    const wrapper = mountHeader()
    expect(wrapper.text()).toContain('acme/widgets (open)')
    expect(wrapper.text()).toContain('acme/widgets')
  })

  it('shows "K of N issues" when Show dismissed is off', () => {
    const wrapper = mountHeader({ visibleCount: 3, totalCount: 10, dismissedCount: 2, showDismissed: false })
    expect(wrapper.get('[data-test="issue-count"]').text()).toBe('3 of 10 issues')
  })

  it('shows "K of N issues (D dismissed)" when Show dismissed is on', () => {
    const wrapper = mountHeader({ visibleCount: 5, totalCount: 10, dismissedCount: 2, showDismissed: true })
    expect(wrapper.get('[data-test="issue-count"]').text()).toBe('5 of 10 issues (2 dismissed)')
  })

  it('emits back when the Analyses button is clicked', async () => {
    const wrapper = mountHeader()
    await wrapper.get('[data-test="back"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('emits refresh when Refresh is clicked, and shows a loading state while refreshing', async () => {
    const wrapper = mountHeader({ refreshing: true })
    const refresh = wrapper.get('[data-test="refresh"]')
    expect(refresh.attributes('aria-busy')).toBe('true')
    await refresh.trigger('click')
    expect(wrapper.emitted('refresh')).toBeUndefined() // disabled/loading; no double-submit

    const idle = mountHeader({ refreshing: false })
    await idle.get('[data-test="refresh"]').trigger('click')
    expect(idle.emitted('refresh')).toHaveLength(1)
  })

  it('never imports a composable (props/emits only)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const source = readFileSync(join(__dirname, 'AnalysisHeader.vue'), 'utf8')
    expect(source).not.toMatch(/from\s+['"][^'"]*(useRepo|useAnalysis)['"]/)
  })
})
