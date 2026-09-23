import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import { useView } from './composables/useView'

describe('App', () => {
  beforeEach(() => {
    useView().goHome()
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('mounts and shows the wordmark, with Home as the default view', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('issue-criticity')
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(true)
  })

  it('the Settings gear switches to the (placeholder) Settings view, and the brand returns home', async () => {
    const wrapper = mount(App)
    await wrapper.get('[data-test="open-settings"]').trigger('click')
    expect(wrapper.find('[data-test="settings-placeholder"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(false)

    await wrapper.get('[data-test="brand"]').trigger('click')
    expect(wrapper.find('[data-test="home-container"]').exists()).toBe(true)
  })

  it('shows the (placeholder) analysis view once an analysis is opened', async () => {
    useView().state.view = 'analysis'
    const wrapper = mount(App)
    expect(wrapper.find('[data-test="analysis-view-placeholder"]').exists()).toBe(true)
  })
})
