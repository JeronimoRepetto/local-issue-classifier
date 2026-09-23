import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CostConfirm from './CostConfirm.vue'

describe('CostConfirm', () => {
  it('shows the request count and remaining quota, and emits each decision', async () => {
    const wrapper = mount(CostConfirm, { props: { requests: 9, remaining: 10 } })
    expect(wrapper.text()).toContain('Fetching comments needs ~9 requests; you have 10 left.')

    await wrapper.get('[data-test="cost-confirm-fetch"]').trigger('click')
    await wrapper.get('[data-test="cost-confirm-skip"]').trigger('click')
    await wrapper.get('[data-test="cost-confirm-cancel"]').trigger('click')
    expect(wrapper.emitted('decision')).toEqual([['fetch'], ['skip'], ['cancel']])
  })

  it('handles an unknown remaining quota', () => {
    const wrapper = mount(CostConfirm, { props: { requests: 5, remaining: null } })
    expect(wrapper.text()).toContain('you have an unknown amount left')
  })
})
