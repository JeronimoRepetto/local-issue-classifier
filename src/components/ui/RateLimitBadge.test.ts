import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RateLimitBadge from './RateLimitBadge.vue'

describe('RateLimitBadge', () => {
  it('shows unknown when the rate limit has not been observed yet', () => {
    const wrapper = mount(RateLimitBadge, { props: { remaining: null, limit: null } })
    expect(wrapper.text()).toBe('GitHub quota: unknown')
    expect(wrapper.classes()).toContain('rate-limit-badge--unknown')
  })

  it('formats the remaining count and grades ok / warning / critical', () => {
    expect(mount(RateLimitBadge, { props: { remaining: 4612, limit: 5000 } }).classes()).toContain(
      'rate-limit-badge--ok',
    )
    expect(mount(RateLimitBadge, { props: { remaining: 900, limit: 5000 } }).text()).toBe('GitHub quota: 900 left')
    expect(mount(RateLimitBadge, { props: { remaining: 900, limit: 5000 } }).classes()).toContain(
      'rate-limit-badge--warning',
    )
    expect(mount(RateLimitBadge, { props: { remaining: 0, limit: 5000 } }).classes()).toContain(
      'rate-limit-badge--critical',
    )
  })
})
