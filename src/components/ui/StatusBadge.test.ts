// Task 12 — SPEC.md §6.3 row 12: unclassified / stale / missing / dismissed.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from './StatusBadge.vue'
import type { ClassificationStatus } from '../../domain/types'

describe('StatusBadge', () => {
  it('shows the classification status by default', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'unclassified' } })
    expect(wrapper.text()).toBe('Unclassified')
  })

  it('shows every classification status', () => {
    const labels: Record<ClassificationStatus, string> = {
      unclassified: 'Unclassified',
      pending: 'Pending',
      done: 'Classified',
      error: 'Error',
      stale: 'Stale',
    }
    for (const [status, label] of Object.entries(labels) as [ClassificationStatus, string][]) {
      expect(mount(StatusBadge, { props: { status } }).text()).toBe(label)
    }
  })

  it('missing takes priority over the classification status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'done', missing: true } })
    expect(wrapper.text()).toBe('No longer in source')
  })

  it('dismissed takes priority over missing and the classification status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'done', missing: true, dismissed: true } })
    expect(wrapper.text()).toBe('Dismissed')
  })

  it('exposes the same text as an accessible name', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'stale' } })
    expect(wrapper.attributes('aria-label')).toBe('Status: Stale')
  })
})
