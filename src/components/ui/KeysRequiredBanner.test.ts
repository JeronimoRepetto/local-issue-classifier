// Task 4 — SPEC.md §2.1 step 2: the "Keys required" banner. Presentational:
// props/emits only, no store access.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KeysRequiredBanner from './KeysRequiredBanner.vue'

describe('KeysRequiredBanner', () => {
  it('explains that keys are in-memory only and that saved analyses stay available', () => {
    const wrapper = mount(KeysRequiredBanner)
    expect(wrapper.text()).toContain('kept in memory only')
    expect(wrapper.text()).toContain('cleared when this page reloads')
    expect(wrapper.text()).toContain('Your saved analyses are still here')
  })

  it('is a status region, not an error', () => {
    const wrapper = mount(KeysRequiredBanner)
    expect(wrapper.get('[role="status"]')).toBeTruthy()
  })

  it('emits dismiss from its close action', async () => {
    const wrapper = mount(KeysRequiredBanner)
    await wrapper.get('[data-test="dismiss-banner"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
