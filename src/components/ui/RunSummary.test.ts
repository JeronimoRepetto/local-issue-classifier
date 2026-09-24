// Task 11 — the end-of-run summary.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RunSummary from './RunSummary.vue'
import type { RunSummary as Summary } from '../../domain/classifyRun'

const summary = (overrides: Partial<Summary> = {}): Summary => ({
  status: 'completed',
  total: 10,
  classified: 8,
  failed: 2,
  skipped: 0,
  lowConfidence: 1,
  inputTokens: 32_000,
  failedNumbers: [3, 7],
  elapsedMs: 12_000,
  ...overrides,
})

describe('RunSummary', () => {
  it('reads "N classified · F failed · L low-confidence"', () => {
    const wrapper = mount(RunSummary, { props: { summary: summary() } })
    expect(wrapper.get('[data-test="summary-counts"]').text()).toBe('8 classified · 2 failed · 1 low-confidence')
  })

  it('adds skipped issues and a cancelled title after a cancel', () => {
    const wrapper = mount(RunSummary, { props: { summary: summary({ status: 'cancelled', failed: 0, skipped: 2 }) } })
    expect(wrapper.text()).toContain('Classification cancelled')
    expect(wrapper.get('[data-test="summary-counts"]').text()).toBe(
      '8 classified · 0 failed · 1 low-confidence · 2 skipped',
    )
  })

  it('explains an authentication failure', () => {
    const wrapper = mount(RunSummary, { props: { summary: summary({ status: 'auth-failed' }) } })
    expect(wrapper.text()).toContain('The Jev key was rejected')
  })

  it('offers Retry failed only when something failed', async () => {
    const wrapper = mount(RunSummary, { props: { summary: summary() } })
    await wrapper.get('[data-test="summary-retry"]').trigger('click')
    expect(wrapper.emitted('retry-failed')).toHaveLength(1)
    const clean = mount(RunSummary, { props: { summary: summary({ failed: 0, failedNumbers: [] }) } })
    expect(clean.find('[data-test="summary-retry"]').exists()).toBe(false)
  })

  it('emits dismiss', async () => {
    const wrapper = mount(RunSummary, { props: { summary: summary() } })
    await wrapper.get('[data-test="summary-dismiss"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
