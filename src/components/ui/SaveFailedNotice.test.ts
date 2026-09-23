import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SaveFailedNotice from './SaveFailedNotice.vue'

describe('SaveFailedNotice', () => {
  it('shows the quota message and emits retry', async () => {
    const wrapper = mount(SaveFailedNotice, { props: { reason: 'quota' } })
    expect(wrapper.text()).toContain('browser storage is full')
    expect(wrapper.attributes('role')).toBe('alert')
    await wrapper.get('[data-test="retry-save"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('shows a different message when storage is unavailable', () => {
    const wrapper = mount(SaveFailedNotice, { props: { reason: 'unavailable' } })
    expect(wrapper.text()).toContain('browser storage is unavailable')
  })
})
