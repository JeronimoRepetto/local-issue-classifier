import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadProgress from './LoadProgress.vue'

describe('LoadProgress', () => {
  it('shows a preparing message before any progress arrives', () => {
    expect(mount(LoadProgress, { props: { progress: null } }).text()).toContain('Preparing')
  })

  it('shows the issues page progress', () => {
    const wrapper = mount(LoadProgress, {
      props: { progress: { phase: 'issues', loaded: 300, pagesFetched: 3, totalPages: 25 } },
    })
    expect(wrapper.text()).toContain('Issues: 300 loaded (page 3 of 25)')
  })

  it('shows the comments progress', () => {
    const wrapper = mount(LoadProgress, { props: { progress: { phase: 'comments', done: 3, total: 5 } } })
    expect(wrapper.text()).toContain('Comments: 3 / 5')
  })
})
