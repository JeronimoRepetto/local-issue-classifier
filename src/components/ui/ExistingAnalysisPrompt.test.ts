import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ExistingAnalysisPrompt from './ExistingAnalysisPrompt.vue'

describe('ExistingAnalysisPrompt', () => {
  it('states the repo and filter, and emits each decision', async () => {
    const wrapper = mount(ExistingAnalysisPrompt, { props: { repoFullName: 'acme/widgets', stateFilter: 'open' } })
    expect(wrapper.text()).toContain('An analysis of acme/widgets (open) exists.')

    await wrapper.get('[data-test="existing-open"]').trigger('click')
    await wrapper.get('[data-test="existing-refresh"]').trigger('click')
    await wrapper.get('[data-test="existing-create"]').trigger('click')
    expect(wrapper.emitted('decision')).toEqual([['open'], ['refresh'], ['create']])
  })
})
